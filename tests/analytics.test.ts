import { describe, expect, it } from "vitest";
import {
  buildMonthlyPortfolioSeries,
  buildPortfolioComparisonPoints,
  buildPortfolioChartScale,
  buildPortfolioInsight,
  buildPortfolioMonthlySeries,
  buildSiteHistoryUrl,
  buildSiteHistoryView,
  findMonthDelta,
} from "../src/lib/analytics";

describe("analytics helpers", () => {
  it("groups monthly portfolio series by YYYY-MM with current and previous year values", () => {
    const series = buildMonthlyPortfolioSeries(
      [
        { reportMonth: "2023-01", inverterYieldKwh: 80 },
        { reportMonth: "2024-01", inverterYieldKwh: 100 },
        { reportMonth: "2023-02", inverterYieldKwh: 90 },
        { reportMonth: "2024-02", inverterYieldKwh: 110 },
        { reportMonth: "2024-02", inverterYieldKwh: 40 },
      ],
      2024,
    );

    expect(series).toEqual([
      {
        reportMonth: "2024-01",
        currentYearYieldKwh: 100,
        previousYearSameMonthYieldKwh: 80,
      },
      {
        reportMonth: "2024-02",
        currentYearYieldKwh: 150,
        previousYearSameMonthYieldKwh: 90,
      },
    ]);
  });

  it("builds chart-ready portfolio monthly series with same-month prior year comparison", () => {
    const series = buildPortfolioMonthlySeries(
      [
        { reportMonth: "2023-01", inverterYieldKwh: 80 },
        { reportMonth: "2024-01", inverterYieldKwh: 100 },
        { reportMonth: "2025-01", inverterYieldKwh: 120 },
        { reportMonth: "2024-02", inverterYieldKwh: null },
        { reportMonth: "2025-02", inverterYieldKwh: 140 },
        { reportMonth: "2025-02", inverterYieldKwh: 60 },
        { reportMonth: "2024-03", inverterYieldKwh: 50 },
      ],
      2025,
    );

    expect(series).toEqual([
      {
        month: "2025-01",
        year: 2025,
        monthNumber: 1,
        totalYieldKwh: 120,
        previousYearTotalYieldKwh: 100,
        deltaPct: 0.2,
      },
      {
        month: "2025-02",
        year: 2025,
        monthNumber: 2,
        totalYieldKwh: 200,
        previousYearTotalYieldKwh: null,
        deltaPct: null,
      },
      {
        month: "2025-03",
        year: 2025,
        monthNumber: 3,
        totalYieldKwh: null,
        previousYearTotalYieldKwh: 50,
        deltaPct: null,
      },
    ]);
  });

  it("builds 12 monthly chart points and keeps missing months explicit", () => {
    const monthlySeries = buildPortfolioMonthlySeries(
      [
        { reportMonth: "2024-01", inverterYieldKwh: 80 },
        { reportMonth: "2025-01", inverterYieldKwh: 100 },
        { reportMonth: "2024-03", inverterYieldKwh: 90 },
        { reportMonth: "2025-03", inverterYieldKwh: 120 },
        { reportMonth: "2024-03", inverterYieldKwh: 10 },
      ],
      2025,
    );
    const points = buildPortfolioComparisonPoints(monthlySeries, 2025);

    expect(points).toHaveLength(12);
    expect(points[0]).toEqual({
      monthNumber: 1,
      monthLabel: "ม.ค.",
      currentYearYieldKwh: 100,
      previousYearSameMonthYieldKwh: 80,
    });
    expect(points[1]).toEqual({
      monthNumber: 2,
      monthLabel: "ก.พ.",
      currentYearYieldKwh: null,
      previousYearSameMonthYieldKwh: null,
    });
    expect(points[2]).toEqual({
      monthNumber: 3,
      monthLabel: "มี.ค.",
      currentYearYieldKwh: 120,
      previousYearSameMonthYieldKwh: 100,
    });
    expect(points[11]).toEqual({
      monthNumber: 12,
      monthLabel: "ธ.ค.",
      currentYearYieldKwh: null,
      previousYearSameMonthYieldKwh: null,
    });
  });

  it("creates chart scales that map the full monthly range into the plot area", () => {
    const monthlySeries = buildPortfolioMonthlySeries(
      [
        { reportMonth: "2024-01", inverterYieldKwh: 80 },
        { reportMonth: "2025-01", inverterYieldKwh: 100 },
        { reportMonth: "2025-02", inverterYieldKwh: 200 },
      ],
      2025,
    );
    const points = buildPortfolioComparisonPoints(monthlySeries, 2025);
    const scale = buildPortfolioChartScale(points, 600, 240);

    expect(scale.xForMonth(1)).toBeCloseTo(44, 5);
    expect(scale.xForMonth(12)).toBeCloseTo(580, 5);
    expect(scale.yForValue(200)).toBeCloseTo(20, 5);
    expect(scale.yForValue(0)).toBeCloseTo(212, 5);
    expect(scale.yForValue(null)).toBeNull();
  });

  it("sorts site history ascending and preserves null-safe comparison states", () => {
    const view = buildSiteHistoryView(
      [
        {
          reportMonth: "2024-02",
          inverterYieldKwh: 120,
          capacityKwp: 50,
          consumptionKwh: 300,
          selfConsumptionKwh: 220,
          selfConsumptionRate: 0.73,
          peakPowerKw: 40,
          exportKwh: 70,
          importKwh: 80,
          baselineInverterYield: null,
          productionPercent: null,
          energyBalanceGapKwh: null,
          loadBalanceGapKwh: null,
          performanceRatio: null,
        },
        {
          reportMonth: "2024-01",
          inverterYieldKwh: null,
          capacityKwp: 50,
          consumptionKwh: null,
          selfConsumptionKwh: null,
          selfConsumptionRate: null,
          peakPowerKw: null,
          exportKwh: null,
          importKwh: null,
          baselineInverterYield: null,
          productionPercent: null,
          energyBalanceGapKwh: null,
          loadBalanceGapKwh: null,
          performanceRatio: null,
        },
      ],
      "2024-01",
    );

    expect(view.rows.map((row) => row.reportMonth)).toEqual(["2024-01", "2024-02"]);
    expect(view.yearTotals).toEqual([{ year: 2024, yieldKwh: 120 }]);
    expect(view.comparison).toEqual({
      mom: { state: "no-data", deltaPct: null, deltaAbsKwh: null, baselineKwh: null },
      siteAvg: { state: "no-data", deltaPct: null, deltaAbsKwh: null, baselineKwh: null },
      yoy: { state: "no-data", deltaPct: null, deltaAbsKwh: null, baselineKwh: null },
    });
  });

  it("keeps Thai names and spaces intact in the site history query", () => {
    const url = buildSiteHistoryUrl("โรงไฟฟ้า A 01");
    const parsed = new URL(url, "http://localhost");

    expect(parsed.searchParams.get("site")).toBe("โรงไฟฟ้า A 01");
  });
});

