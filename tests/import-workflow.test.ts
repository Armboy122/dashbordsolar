import { describe, expect, it } from "vitest";
import type { ScoredPlant } from "../src/types/solar";
import { buildImportPayload, inferReportMonthFromFilename, isValidReportMonth, resolveReportMonth } from "../src/lib/import-workflow";

describe("report month helpers", () => {
  it("validates only YYYY-MM report months with real calendar months", () => {
    expect(isValidReportMonth("2025-01")).toBe(true);
    expect(isValidReportMonth("2025-12")).toBe(true);
    expect(isValidReportMonth("2025-00")).toBe(false);
    expect(isValidReportMonth("2025-13")).toBe(false);
    expect(isValidReportMonth("25-01")).toBe(false);
  });

  it("infers report month from common Excel filename patterns", () => {
    expect(inferReportMonthFromFilename("FusionSolar_02-2025.xlsx")).toBe("2025-02");
    expect(inferReportMonthFromFilename("monthly-report-2025-11.xls")).toBe("2025-11");
    expect(inferReportMonthFromFilename("report.xlsx")).toBeNull();
  });

  it("falls back to a later valid month pattern when an earlier match is invalid", () => {
    expect(inferReportMonthFromFilename("report-99-1999-2025-03.xlsx")).toBe("2025-03");
  });

  it("prefers a valid manual month and falls back to filename inference", () => {
    expect(resolveReportMonth({ reportMonth: "2025-03", filename: "FusionSolar_02-2025.xlsx" })).toBe("2025-03");
    expect(resolveReportMonth({ reportMonth: "2025-13", filename: "FusionSolar_02-2025.xlsx" })).toBe("2025-02");
    expect(resolveReportMonth({ reportMonth: "", filename: "report.xlsx" })).toBeNull();
  });
});

describe("buildImportPayload", () => {
  const rows = [
    {
      id: "site-1",
      plantName: "โรงไฟฟ้าทดสอบ",
      address: "กรุงเทพฯ",
      capacityKwp: 120,
      pvYieldKwh: 5600,
      inverterYieldKwh: 5400,
      exportKwh: 120,
      importKwh: 20,
      specificEnergy: 45,
      consumptionKwh: 300,
      selfConsumptionKwh: 280,
      selfConsumptionRate: 93.3,
      peakPowerKw: 80,
      performanceRatio: 0.87,
      revenueBaht: 15400,
      riskLevel: "normal",
      riskScore: 5,
      reasons: ["ปกติ"],
      actions: ["ติดตามต่อ"],
      peakRatio: 0.81,
      peerPercent: 0.95,
      dataQualityIssues: 0,
    },
  ] satisfies ScoredPlant[];

  it("builds the exact import payload expected by the API", () => {
    expect(buildImportPayload({ filename: "FusionSolar_02-2025.xlsx", reportMonth: "2025-02", rows })).toEqual({
      filename: "FusionSolar_02-2025.xlsx",
      reportMonth: "2025-02",
      rows,
    });
  });

  it("rejects payloads without a valid report month", () => {
    expect(() => buildImportPayload({ filename: "report.xlsx", reportMonth: "", rows })).toThrow("ต้องเลือกเดือนรายงานที่ถูกต้องก่อนนำเข้า");
  });

  it("rejects payloads without a file name", () => {
    expect(() => buildImportPayload({ filename: "   ", reportMonth: "2025-02", rows })).toThrow("ต้องระบุชื่อไฟล์");
  });

  it("rejects payloads without rows", () => {
    expect(() => buildImportPayload({ filename: "FusionSolar_02-2025.xlsx", reportMonth: "2025-02", rows: [] })).toThrow(
      "ต้องมีข้อมูลแถวสำหรับนำเข้า",
    );
  });
});
