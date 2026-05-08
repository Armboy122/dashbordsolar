import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const reportDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "Planreport_All");
const connectionString = readEnv("NEON_DB");

if (!connectionString) {
  console.error("Missing NEON_DB in .env");
  process.exit(1);
}

const sql = neon(connectionString);

await ensureSchema();

const files = fs
  .readdirSync(reportDir)
  .filter((name) => /\.xlsx?$/i.test(name))
  .map((name) => path.join(reportDir, name))
  .sort((a, b) => inferMonth(a).localeCompare(inferMonth(b)));

if (!files.length) {
  console.error(`No Excel files found in ${reportDir}`);
  process.exit(1);
}

const allRows = [];
let importedFiles = 0;

for (const file of files) {
  const reportMonth = inferMonth(file);
  const rows = parseWorkbook(file, reportMonth);
  const scoredRows = scorePeer(rows);

  const importFile = await sql`
    insert into import_files (filename, report_month, status)
    values (${path.basename(file)}, ${reportMonth}, 'imported')
    returning id
  `;
  const importFileId = String(importFile[0].id);

  for (const row of scoredRows) {
    const site = await sql`
      insert into sites (name, address, capacity_kwp)
      values (${row.plantName}, ${row.address || null}, ${num(row.capacityKwp)})
      on conflict (name) do update set
        address = excluded.address,
        capacity_kwp = excluded.capacity_kwp
      returning id
    `;

    row.siteId = String(site[0].id);
    row.importFileId = importFileId;

    await upsertMonthlyReport(row);
    allRows.push(row);
  }

  importedFiles += 1;
  console.log(`Imported ${path.basename(file)}: ${rows.length} rows`);
}

const historicalRows = buildHistoricalScores(allRows);
for (const row of historicalRows) {
  await upsertMonthlyAnalysis(row);
}

const latestMonth = historicalRows.map((row) => row.reportMonth).sort().at(-1);
const latestSummary = historicalRows.filter((row) => row.reportMonth === latestMonth);

console.log("");
console.log(`Done. Files: ${importedFiles}, monthly rows: ${allRows.length}, analysis rows: ${historicalRows.length}`);
console.log(`Latest month: ${latestMonth}`);
console.log(
  `Latest risk: critical=${latestSummary.filter((row) => row.historyRiskLevel === "critical").length}, high=${latestSummary.filter((row) => row.historyRiskLevel === "high").length}, watch=${latestSummary.filter((row) => row.historyRiskLevel === "watch").length}, normal=${latestSummary.filter((row) => row.historyRiskLevel === "normal").length}`,
);

function readEnv(key) {
  const envPath = path.join(root, ".env");
  if (process.env[key]) return process.env[key];
  if (!fs.existsSync(envPath)) return "";

  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((item) => item.trim().startsWith(`${key}=`));

  return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : "";
}

async function ensureSchema() {
  await sql`create extension if not exists pgcrypto`;
  await sql`
    create table if not exists sites (
      id uuid primary key default gen_random_uuid(),
      name text not null unique,
      code text,
      address text,
      capacity_kwp numeric,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists import_files (
      id uuid primary key default gen_random_uuid(),
      filename text not null,
      report_month text not null,
      status text not null default 'imported',
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists monthly_reports (
      id uuid primary key default gen_random_uuid(),
      site_id uuid references sites(id),
      site_name text not null,
      report_month text not null,
      capacity_kwp numeric,
      pv_yield_kwh numeric,
      inverter_yield_kwh numeric,
      export_kwh numeric,
      import_kwh numeric,
      specific_energy numeric,
      consumption_kwh numeric,
      self_consumption_kwh numeric,
      self_consumption_rate numeric,
      peak_power_kw numeric,
      peak_ratio numeric,
      revenue_baht numeric,
      risk_score numeric,
      risk_level text,
      reasons_json text,
      actions_json text,
      import_file_id uuid references import_files(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (site_name, report_month)
    )
  `;
  await sql`create index if not exists monthly_reports_month_idx on monthly_reports(report_month)`;
  await sql`
    create table if not exists monthly_analysis (
      id uuid primary key default gen_random_uuid(),
      site_name text not null,
      report_month text not null,
      specific_energy numeric,
      pv_yield_kwh numeric,
      peak_ratio numeric,
      peer_median_specific numeric,
      peer_percent numeric,
      prev_specific_energy numeric,
      trailing3_specific_avg numeric,
      trailing12_specific_avg numeric,
      yoy_specific_energy numeric,
      own_history_percent numeric,
      yoy_percent numeric,
      history_risk_score numeric,
      history_risk_level text,
      history_reasons_json text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (site_name, report_month)
    )
  `;
  await sql`create index if not exists monthly_analysis_month_idx on monthly_analysis(report_month)`;
}