describe("buildPortfolioInsight", () => {
  it("counts months ahead and behind with average delta", () => {
    const insight = buildPortfolioInsight([
      { monthNumber: 1, monthLabel: "ม.ค.", currentYearYieldKwh: 120, previousYearSameMonthYieldKwh: 100 },
      { monthNumber: 2, monthLabel: "ก.พ.", currentYearYieldKwh: 80, previousYearSameMonthYieldKwh: 100 },
      { monthNumber: 3, monthLabel: "มี.ค.", currentYearYieldKwh: 110, previousYearSameMonthYieldKwh: 100 },
      { monthNumber: 4, monthLabel: "เม.ย.", currentYearYieldKwh: null, previousYearSameMonthYieldKwh: 100 },
    ]);

    expect(insight.totalMonthsCompared).toBe(3);
    expect(insight.monthsAhead).toBe(2);
    expect(insight.monthsBehind).toBe(1);
    expect(insight.averageDeltaPct).toBeCloseTo((0.2 + -0.2 + 0.1) / 3, 5);
  });

  it("returns null averageDeltaPct when no previous year data has positive values", () => {
    const insight = buildPortfolioInsight([
      { monthNumber: 1, monthLabel: "ม.ค.", currentYearYieldKwh: null, previousYearSameMonthYieldKwh: null },
      { monthNumber: 2, monthLabel: "ก.พ.", currentYearYieldKwh: null, previousYearSameMonthYieldKwh: null },
    ]);

    expect(insight.totalMonthsCompared).toBe(0);
    expect(insight.averageDeltaPct).toBeNull();
  });

  it("counts equal values as ahead (not behind)", () => {
    const insight = buildPortfolioInsight([
      { monthNumber: 1, monthLabel: "ม.ค.", currentYearYieldKwh: 100, previousYearSameMonthYieldKwh: 100 },
    ]);

    expect(insight.monthsAhead).toBe(1);
    expect(insight.monthsBehind).toBe(0);
  });
});

describe("findMonthDelta", () => {
  const series = [
    { month: "2025-01", year: 2025, monthNumber: 1, totalYieldKwh: 120, previousYearTotalYieldKwh: 100, deltaPct: 0.2 },
    { month: "2025-02", year: 2025, monthNumber: 2, totalYieldKwh: 80, previousYearTotalYieldKwh: 100, deltaPct: -0.2 },
    { month: "2025-03", year: 2025, monthNumber: 3, totalYieldKwh: null, previousYearTotalYieldKwh: 90, deltaPct: null },
  ];

  it("returns delta values for a matching month", () => {
    const delta = findMonthDelta(series, "2025-01");

    expect(delta).toEqual({ deltaAbsKwh: 20, deltaPct: 0.2, previousYearKwh: 100 });
  });

  it("returns null deltaAbsKwh when current yield is missing", () => {
    const delta = findMonthDelta(series, "2025-03");

    expect(delta).not.toBeNull();
    expect(delta!.deltaAbsKwh).toBeNull();
    expect(delta!.deltaPct).toBeNull();
    expect(delta!.previousYearKwh).toBe(90);
  });

  it("returns null when no matching month is found", () => {
    expect(findMonthDelta(series, "2025-12")).toBeNull();
  });
});
