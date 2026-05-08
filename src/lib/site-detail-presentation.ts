export type SiteDetailKpiDescriptor = {
  key?: string;
  title: string;
};

export type SiteDetailLabelPresentation = {
  primary: string;
  secondary: string | null;
};

export type RiskBadgePresentation = {
  label: string;
  className: string;
};

const KPI_LABELS_BY_KEY: Record<string, SiteDetailLabelPresentation> = {
  inverterYield: {
    primary: "ผลผลิตอินเวอร์เตอร์",
    secondary: "Inverter yield",
  },
  specificEnergy: {
    primary: "ผลผลิตต่อกำลังติดตั้ง",
    secondary: "Specific energy",
  },
  performanceRatio: {
    primary: "อัตรากำลังสูงสุด",
    secondary: "Peak ratio",
  },
  selfConsumptionRate: {
    primary: "สัดส่วนใช้ไฟเอง",
    secondary: "Self-consumption rate",
  },
  energyBalanceGap: {
    primary: "ช่องว่างสมดุลพลังงาน",
    secondary: "Energy balance gap",
  },
  loadBalanceGap: {
    primary: "ช่องว่างสมดุลโหลด",
    secondary: "Load balance gap",
  },
};

const KPI_LABELS_BY_TITLE: Record<string, SiteDetailLabelPresentation> = {
  "Inverter yield": KPI_LABELS_BY_KEY.inverterYield,
  "Specific energy": KPI_LABELS_BY_KEY.specificEnergy,
  "Peak ratio": KPI_LABELS_BY_KEY.performanceRatio,
  "Self-consumption rate": KPI_LABELS_BY_KEY.selfConsumptionRate,
  "Energy balance gap": KPI_LABELS_BY_KEY.energyBalanceGap,
  "Load balance gap": KPI_LABELS_BY_KEY.loadBalanceGap,
};

const RISK_BADGES: Record<string, RiskBadgePresentation> = {
  high: {
    label: "ความเสี่ยงสูง",
    className: "risk-badge--high",
  },
  critical: {
    label: "ความเสี่ยงสูง",
    className: "risk-badge--high",
  },
  medium: {
    label: "เฝ้าระวัง",
    className: "risk-badge--medium",
  },
  watch: {
    label: "เฝ้าระวัง",
    className: "risk-badge--medium",
  },
  low: {
    label: "ปกติ",
    className: "risk-badge--low",
  },
  normal: {
    label: "ปกติ",
    className: "risk-badge--low",
  },
};

export function getSiteDetailKpiLabel(kpi: SiteDetailKpiDescriptor): SiteDetailLabelPresentation {
  if (kpi.key && KPI_LABELS_BY_KEY[kpi.key]) {
    return KPI_LABELS_BY_KEY[kpi.key];
  }

  if (KPI_LABELS_BY_TITLE[kpi.title]) {
    return KPI_LABELS_BY_TITLE[kpi.title];
  }

  return {
    primary: kpi.title,
    secondary: null,
  };
}

const PRIMARY_KPI_KEYS = new Set(["inverterYield", "specificEnergy", "performanceRatio"]);

/**
 * Returns the visual tier for a KPI card.
 * Primary KPIs (inverterYield, specificEnergy, performanceRatio) get larger type.
 * Secondary KPIs get muted/smaller type.
 */
export function getKpiTier(key: string): "primary" | "secondary" {
  return PRIMARY_KPI_KEYS.has(key) ? "primary" : "secondary";
}

export function getRiskBadgePresentation(level: string | null | undefined): RiskBadgePresentation {
  if (!level) {
    return {
      label: "ยังไม่มีระดับ",
      className: "risk-badge--unknown",
    };
  }

  return RISK_BADGES[level.toLowerCase()] ?? {
    label: "ยังไม่มีระดับ",
    className: "risk-badge--unknown",
  };
}