function parseWorkbook(file, reportMonth) {
  const workbook = readWorkbook(file);
  const rows = [];

  for (const sheetName of workbook.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: false });
    rows.push(...parseRows(sheetRows, reportMonth));
  }

  if (!rows.length) {
    throw new Error(`No plant rows found in ${file}`);
  }

  return rows;
}

function readWorkbook(file) {
  const originalWarn = console.warn;
  const originalError = console.error;
  const filter = (...args) => {
    const first = String(args[0] || "");
    return !first.startsWith("Bad uncompressed size:");
  };

  console.warn = (...args) => {
    if (filter(...args)) originalWarn(...args);
  };
  console.error = (...args) => {
    if (filter(...args)) originalError(...args);
  };

  try {
    return XLSX.readFile(file);
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
}

function parseRows(rows, reportMonth) {
  const headerIndex = rows.findIndex((row) => row.map(normalizeHeader).includes("plant name"));

  if (headerIndex >= 0) {
    const headers = rows[headerIndex].map((header) => String(header || "").replace(/\s+/g, " ").trim());
    return rows
      .slice(headerIndex + 1)
      .filter((row) => row.some((cell) => cell !== null && cell !== ""))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])))
      .map((record) => ({
        plantName: String(record["Plant Name"] || "").trim(),
        address: String(record.Address || "").trim(),
        capacityKwp: toNumber(record["Total String Capacity (kWp)"]),
        pvYieldKwh: toNumber(record["PV Yield (kWh)"]),
        inverterYieldKwh: toNumber(record[" Inverter Yield (kWh)"] ?? record["Inverter Yield (kWh)"]),
        exportKwh: toNumber(record["Export (kWh)"]),
        importKwh: toNumber(record["Import (kWh)"]),
        specificEnergy: toNumber(record["Specific Energy (kWh/kWp)"]),
        consumptionKwh: toNumber(record["Consumption (kWh)"]),
        selfConsumptionKwh: toNumber(record["Self-consumption (kWh)"]),
        selfConsumptionRate: toNumber(record["Self-consumption Rate (%)"]),
        peakPowerKw: toNumber(record["Peak Power (kW)"]),
        revenueBaht: toNumber(record["Revenue (฿)"]),
        reportMonth,
      }))
      .filter((row) => row.plantName);
  }

  return rows
    .filter((row) => isFusionSolarDataRow(row))
    .map((row) => ({
      plantName: String(row[0] || "").trim(),
      address: String(row[1] || "").trim(),
      capacityKwp: toNumber(row[2]),
      pvYieldKwh: toNumber(row[7]),
      inverterYieldKwh: toNumber(row[8]),
      exportKwh: toNumber(row[9]),
      importKwh: toNumber(row[10]),
      specificEnergy: toNumber(row[11]),
      consumptionKwh: toNumber(row[14]),
      selfConsumptionKwh: toNumber(row[15]),
      selfConsumptionRate: toNumber(row[16]),
      peakPowerKw: toNumber(row[17]),
      revenueBaht: toNumber(row[23]),
      reportMonth,
    }));
}

function scorePeer(rows) {
  const peerMedian = median(rows.map((row) => row.specificEnergy).filter((value) => value > 0));

  return rows.map((row) => {
    const peakRatio = safeDivide(row.peakPowerKw, row.capacityKwp);
    const peerPercent = safeDivide(row.specificEnergy, peerMedian);
    const reasons = [];
    let score = 0;

    if (!row.capacityKwp || row.capacityKwp <= 0) {
      score += 50;
      reasons.push("capacity เป็น 0 หรือ master data ยังไม่ครบ");
    }
    if (!row.pvYieldKwh || row.pvYieldKwh <= 0) {
      score += 55;
      reasons.push("เดือนนี้ไม่มี production");
    }
    if (peerPercent !== null && peerPercent < 0.7) {
      score += peerPercent < 0.45 ? 45 : 30;
      reasons.push(`specific yield ต่ำกว่าค่ากลาง portfolio ${Math.round((1 - peerPercent) * 100)}%`);
    }
    if (peakRatio !== null && peakRatio < 0.65) {
      score += peakRatio < 0.45 ? 35 : 22;
      reasons.push(`peak ratio ต่ำ ${(peakRatio * 100).toFixed(0)}%`);
    }
    if (!reasons.length) reasons.push("ปกติเมื่อเทียบกับ portfolio ในเดือนเดียวกัน");

    return {
      ...row,
      peerMedian,
      peerPercent,
      peakRatio,
      riskScore: Math.min(100, Math.round(score)),
      riskLevel: riskLevel(score),
      reasons,
      actions: ["ใช้ historical baseline เพื่อยืนยันก่อนส่งทีมเข้าหน้างาน"],
    };
  });
}

