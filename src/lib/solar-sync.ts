import { isValidReportMonth, inferReportMonthFromFilename } from "./import-workflow";
import type { PlantReportRow } from "../types/solar";

export const syncFields = ["capacityKwp", "pvYieldKwh", "inverterYieldKwh", "exportKwh", "importKwh", "specificEnergy", "consumptionKwh", "selfConsumptionKwh", "selfConsumptionRate", "peakPowerKw", "revenueBaht"] as const;
export type SyncField = typeof syncFields[number];
export type SourceValues = Pick<PlantReportRow, SyncField>;

export function validateSource(rows: PlantReportRow[], month: string, filename: string, expectedRows?: number) {
  if (!isValidReportMonth(month)) throw new Error("Invalid month; expected YYYY-MM");
  if (inferReportMonthFromFilename(filename) !== month) throw new Error("Filename month does not match requested month");
  if (!rows.length) throw new Error("Report contains no plant rows");
  if (expectedRows !== undefined && rows.length !== expectedRows) {
    throw new Error(`Incomplete report: expected ${expectedRows} sites, parsed ${rows.length}`);
  }
  const names = new Set<string>();
  for (const row of rows) {
    const name = normalizeSiteName(row.plantName);
    if (!name || names.has(name)) throw new Error(`Duplicate/empty site name: ${row.plantName}`);
    names.add(name);
    for (const field of syncFields) {
      const value = row[field];
      if (value !== null && !Number.isFinite(value)) throw new Error(`Invalid number: ${row.plantName} / ${field}`);
    }
  }
  if (rows.every(row => row.inverterYieldKwh === null)) throw new Error("All inverter yields are missing; unexpected export format");
}

export function normalizeSiteName(name: string) { return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(); }
export function sourceValues(row: SourceValues): SourceValues {
  return Object.fromEntries(syncFields.map(field => [field, row[field]])) as SourceValues;
}

/** A source refresh never silently overwrites local edits. Initial differences are protected too. */
export function mergeSource(incoming: SourceValues, current: SourceValues | null, previous: SourceValues | null, protectedFields: SyncField[] = []) {
  const protectedSet = new Set(protectedFields);
  const values = { ...incoming };
  if (current) {
    for (const field of syncFields) {
      const changedLocally = previous
        ? current[field] !== previous[field]
        : current[field] !== null && current[field] !== incoming[field];
      if (changedLocally) protectedSet.add(field);
      if (protectedSet.has(field)) values[field] = current[field];
    }
  }
  return { values, protectedFields: [...protectedSet] };
}

export function resolveSyncMonths(month?: string, now = new Date()): string[] {
  if (month) {
    if (!isValidReportMonth(month)) throw new Error("Invalid month; expected YYYY-MM");
    return [month];
  }
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find(p => p.type === "year")!.value);
  const monthNumber = Number(parts.find(p => p.type === "month")!.value);
  const previous = new Date(Date.UTC(year, monthNumber - 2, 1)).toISOString().slice(0, 7);
  return [previous, `${year}-${String(monthNumber).padStart(2, "0")}`];
}
