import { describe, expect, it } from "vitest";
import {
  getRiskBadgePresentation,
  getSiteDetailKpiLabel,
  getKpiTier,
} from "../src/lib/site-detail-presentation";

describe("site detail presentation helpers", () => {
  it("maps known KPI keys to Thai-primary labels with English subtitles", () => {
    expect(getSiteDetailKpiLabel({ key: "inverterYield", title: "Inverter yield" })).toEqual({
      primary: "ผลผลิตอินเวอร์เตอร์",
      secondary: "Inverter yield",
    });
    expect(getSiteDetailKpiLabel({ key: "selfConsumptionRate", title: "Self-consumption rate" })).toEqual({
      primary: "สัดส่วนใช้ไฟเอง",
      secondary: "Self-consumption rate",
    });
  });

  it("falls back safely for unknown KPI labels", () => {
    expect(getSiteDetailKpiLabel({ key: "customMetric", title: "Custom metric" })).toEqual({
      primary: "Custom metric",
      secondary: null,
    });
  });

  it("maps risk levels to semantic badge labels and classes", () => {
    expect(getRiskBadgePresentation("high")).toEqual({
      label: "ความเสี่ยงสูง",
      className: "risk-badge--high",
    });
    expect(getRiskBadgePresentation("watch")).toEqual({
      label: "เฝ้าระวัง",
      className: "risk-badge--medium",
    });
    expect(getRiskBadgePresentation("normal")).toEqual({
      label: "ปกติ",
      className: "risk-badge--low",
    });
  });

  it("returns an unknown state when risk level is missing", () => {
    expect(getRiskBadgePresentation(null)).toEqual({
      label: "ยังไม่มีระดับ",
      className: "risk-badge--unknown",
    });
  });
});

describe("getKpiTier", () => {
  it("classifies primary KPIs as primary tier", () => {
    expect(getKpiTier("inverterYield")).toBe("primary");
    expect(getKpiTier("specificEnergy")).toBe("primary");
    expect(getKpiTier("performanceRatio")).toBe("primary");
  });

  it("classifies secondary KPIs as secondary tier", () => {
    expect(getKpiTier("selfConsumptionRate")).toBe("secondary");
    expect(getKpiTier("energyBalanceGap")).toBe("secondary");
    expect(getKpiTier("loadBalanceGap")).toBe("secondary");
  });

  it("defaults unknown keys to secondary tier", () => {
    expect(getKpiTier("unknownMetric")).toBe("secondary");
    expect(getKpiTier("")).toBe("secondary");
  });
});