function buildHistoricalScores(rows) {
  const bySite = new Map();
  for (const row of rows) {
    if (!bySite.has(row.plantName)) bySite.set(row.plantName, []);
    bySite.get(row.plantName).push(row);
  }

  const results = [];

  for (const siteRows of bySite.values()) {
    siteRows.sort((a, b) => a.reportMonth.localeCompare(b.reportMonth));
    const byMonth = new Map(siteRows.map((row) => [row.reportMonth, row]));

    siteRows.forEach((row, index) => {
      const prevRows = siteRows.slice(Math.max(0, index - 3), index).filter((item) => item.specificEnergy && item.specificEnergy > 0);
      const prev12Rows = siteRows.slice(Math.max(0, index - 12), index).filter((item) => item.specificEnergy && item.specificEnergy > 0);
      const prev = index > 0 ? siteRows[index - 1] : null;
      const yoy = byMonth.get(previousYearMonth(row.reportMonth));
      const trailing3 = average(prevRows.map((item) => item.specificEnergy));
      const trailing12 = average(prev12Rows.map((item) => item.specificEnergy));
      const ownHistoryPercent = safeDivide(row.specificEnergy, trailing3 ?? trailing12);
      const yoyPercent = safeDivide(row.specificEnergy, yoy?.specificEnergy ?? null);
      const reasons = [];
      let score = 0;

      if (!row.pvYieldKwh || row.pvYieldKwh <= 0) {
        score += 60;
        reasons.push("ผลิตเป็น 0 ในเดือนนี้");
      }
      if (ownHistoryPercent !== null) {
        if (ownHistoryPercent < 0.5) {
          score += 50;
          reasons.push(`ต่ำกว่า baseline ตัวเอง ${Math.round((1 - ownHistoryPercent) * 100)}%`);
        } else if (ownHistoryPercent < 0.7) {
          score += 35;
          reasons.push(`ต่ำกว่า baseline ตัวเอง ${Math.round((1 - ownHistoryPercent) * 100)}%`);
        } else if (ownHistoryPercent < 0.85) {
          score += 18;
          reasons.push(`ต่ำกว่า baseline ตัวเอง ${Math.round((1 - ownHistoryPercent) * 100)}%`);
        }
      } else {
        reasons.push("ยังไม่มี baseline ย้อนหลังพอสำหรับไซต์นี้");
      }
      if (yoyPercent !== null && yoyPercent < 0.75) {
        score += yoyPercent < 0.55 ? 30 : 15;
        reasons.push(`ต่ำกว่าเดือนเดียวกันปีก่อน ${Math.round((1 - yoyPercent) * 100)}%`);
      }
      if (row.peakRatio !== null && row.peakRatio < 0.55) {
        score += 20;
        reasons.push(`peak ratio ต่ำ ${(row.peakRatio * 100).toFixed(0)}%`);
      }
      if (row.peerPercent !== null && row.peerPercent < 0.55) {
        score += 10;
        reasons.push("ต่ำกว่าไซต์อื่นในเดือนเดียวกันมาก");
      }
      if (!reasons.length) {
        reasons.push("เดือนล่าสุดยังอยู่ในกรอบปกติของไซต์นี้");
      }

      results.push({
        ...row,
        prevSpecificEnergy: prev?.specificEnergy ?? null,
        trailing3SpecificAvg: trailing3,
        trailing12SpecificAvg: trailing12,
        yoySpecificEnergy: yoy?.specificEnergy ?? null,
        ownHistoryPercent,
        yoyPercent,
        historyRiskScore: Math.min(100, Math.round(score)),
        historyRiskLevel: riskLevel(score),
        historyReasons: reasons,
      });
    });
  }

  return results;
}

