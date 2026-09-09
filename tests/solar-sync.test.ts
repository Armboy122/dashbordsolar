import { describe, expect, it } from "vitest";
import { mergeSource, resolveSyncMonths, sourceValues, validateSource } from "../src/lib/solar-sync";
import type { PlantReportRow } from "../src/types/solar";

const row: PlantReportRow = {
  plantName: "Site A", capacityKwp: 10, pvYieldKwh: 1000, inverterYieldKwh: 1000,
  exportKwh: 100, importKwh: 200, specificEnergy: 100, consumptionKwh: 1100,
  selfConsumptionKwh: 900, selfConsumptionRate: 90, peakPowerKw: 8, performanceRatio: null, revenueBaht: 3000,
};

describe("source validation", () => {
  it("rejects a file for a different month", () => {
    expect(() => validateSource([row], "2026-03", "Plant Report_02-2026.xlsx")).toThrow("month");
  });
  it("rejects partial exports before any writes", () => {
    expect(() => validateSource([row], "2026-02", "Plant Report_02-2026.xlsx", 72)).toThrow("expected 72");
  });
  it("rejects site names differing only in whitespace/case", () => {
    expect(() => validateSource([row, { ...row, plantName: " SITE  A " }], "2026-02", "Plant Report_02-2026.xlsx")).toThrow("Duplicate");
  });
  it("retains zero and allows individual missing yields, but rejects wholly absent data", () => {
    expect(() => validateSource([{ ...row, inverterYieldKwh: 0 }], "2026-02", "Plant Report_02-2026.xlsx")).not.toThrow();
    expect(() => validateSource([{ ...row, inverterYieldKwh: null }], "2026-02", "Plant Report_02-2026.xlsx")).toThrow("missing");
  });
});

describe("source merge", () => {
  const original = sourceValues(row);
  const incoming = { ...original, inverterYieldKwh: 1200, exportKwh: 200 };
  it("updates source-managed fields and preserves locally edited fields", () => {
    const result = mergeSource(incoming, { ...original, inverterYieldKwh: 1300 }, original);
    expect(result.values.inverterYieldKwh).toBe(1300);
    expect(result.values.exportKwh).toBe(200);
    expect(result.protectedFields).toEqual(["inverterYieldKwh"]);
  });
  it("does not overwrite preexisting differences during the first sync", () => {
    expect(mergeSource(incoming, original, null).values.inverterYieldKwh).toBe(1000);
  });
  it("keeps protected fields through subsequent runs even if source temporarily matches", () => {
    const result = mergeSource(incoming, original, original, ["inverterYieldKwh"]);
    expect(result.values.inverterYieldKwh).toBe(1000);
    expect(result.values.exportKwh).toBe(200);
  });
  it("preserves an intentional null edit instead of replacing it with a source number", () => {
    const result = mergeSource(incoming, { ...original, inverterYieldKwh: null }, original);
    expect(result.values.inverterYieldKwh).toBeNull();
  });
  it("fills initially missing data and is idempotent", () => {
    expect(mergeSource(incoming, { ...original, inverterYieldKwh: null }, null).values.inverterYieldKwh).toBe(1200);
    expect(mergeSource(original, original, original)).toEqual({ values: original, protectedFields: [] });
  });
});

it("uses Bangkok month boundaries including year rollover", () => {
  expect(resolveSyncMonths(undefined, new Date("2025-12-31T18:00:00Z"))).toEqual(["2025-12", "2026-01"]);
  expect(resolveSyncMonths("2026-02")).toEqual(["2026-02"]);
  expect(() => resolveSyncMonths("2026-13")).toThrow();
});
