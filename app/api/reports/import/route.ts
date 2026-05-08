import { NextResponse } from "next/server";
import { ensureSchema } from "@/src/db/bootstrap";
import { sql } from "@/src/db/client";
import { isValidReportMonth } from "@/src/lib/import-workflow";
import type { ScoredPlant } from "@/src/types/solar";

export const runtime = "nodejs";

type ImportPayload = {
  filename: string;
  reportMonth: string;
  rows: ScoredPlant[];
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ImportPayload;

    if (!payload.filename || !payload.reportMonth || !Array.isArray(payload.rows) || !isValidReportMonth(payload.reportMonth)) {
      return NextResponse.json({ ok: false, error: "Invalid import payload" }, { status: 400 });
    }

    await ensureSchema();

    const importFile = await sql`
      insert into import_files (filename, report_month, status)
      values (${payload.filename}, ${payload.reportMonth}, 'imported')
      returning id
    `;
    const importFileId = String(importFile[0]?.id);

    for (const row of payload.rows) {
      if (!row.plantName) continue;

      const site = await sql`
        insert into sites (name, address, capacity_kwp)
        values (${row.plantName}, ${row.address ?? null}, ${num(row.capacityKwp)})
        on conflict (name) do update set
          address = excluded.address,
          capacity_kwp = excluded.capacity_kwp
        returning id
      `;

      const siteId = String(site[0]?.id);

      await sql`
        insert into monthly_reports (
          site_id,
          site_name,
          report_month,
          capacity_kwp,
          pv_yield_kwh,
          inverter_yield_kwh,
          export_kwh,
          import_kwh,
          specific_energy,
          consumption_kwh,
          self_consumption_kwh,
          self_consumption_rate,
          peak_power_kw,
          peak_ratio,
          revenue_baht,
          risk_score,
          risk_level,
          reasons_json,
          actions_json,
          import_file_id
        )
        values (
          ${siteId},
          ${row.plantName},
          ${payload.reportMonth},
          ${num(row.capacityKwp)},
          ${num(row.pvYieldKwh)},
          ${num(row.inverterYieldKwh)},
          ${num(row.exportKwh)},
          ${num(row.importKwh)},
          ${num(row.specificEnergy)},
          ${num(row.consumptionKwh)},
          ${num(row.selfConsumptionKwh)},
          ${num(row.selfConsumptionRate)},
          ${num(row.peakPowerKw)},
          ${num(row.peakRatio)},
          ${num(row.revenueBaht)},
          ${row.riskScore},
          ${row.riskLevel},
          ${JSON.stringify(row.reasons)},
          ${JSON.stringify(row.actions)},
          ${importFileId}
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

    await rebuildMonthlyAnalysis();

    return NextResponse.json({ ok: true, imported: payload.rows.length, reportMonth: payload.reportMonth });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Import failed",
      },
      { status: 500 },
    );
  }
}

function num(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : null;
}

type ReportRow = {
  site_name: string;
  report_month: string;
  specific_energy: string | null;
  pv_yield_kwh: string | null;
  peak_ratio: string | null;
};

async function rebuildMonthlyAnalysis() {
  const rows = (await sql`
    select site_name, report_month, specific_energy, pv_yield_kwh, peak_ratio
    from monthly_reports
    order by report_month asc, site_name asc
  `) as ReportRow[];

  const byMonth = new Map<string, Array<ReportRow & { specific: number | null }>>();
  const bySite = new Map<string, Array<ReportRow & { specific: number | null }>>();

  for (const row of rows) {
    const normalized = { ...row, specific: toNumber(row.specific_energy) };
    if (!byMonth.has(row.report_month)) byMonth.set(row.report_month, []);
    if (!bySite.has(row.site_name)) bySite.set(row.site_name, []);
    byMonth.get(row.report_month)?.push(normalized);
    bySite.get(row.site_name)?.push(normalized);
  }

  const peerMedianByMonth = new Map<string, number | null>();
  for (const [month, monthRows] of byMonth) {
    peerMedianByMonth.set(month, median(monthRows.map((row) => row.specific).filter((value): value is number => value !== null && value > 0)));
  }

  for (const siteRows of bySite.values()) {
    siteRows.sort((a, b) => a.report_month.localeCompare(b.report_month));
    const siteByMonth = new Map(siteRows.map((row) => [row.report_month, row]));

    for (let index = 0; index < siteRows.length; index += 1) {
      const row = siteRows[index];
      const previousRows = siteRows.slice(Math.max(0, index - 3), index).filter((item) => item.specific !== null && item.specific > 0);
      const previous12Rows = siteRows.slice(Math.max(0, index - 12), index).filter((item) => item.specific !== null && item.specific > 0);
      const yoy = siteByMonth.get(previousYearMonth(row.report_month));
      const trailing3 = average(previousRows.map((item) => item.specific));
      const trailing12 = average(previous12Rows.map((item) => item.specific));
      const peerMedian = peerMedianByMonth.get(row.report_month) ?? null;
      const peerPercent = safeDivide(row.specific, peerMedian);
      const ownHistoryPercent = safeDivide(row.specific, trailing3 ?? trailing12);
      const yoyPercent = safeDivide(row.specific, yoy?.specific ?? null);
      const peakRatio = toNumber(row.peak_ratio);
      const pvYield = toNumber(row.pv_yield_kwh);
      const reasons: string[] = [];
      let score = 0;

      if (!pvYield || pvYield <= 0) {
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
      if (peakRatio !== null && peakRatio < 0.55) {
        score += 20;
        reasons.push(`peak ratio ต่ำ ${(peakRatio * 100).toFixed(0)}%`);
      }
      if (peerPercent !== null && peerPercent < 0.55) {
        score += 10;
        reasons.push("ต่ำกว่าไซต์อื่นในเดือนเดียวกันมาก");
      }
      if (!reasons.length) reasons.push("เดือนล่าสุดยังอยู่ในกรอบปกติของไซต์นี้");

      await sql`
        insert into monthly_analysis (
          site_name, report_month, specific_energy, pv_yield_kwh, peak_ratio,
          peer_median_specific, peer_percent, trailing3_specific_avg,
          trailing12_specific_avg, yoy_specific_energy, own_history_percent, yoy_percent,
          history_risk_score, history_risk_level, history_reasons_json
        )
        values (
          ${row.site_name}, ${row.report_month}, ${num(row.specific)}, ${num(pvYield)}, ${num(peakRatio)},
          ${num(peerMedian)}, ${num(peerPercent)}, ${num(trailing3)}, ${num(trailing12)},
          ${num(yoy?.specific ?? null)}, ${num(ownHistoryPercent)}, ${num(yoyPercent)},
          ${Math.min(100, Math.round(score))}, ${riskLevel(score)}, ${JSON.stringify(reasons)}
        )
        on conflict (site_name, report_month) do update set
          specific_energy = excluded.specific_energy,
          pv_yield_kwh = excluded.pv_yield_kwh,
          peak_ratio = excluded.peak_ratio,
          peer_median_specific = excluded.peer_median_specific,
          peer_percent = excluded.peer_percent,
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
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeDivide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((total, value) => total + value, 0) / valid.length;
}

function previousYearMonth(month: string): string {
  const [year, monthPart] = month.split("-").map(Number);
  return `${year - 1}-${String(monthPart).padStart(2, "0")}`;
}

function riskLevel(score: number) {
  if (score >= 65) return "critical";
  if (score >= 38) return "high";
  if (score >= 16) return "watch";
  return "normal";
}
