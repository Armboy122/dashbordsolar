import { describe, expect, it } from "vitest";
import {
  buildCohortComparisonSeries,
  shiftMonthKey,
} from "../src/lib/portfolio-cohort";

function row(site: string, month: string, value: string | number | null) {
  return { site_name: site, report_month: month, inverter_yield_kwh: value };
}

describe("shiftMonthKey", () => {
  it("crosses year boundaries in both directions", () => {
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2025-12", 1)).toBe("2026-01");
    expect(shiftMonthKey("2026-08", -12)).toBe("2025-08");
  });

  it("returns the input unchanged when it is not a month key", () => {
    expect(shiftMonthKey("not-a-month", -1)).toBe("not-a-month");
  });
});

describe("buildCohortComparisonSeries", () => {
  it("returns an empty series for an invalid end month", () => {
    expect(
      buildCohortComparisonSeries([row("A", "2026-08", 10)], "2026", 12),
    ).toEqual([]);
  });

  it("produces consecutive months ending at the requested month", () => {
    const series = buildCohortComparisonSeries([], "2026-08", 3);
    expect(series.map((point) => point.month)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
    expect(series[2].previousYearMonth).toBe("2025-08");
  });

  it("keeps missing values out of totals instead of treating them as zero", () => {
    const series = buildCohortComparisonSeries(
      [
        row("A", "2026-08", 100),
        row("B", "2026-08", null),
        row("C", "2026-08", ""),
      ],
      "2026-08",
      1,
    );
    expect(series[0].totalYieldKwh).toBe(100);
    expect(series[0].siteCountWithValue).toBe(1);
  });

  it("reports null totals for a month with nothing usable", () => {
    const series = buildCohortComparisonSeries(
      [row("A", "2026-08", null)],
      "2026-08",
      1,
    );
    expect(series[0].totalYieldKwh).toBeNull();
    expect(series[0].cohortCurrentKwh).toBeNull();
    expect(series[0].cohortDeltaPct).toBeNull();
  });

  it("compares only sites present in both months", () => {
    const series = buildCohortComparisonSeries(
      [
        row("A", "2025-08", 100),
        row("B", "2025-08", 200),
        row("A", "2026-08", 150),
        row("C", "2026-08", 999),
      ],
      "2026-08",
      1,
    );
    const point = series[0];
    expect(point.totalYieldKwh).toBe(1149);
    expect(point.previousYearTotalYieldKwh).toBe(300);
    expect(point.cohortSiteCount).toBe(1);
    expect(point.cohortCurrentKwh).toBe(150);
    expect(point.cohortPreviousKwh).toBe(100);
    expect(point.cohortDeltaKwh).toBe(50);
    expect(point.cohortDeltaPct).toBeCloseTo(0.5);
    expect(point.membershipDiffers).toBe(true);
  });

  it("does not compute a percentage when the baseline is zero", () => {
    const series = buildCohortComparisonSeries(
      [row("A", "2025-08", 0), row("A", "2026-08", 120)],
      "2026-08",
      1,
    );
    expect(series[0].cohortPreviousKwh).toBe(0);
    expect(series[0].cohortDeltaKwh).toBe(120);
    expect(series[0].cohortDeltaPct).toBeNull();
  });

  it("does not compute a percentage when the baseline month is missing", () => {
    const series = buildCohortComparisonSeries(
      [row("A", "2026-08", 120)],
      "2026-08",
      1,
    );
    expect(series[0].cohortPreviousKwh).toBeNull();
    expect(series[0].cohortDeltaKwh).toBeNull();
    expect(series[0].cohortDeltaPct).toBeNull();
  });

  it("marks membership as identical when the same sites report both months", () => {
    const series = buildCohortComparisonSeries(
      [row("A", "2025-08", 100), row("A", "2026-08", 110)],
      "2026-08",
      1,
    );
    expect(series[0].membershipDiffers).toBe(false);
    expect(series[0].cohortSiteCount).toBe(1);
  });
});

describe("missing inputs do not create comparison evidence", () => {
  it("excludes whitespace-only values while retaining a genuine zero", () => {
    const [point] = buildCohortComparisonSeries([
      row("A", "2026-08", "  "), row("A", "2025-08", 50),
      row("B", "2026-08", 0), row("B", "2025-08", 10),
    ], "2026-08", 1);
    expect(point.siteCountWithValue).toBe(1);
    expect(point.cohortSiteCount).toBe(1);
    expect(point.cohortCurrentKwh).toBe(0);
    expect(point.cohortDeltaPct).toBe(-1);
  });
});
