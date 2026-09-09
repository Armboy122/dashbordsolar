import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("../src/db/client", () => ({ sql: query }));
import { GET } from "../app/api/dashboard/latest/route";

function report(site: string, month: string, yieldKwh: string | null) {
  return {
    site_name: site, report_month: month, inverter_yield_kwh: yieldKwh,
    capacity_kwp: "10", export_kwh: null, import_kwh: null, consumption_kwh: null,
    self_consumption_kwh: null, self_consumption_rate: null, peak_power_kw: null,
    risk_score: null, risk_level: null, reasons_json: null, actions_json: null,
  };
}

const rows = [report("A", "2025-02", "80"), report("A", "2026-02", "100"), report("Legacy", "2026-02", "50")];

function mockDatabase(verified = true, expectedSites = 2) {
  query.mockImplementation(async (strings: TemplateStringsArray) => {
    const text = strings.join("");
    if (text.includes("to_regclass")) return [{ runs: verified ? "runs" : null, sources: verified ? "sources" : null }];
    if (text.includes("with latest as")) return [{ names: ["A", "Missing"], expected_sites: String(expectedSites), report_month: "2026-02", created_at: "2026-09-09T08:00:00Z" }];
    if (text.includes("from monthly_reports")) return rows;
    throw new Error("Unexpected test query");
  });
}

beforeEach(() => { query.mockReset(); mockDatabase(); });

describe("dashboard API scope consistency", () => {
  it("scopes rows, totals and all-year charts to the same roster, including missing-report placeholders", async () => {
    const response = await GET(new Request("http://localhost/api/dashboard/latest?month=2026-02"));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.scope).toBe("source");
    expect(data.meta).toMatchObject({ siteCount: 2, reportCount: 2, reportedSiteCount: 1, missingReportCount: 1, missingYieldCount: 1, historicalSiteCount: 1 });
    expect(data.plants.map((p: { siteName: string }) => p.siteName).sort()).toEqual(["A", "Missing"]);
    expect(data.plants.find((p: { siteName: string }) => p.siteName === "Missing").inverterYieldKwh).toBeNull();
    expect(data.portfolio.monthlyYieldKwh).toBe(100);
    expect(data.portfolio.cumulativeYieldKwh).toBe(180);
    expect(data.yearTotals.map((y: { yieldKwh: number }) => y.yieldKwh)).toEqual([80, 100]);
    expect([...new Set(data.portfolioMonthlySeries.map((p: { year: number }) => p.year))]).toEqual([2025, 2026]);
  });
  it("includes historical-only reports and their energy only in history scope", async () => {
    const response = await GET(new Request("http://localhost/api/dashboard/latest?month=2026-02&scope=history"));
    const data = await response.json();
    expect(data.meta.siteCount).toBe(3);
    expect(data.plants).toHaveLength(3);
    expect(data.portfolio.monthlyYieldKwh).toBe(150);
    expect(data.portfolio.cumulativeYieldKwh).toBe(230);
  });
  it("discloses an unavailable roster without inventing a verified site count", async () => {
    mockDatabase(false);
    const data = await (await GET(new Request("http://localhost/api/dashboard/latest?month=2025-02"))).json();
    expect(data.meta).toMatchObject({ sourceAvailable: false, sourceSiteCount: null, siteCount: 1 });
  });
  it("returns an error instead of displaying a partially reconstructed verified roster", async () => {
    mockDatabase(true, 3);
    const response = await GET(new Request("http://localhost/api/dashboard/latest"));
    expect(response.status).toBe(500);
    expect((await response.json()).ok).toBe(false);
  });
});
