import { describe, expect, it } from "vitest";
import { buildDashboardScope } from "../src/lib/dashboard-scope";

const roster = { names: ["A", "B", "C"], updatedAt: "2026-09-09T07:00:00Z", reportMonth: "2026-02" };
const rows = [
  { site_name: "A", report_month: "2026-01", inverter_yield_kwh: "120" },
  { site_name: "A", report_month: "2026-02", inverter_yield_kwh: "100" },
  { site_name: "B", report_month: "2026-02", inverter_yield_kwh: null },
  { site_name: "Legacy", report_month: "2026-02", inverter_yield_kwh: "50" },
];

describe("dashboard site counts and scope", () => {
  it("uses the synced roster, excludes historical-only sites, and retains missing reports", () => {
    const result = buildDashboardScope(rows, "2026-02", roster, "source");
    expect(result.names).toEqual(["A", "B", "C"]);
    expect(result.siteCount).toBe(3);
    expect(result.sourceSiteCount).toBe(3);
    expect(result.historicalSiteCount).toBe(1);
    expect(result.reportedSiteCount).toBe(2);
    expect(result.missingReportCount).toBe(1);
    expect(result.missingYieldCount).toBe(2);
    expect(result.rows.every(row => row.site_name !== "Legacy")).toBe(true);
  });
  it("includes historical-only sites only when requested", () => {
    const result = buildDashboardScope(rows, "2026-02", roster, "history");
    expect(result.siteCount).toBe(4);
    expect(result.rows).toHaveLength(4);
    expect(result.names).toContain("Legacy");
    expect(result.sourceSiteCount).toBe(3);
  });
  it("falls back honestly to selected-month report identities when no verified source exists", () => {
    const result = buildDashboardScope(rows, "2026-01", null, "source");
    expect(result.names).toEqual(["A"]);
    expect(result.sourceAvailable).toBe(false);
    expect(result.sourceSiteCount).toBeNull();
    expect(result.historicalSiteCount).toBe(0);
  });
  it("does not treat zero yield as a missing measurement", () => {
    const result = buildDashboardScope([{ site_name: "A", report_month: "2026-02", inverter_yield_kwh: "0" }], "2026-02", null, "source");
    expect(result.missingYieldCount).toBe(0);
    expect(result.missingReportCount).toBe(0);
  });
  it("does not mutate historical input data when changing scope", () => {
    const before = structuredClone(rows);
    buildDashboardScope(rows, "2026-02", roster, "source");
    expect(rows).toEqual(before);
  });
});
