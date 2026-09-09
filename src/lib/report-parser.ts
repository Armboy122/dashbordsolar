import * as XLSX from "xlsx";
import { toNumber } from "./number";
import { inferReportMonthFromFilename } from "./import-workflow";
import type { PlantReportRow } from "@/src/types/solar";

const columns = {
  plantName: "Plant Name",
  address: "Address",
  capacityKwp: "Total String Capacity (kWp)",
  pvYieldKwh: "PV Yield (kWh)",
  inverterYieldKwh: "Inverter Yield (kWh)",
  exportKwh: "Export (kWh)",
  importKwh: "Import (kWh)",
  specificEnergy: "Specific Energy (kWh/kWp)",
  consumptionKwh: "Consumption (kWh)",
  selfConsumptionKwh: "Self-consumption (kWh)",
  selfConsumptionRate: "Self-consumption Rate (%)",
  peakPowerKw: "Peak Power (kW)",
  performanceRatio: "Performance Ratio(%)",
  revenueBaht: "Revenue (฿)",
};

export async function parsePlantReport(file: File): Promise<PlantReportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = readWorkbook(buffer);
  const sourceMonth = inferReportMonthFromFilename(file.name) ?? undefined;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const parsed = parseSheet(sheet, sourceMonth);

    if (parsed.length > 0) {
      return parsed;
    }
  }

  throw new Error("อ่านไฟล์นี้ไม่ได้: ไม่พบข้อมูล plant report หรือรูปแบบคอลัมน์ไม่ตรงกับ FusionSolar export");
}

export function parseSheet(sheet: XLSX.WorkSheet, sourceMonth?: string): PlantReportRow[] {
  // Huawei sometimes declares A4:X74 even though A1 is the title, A2 the
  // headers, and A3 the first plant. Start at row zero so those cells survive.
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, range: 0, defval: null });
  return parseRows(rows, sourceMonth);
}

function readWorkbook(buffer: ArrayBuffer): XLSX.WorkBook {
  const originalWarn = console.warn;
  const originalError = console.error;
  const ignoreZipSizeWarning = (message: unknown) => typeof message === "string" && message.startsWith("Bad uncompressed size:");

  console.warn = (...args: unknown[]) => {
    if (!ignoreZipSizeWarning(args[0])) originalWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    if (!ignoreZipSizeWarning(args[0])) originalError(...args);
  };

  try {
    return XLSX.read(buffer, { type: "array" });
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
}

export function parseRows(rows: unknown[][], sourceMonth?: string): PlantReportRow[] {
  const headerIndex = rows.findIndex((row) => row.map(canonicalHeader).includes(canonicalHeader(columns.plantName)));

  if (headerIndex >= 0) {
    const headers = rows[headerIndex].map(normalizeHeader);

    return rows
      .slice(headerIndex + 1)
      .filter((row) => isDataRow(row))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])))
      .map((record) => normalizeRow(record, sourceMonth))
      .filter((row) => row.plantName.length > 0);
  }

  return rows
    .filter((row) => isFusionSolarDataRow(row))
    .map((row) => normalizePositionalRow(row, sourceMonth))
    .filter((row) => row.plantName.length > 0);
}

function normalizeRow(record: Record<string, unknown>, sourceMonth?: string): PlantReportRow {
  return {
    plantName: String(record[columns.plantName] || "").trim(),
    address: String(record[columns.address] || "").trim(),
    capacityKwp: toNumber(record[columns.capacityKwp]),
    pvYieldKwh: toNumber(record[columns.pvYieldKwh]),
    inverterYieldKwh: toNumber(record[` ${columns.inverterYieldKwh}`] ?? record[columns.inverterYieldKwh]),
    exportKwh: toNumber(record[columns.exportKwh]),
    importKwh: toNumber(record[columns.importKwh]),
    specificEnergy: toNumber(record[columns.specificEnergy]),
    consumptionKwh: toNumber(record[columns.consumptionKwh]),
    selfConsumptionKwh: toNumber(record[columns.selfConsumptionKwh]),
    selfConsumptionRate: toNumber(record[columns.selfConsumptionRate]),
    peakPowerKw: toNumber(record[columns.peakPowerKw]),
    performanceRatio: toNumber(record[columns.performanceRatio]),
    revenueBaht: toNumber(record[columns.revenueBaht]),
    sourceMonth,
  };
}

function normalizePositionalRow(row: unknown[], sourceMonth?: string): PlantReportRow {
  return {
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
    performanceRatio: toNumber(row[18]),
    revenueBaht: toNumber(row[23]),
    sourceMonth,
  };
}

function normalizeHeader(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function canonicalHeader(value: unknown): string {
  return normalizeHeader(value).toLowerCase();
}

function isDataRow(row: unknown[]): boolean {
  return row.some((cell) => cell !== null && cell !== "");
}

function isFusionSolarDataRow(row: unknown[]): boolean {
  const plantName = String(row[0] || "").trim();
  const address = String(row[1] || "").trim();
  // Headerless FusionSolar exports have 24 fixed columns. A real plant may have
  // no capacity/yield yet; missing measurements must not remove it from the list.
  return row.length === 24 && plantName.length > 0 && address.length > 0 &&
    !/^(total|summary|plant report|รวม)$/i.test(plantName);
}
