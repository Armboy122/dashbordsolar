import { describe, expect, it } from "vitest";
import { buildSiteDetailView, type SiteDetailView } from "../src/lib/site-detail-view";
import { type SiteHistoryRow } from "../src/lib/site-history";

function row(overrides: Partial<SiteHistoryRow>): SiteHistoryRow {
  return {
    reportMonth: "2024-01",
    siteName: "โรงไฟฟ้า A",
    pvYieldKwh: 100,
    inverterYieldKwh: 96,
    capacityKwp: 50,
    specificEnergy: null,
    exportKwh: 20,
    importKwh: 10,
    consumptionKwh: 80,
    selfConsumptionKwh: 40,
    selfConsumptionRate: 0.5,
    peakPowerKw: 42,
    peakRatio: 0.84,
    performanceRatio: null,
    riskScore: 12,
    riskLevel: "watch",
    reasons: ["แรงดันต่ำ"],
    actions: ["ตรวจ inverter"],
    ...overrides,
  };
}

describe("site detail view helpers", () => {
  it("builds year tabs, hero summary, and chart series across all years", () => {
    const view = buildSiteDetailView(
      [
        row({ reportMonth: "2023-12", inverterYieldKwh: 88, capacityKwp: 48, specificEnergy: 1.83, riskLevel: "normal", riskScore: 2 }),
        row({ reportMonth: "2024-01", inverterYieldKwh: 96, exportKwh: 24, importKwh: 11, consumptionKwh: 86, selfConsumptionKwh: 44, specificEnergy: null }),
        row({ reportMonth: "2024-02", inverterYieldKwh: null, capacityKwp: null, specificEnergy: null, performanceRatio: 0.77, selfConsumptionRate: null }),
      ],
      { requestedMonth: "2024-01", selectedYear: null, backHref: "/?month=2024-01" },
    );

    expect(view.firstMonth).toBe("2023-12");
    expect(view.latestMonth).toBe("2024-02");
    expect(view.totalMonths).toBe(3);
    expect(view.years).toEqual([2023, 2024]);
    expect(view.yearTabs.map((tab) => tab.label)).toEqual(["All years", "2023", "2024"]);
    expect(view.selectedMonth).toBe("2024-01");
    expect(view.selectedRow?.reportMonth).toBe("2024-01");
    expect(view.capacityKwp).toBe(50);
    const kpi = (key: SiteDetailView["kpis"][number]["key"]) => view.kpis.find((item) => item.key === key)?.value ?? null;

    expect(kpi("inverterYield")).toBe(96);
    expect(kpi("specificEnergy")).toBeCloseTo(2.0);
    expect(kpi("performanceRatio")).toBe(0.84);
    expect(kpi("energyBalanceGap")).toBe(32);
    expect(kpi("loadBalanceGap")).toBe(31);
    expect(view.chartSections).toHaveLength(3);
    expect(view.chartSections[0].series.map((series) => series.year)).toEqual([2023, 2024]);
    expect(view.chartSections[0].series[0].points).toEqual([
      { reportMonth: "2023-12", monthNumber: 12, value: 88 },
    ]);
    expect(view.chartSections[0].series[1].points).toEqual([
      { reportMonth: "2024-01", monthNumber: 1, value: 96 },
      { reportMonth: "2024-02", monthNumber: 2, value: null },
    ]);
    expect(view.chartSections[1].title).toBe("Peak ratio");
    expect(view.kpis.find((item) => item.key === "performanceRatio")?.title).toBe("Peak ratio");
    expect(view.historyRows[1]).toMatchObject({
      reportMonth: "2024-01",
      specificEnergy: 2,
      performanceRatio: 0.84,
      energyBalanceGapKwh: 32,
      loadBalanceGapKwh: 31,
    });
  });

  it("returns an empty year state instead of mixing in other years", () => {
    const view = buildSiteDetailView(
      [
        row({ reportMonth: "2024-01", inverterYieldKwh: 90, capacityKwp: 55 }),
        row({ reportMonth: "2024-02", inverterYieldKwh: 92, capacityKwp: 60 }),
      ],
      { requestedMonth: "2024-02", selectedYear: 2025, backHref: "/?month=2024-02" },
    );

    expect(view.selectedYear).toBe(2025);
    expect(view.selectedMonth).toBe("");
    expect(view.selectedRow).toBeNull();
    expect(view.capacityKwp).toBeNull();
    expect(view.activeRows).toEqual([]);
    expect(view.historyRows).toEqual([]);
    expect(view.chartSections.every((section) => section.series.length === 0)).toBe(true);
    expect(view.kpis.every((kpi) => kpi.value === null)).toBe(true);
  });

  it("keeps malformed month points from producing invalid chart coordinates", () => {
    const view = buildSiteDetailView(
      [
        row({ reportMonth: "2024-13", inverterYieldKwh: 90, capacityKwp: 55 }),
      ],
      { selectedYear: null, backHref: "/" },
    );

    expect(view.chartSections[0].series[0].points[0]).toMatchObject({ reportMonth: "2024-13", monthNumber: null, value: 90 });
  });
});
