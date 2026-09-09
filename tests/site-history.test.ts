import { describe, expect, it } from "vitest";
import {
  buildSiteHistoryPayload,
  decodeSiteParam,
  sourcePercentToFraction,
  type SiteHistoryDbRow,
} from "../src/lib/site-history";

describe("site history helpers", () => {
  it("converts source percentage points exactly once, including rates below one percent", () => {
    expect(sourcePercentToFraction("97.651")).toBeCloseTo(0.97651);
    expect(sourcePercentToFraction("0.886")).toBeCloseTo(0.00886);
    expect(sourcePercentToFraction(100)).toBe(1);
    expect(sourcePercentToFraction(0)).toBe(0);
    expect(sourcePercentToFraction(null)).toBeNull();
    expect(sourcePercentToFraction(101)).toBeNull();
  });
  it("decodes Next.js site params from plain, encoded, and catch-all values", async () => {
    await expect(decodeSiteParam({ siteId: "โรงไฟฟ้า A (เหนือ)" })).resolves.toBe("โรงไฟฟ้า A (เหนือ)");
    await expect(decodeSiteParam({ siteId: "โรงไฟฟ้า%20A%20%28เหนือ%29" })).resolves.toBe("โรงไฟฟ้า A (เหนือ)");
    await expect(decodeSiteParam({ siteId: ["โรงไฟฟ้า", "A", "01"] })).resolves.toBe("โรงไฟฟ้า/A/01");
  });

  it("maps Thai site history rows ascending and includes detail fields", () => {
    const payload = buildSiteHistoryPayload("โรงไฟฟ้า A (เหนือ)", [
      {
        report_month: "2024-02",
        site_name: "โรงไฟฟ้า A (เหนือ)",
        capacity_kwp: "51",
        inverter_yield_kwh: "125.5",
        pv_yield_kwh: "126",
        specific_energy: "2.47",
        export_kwh: "20",
        import_kwh: "15",
        consumption_kwh: "110",
        self_consumption_kwh: "105",
        self_consumption_rate: "84",
        peak_power_kw: "48",
        peak_ratio: "0.74",
        risk_score: "32",
        risk_level: "watch",
        reasons_json: "[\"peak ratio ต่ำ 74%\"]",
        actions_json: "[\"ตรวจ inverter\"]",
      },
      {
        report_month: "2024-01",
        site_name: "โรงไฟฟ้า A (เหนือ)",
        capacity_kwp: "50",
        inverter_yield_kwh: "120",
        pv_yield_kwh: "120",
        specific_energy: "2.4",
        export_kwh: "18",
        import_kwh: "14",
        consumption_kwh: "100",
        self_consumption_kwh: "96",
        self_consumption_rate: "81",
        peak_power_kw: "45",
        peak_ratio: "0.72",
        risk_score: "18",
        risk_level: "watch",
        reasons_json: null,
        actions_json: null,
      },
    ] satisfies SiteHistoryDbRow[]);

    expect(payload).toEqual({
      ok: true,
      site: "โรงไฟฟ้า A (เหนือ)",
      noData: false,
      rows: [
        {
          reportMonth: "2024-01",
          siteName: "โรงไฟฟ้า A (เหนือ)",
          capacityKwp: 50,
          pvYieldKwh: 120,
          inverterYieldKwh: 120,
          specificEnergy: 2.4,
          exportKwh: 18,
          importKwh: 14,
          consumptionKwh: 100,
          selfConsumptionKwh: 96,
          selfConsumptionRate: 0.81,
          peakPowerKw: 45,
          peakRatio: 0.72,
          performanceRatio: 0.72,
          riskScore: 18,
          riskLevel: "watch",
          reasons: [],
          actions: [],
        },
        {
          reportMonth: "2024-02",
          siteName: "โรงไฟฟ้า A (เหนือ)",
          capacityKwp: 51,
          pvYieldKwh: 126,
          inverterYieldKwh: 125.5,
          specificEnergy: 2.47,
          exportKwh: 20,
          importKwh: 15,
          consumptionKwh: 110,
          selfConsumptionKwh: 105,
          selfConsumptionRate: 0.84,
          peakPowerKw: 48,
          peakRatio: 0.74,
          performanceRatio: 0.74,
          riskScore: 32,
          riskLevel: "watch",
          reasons: ["peak ratio ต่ำ 74%"],
          actions: ["ตรวจ inverter"],
        },
      ],
    });
  });

  it("returns a useful no-data payload when no exact site match exists", () => {
    const payload = buildSiteHistoryPayload("โรงไฟฟ้า A", []);

    expect(payload).toEqual({
      ok: true,
      site: "โรงไฟฟ้า A",
      noData: true,
      rows: [],
    });
  });
});
