import { describe, expect, it } from "vitest";
import {
  buildSiteTableRows,
  compareSiteRowsByRisk,
  siteTableColumnOrder,
  siteTableHeaderLabels,
  statusLabel,
  statusRank,
} from "../src/lib/solar-table";

describe("solar table helpers", () => {
  it("maps site summaries into readable table rows with the selected year yield", () => {
    const rows = buildSiteTableRows(
      [
        {
          siteId: "site-a",
          siteName: "โรงไฟฟ้า A",
          capacityKwp: 250,
          inverterYieldKwh: 980,
          riskLevel: "normal",
          riskScore: 0,
          reasons: [],
          actions: [],
          comparison: {
            mom: { state: "ok", deltaPct: 0.12, deltaAbsKwh: 105, baselineKwh: 875 },
            siteAvg: { state: "ok", deltaPct: 0.08, deltaAbsKwh: 72, baselineKwh: 908 },
            yoy: { state: "warn", deltaPct: -0.18, deltaAbsKwh: -215, baselineKwh: 1195 },
          },
          yearTotals: [
            { year: 2023, yieldKwh: 1120 },
            { year: 2024, yieldKwh: 1325 },
          ],
        },
      ],
      2024,
    );

    expect(rows).toEqual([
      {
        siteId: "site-a",
        siteName: "โรงไฟฟ้า A",
        capacityKwp: 250,
        monthYieldKwh: 980,
        yearYieldKwh: 1325,
        status: "ok",
        reason: "อยู่ในเกณฑ์ปกติ",
        comparison: {
          mom: { state: "ok", deltaPct: 0.12, deltaAbsKwh: 105, baselineKwh: 875 },
          siteAvg: { state: "ok", deltaPct: 0.08, deltaAbsKwh: 72, baselineKwh: 908 },
          yoy: { state: "warn", deltaPct: -0.18, deltaAbsKwh: -215, baselineKwh: 1195 },
        },
        alertScore: 1,
        declineCount: 1,
        vsLastMonthPct: 0.12,
        vsSiteAvgPct: 0.08,
        vsLastYearPct: -0.18,
      },
    ]);
  });

  it("sorts risk rows by severity first, then score, then site name", () => {
    const sortedNames = [
      { siteId: "c", siteName: "ไซต์ ค", capacityKwp: null, monthYieldKwh: 1, yearYieldKwh: null, status: "watch" as const, reason: "", comparison: emptyComparison(), alertScore: 8, declineCount: 2, vsLastMonthPct: -0.2, vsSiteAvgPct: null, vsLastYearPct: null },
      { siteId: "a", siteName: "ไซต์ ก", capacityKwp: null, monthYieldKwh: 1, yearYieldKwh: null, status: "attention" as const, reason: "", comparison: emptyComparison(), alertScore: 9, declineCount: 2, vsLastMonthPct: -0.5, vsSiteAvgPct: null, vsLastYearPct: null },
      { siteId: "b", siteName: "ไซต์ ข", capacityKwp: null, monthYieldKwh: 1, yearYieldKwh: null, status: "attention" as const, reason: "", comparison: emptyComparison(), alertScore: 4, declineCount: 1, vsLastMonthPct: -0.1, vsSiteAvgPct: null, vsLastYearPct: null },
      { siteId: "d", siteName: "ไซต์ ง", capacityKwp: null, monthYieldKwh: 1, yearYieldKwh: null, status: "ok" as const, reason: "", comparison: emptyComparison(), alertScore: 0, declineCount: 0, vsLastMonthPct: null, vsSiteAvgPct: null, vsLastYearPct: null },
    ].sort(compareSiteRowsByRisk).map((row) => row.siteId);

    expect(sortedNames).toEqual(["a", "b", "c", "d"]);
  });

  it("exposes stable Thai status labels and ranks", () => {
    expect(statusLabel["no-data"]).toBe("ยังไม่มีข้อมูล");
    expect(statusLabel.attention).toBe("ตรวจสอบด่วน");
    expect(statusRank.attention).toBeLessThan(statusRank.review);
  });

  it("keeps the section 2 table columns in the designed reading order", () => {
    expect(siteTableColumnOrder).toEqual([
      "status",
      "siteName",
      "monthYieldKwh",
      "yearYieldKwh",
      "vsLastMonthPct",
      "vsSiteAvgPct",
      "vsLastYearPct",
    ]);
    expect(siteTableHeaderLabels.monthYieldKwh).toBe("เดือนนี้ (kWh)");
    expect(siteTableHeaderLabels.vsSiteAvgPct).toBe("เทียบค่าเฉลี่ยไซต์");
  });
});

function emptyComparison() {
  return {
    mom: { state: "no-data" as const, deltaPct: null, deltaAbsKwh: null, baselineKwh: null },
    siteAvg: { state: "no-data" as const, deltaPct: null, deltaAbsKwh: null, baselineKwh: null },
    yoy: { state: "no-data" as const, deltaPct: null, deltaAbsKwh: null, baselineKwh: null },
  };
}