async function upsertMonthlyReport(row) {
  await sql`
    insert into monthly_reports (
      site_id, site_name, report_month, capacity_kwp, pv_yield_kwh, inverter_yield_kwh,
      export_kwh, import_kwh, specific_energy, consumption_kwh, self_consumption_kwh,
      self_consumption_rate, peak_power_kw, peak_ratio, revenue_baht, risk_score,
      risk_level, reasons_json, actions_json, import_file_id
    )
    values (
      ${row.siteId}, ${row.plantName}, ${row.reportMonth}, ${num(row.capacityKwp)}, ${num(row.pvYieldKwh)},
      ${num(row.inverterYieldKwh)}, ${num(row.exportKwh)}, ${num(row.importKwh)}, ${num(row.specificEnergy)},
      ${num(row.consumptionKwh)}, ${num(row.selfConsumptionKwh)}, ${num(row.selfConsumptionRate)},
      ${num(row.peakPowerKw)}, ${num(row.peakRatio)}, ${num(row.revenueBaht)}, ${row.riskScore},
      ${row.riskLevel}, ${JSON.stringify(row.reasons)}, ${JSON.stringify(row.actions)}, ${row.importFileId}
    )
    on conflict (site_name, report_month) do update set
      site_id = excluded.site_id,
      capacity_kwp = excluded.capacity_kwp,
      pv_yield_kwh = excluded.pv_yield_kwh,
      inverter_yield_kwh = excluded.inverter_yield_kwh,
      export_kwh = excluded.export_kwh,
      import_kwh = excluded.import_kwh,
      specific_energy = excluded.specific_energy,
      consumption_kwh = excluded.consumption_kwh,
      self_consumption_kwh = excluded.self_consumption_kwh,
      self_consumption_rate = excluded.self_consumption_rate,
      peak_power_kw = excluded.peak_power_kw,
      peak_ratio = excluded.peak_ratio,
      revenue_baht = excluded.revenue_baht,
      risk_score = excluded.risk_score,
      risk_level = excluded.risk_level,
      reasons_json = excluded.reasons_json,
      actions_json = excluded.actions_json,
      import_file_id = excluded.import_file_id,
      updated_at = now()
  `;
}

async function upsertMonthlyAnalysis(row) {
  await sql`
    insert into monthly_analysis (
      site_name, report_month, specific_energy, pv_yield_kwh, peak_ratio,
      peer_median_specific, peer_percent, prev_specific_energy, trailing3_specific_avg,
      trailing12_specific_avg, yoy_specific_energy, own_history_percent, yoy_percent,
      history_risk_score, history_risk_level, history_reasons_json
    )
    values (
      ${row.plantName}, ${row.reportMonth}, ${num(row.specificEnergy)}, ${num(row.pvYieldKwh)}, ${num(row.peakRatio)},
      ${num(row.peerMedian)}, ${num(row.peerPercent)}, ${num(row.prevSpecificEnergy)}, ${num(row.trailing3SpecificAvg)},
      ${num(row.trailing12SpecificAvg)}, ${num(row.yoySpecificEnergy)}, ${num(row.ownHistoryPercent)}, ${num(row.yoyPercent)},
      ${row.historyRiskScore}, ${row.historyRiskLevel}, ${JSON.stringify(row.historyReasons)}
    )
    on conflict (site_name, report_month) do update set
      specific_energy = excluded.specific_energy,
      pv_yield_kwh = excluded.pv_yield_kwh,
      peak_ratio = excluded.peak_ratio,
      peer_median_specific = excluded.peer_median_specific,
      peer_percent = excluded.peer_percent,
      prev_specific_energy = excluded.prev_specific_energy,
      trailing3_specific_avg = excluded.trailing3_specific_avg,
      trailing12_specific_avg = excluded.trailing12_specific_avg,
      yoy_specific_energy = excluded.yoy_specific_energy,
      own_history_percent = excluded.own_history_percent,
      yoy_percent = excluded.yoy_percent,
      history_risk_score = excluded.history_risk_score,
      history_risk_level = excluded.history_risk_level,
      history_reasons_json = excluded.history_reasons_json,
      updated_at = now()
  `;
}

function inferMonth(file) {
  const name = path.basename(file);
  const match = name.match(/(\d{2})-(\d{4})/);
  if (!match) throw new Error(`Cannot infer month from filename: ${name}`);
  return `${match[2]}-${match[1]}`;
}

function previousYearMonth(month) {
  const [year, monthPart] = month.split("-").map(Number);
  return `${year - 1}-${String(monthPart).padStart(2, "0")}`;
}

function normalizeHeader(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isFusionSolarDataRow(row) {
  const plantName = String(row[0] || "").trim();
  const capacity = toNumber(row[2]);
  const pvYield = toNumber(row[7]);
  const specificEnergy = toNumber(row[11]);
  const hasSolarShape = row.length >= 20 && String(row[1] || "").trim().length > 0;
  return plantName.length > 0 && (hasSolarShape || (capacity !== null && (pvYield !== null || specificEnergy !== null)));
}

function toNumber(value) {
  if (value === null || value === undefined || value === "" || value === "--") return null;
  const number = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : null;
}

function num(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function safeDivide(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((total, value) => total + value, 0) / valid.length;
}

function riskLevel(score) {
  if (score >= 65) return "critical";
  if (score >= 38) return "high";
  if (score >= 16) return "watch";
  return "normal";
}
