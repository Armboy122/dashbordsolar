import type { CohortComparisonPoint } from "./portfolio-cohort";

export type Plant = {
  siteId: string;
  siteName: string;
  inverterYieldKwh: number | null;
  capacityKwp: number | null;
  riskLevel: string;
  riskScore: number;
  reasons: string[];
  actions: string[];
  comparison: Record<
    string,
    { state: string; deltaPct: number | null; baselineKwh: number | null }
  >;
};
export type Dashboard = {
  ok: boolean;
  error?: string;
  selectedMonth: string;
  availableMonths: string[];
  plants: Plant[];
  meta: {
    siteCount: number;
    reportedSiteCount: number;
    missingReportCount: number;
    missingYieldCount: number;
    rosterReportMonth: string | null;
    rosterUpdatedAt: string | null;
    sourceAvailable: boolean;
  };
  portfolio: { monthlyYieldKwh: number | null } | null;
  portfolioMonthlySeries: {
    month: string;
    totalYieldKwh: number | null;
    previousYearTotalYieldKwh: number | null;
  }[];
  cohortComparisonSeries?: CohortComparisonPoint[];
};
export type { CohortComparisonPoint };
export type ChartPoint = {
  month: string;
  value: number | null;
  previous: number | null;
};
export function shiftMonth(month: string, offset: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function rollingSeries(
  month: string,
  values: Map<string, number | null>,
): ChartPoint[] {
  if (!/^\d{4}-\d{2}$/.test(month)) return [];
  return Array.from({ length: 12 }, (_, i) => {
    const key = shiftMonth(month, i - 11);
    return {
      month: key,
      value: values.get(key) ?? null,
      previous: values.get(shiftMonth(key, -12)) ?? null,
    };
  });
}
export function number(value: number | null | undefined, decimals = 1) {
  return value == null || !Number.isFinite(value)
    ? "ไม่มีข้อมูล"
    : value.toLocaleString("th-TH", { maximumFractionDigits: decimals });
}
export function monthLabel(month: string, short = false) {
  if (!/^\d{4}-\d{2}$/.test(month)) return "ยังไม่มีเดือนรายงาน";
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("th-TH", {
    month: short ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
/**
 * Percentage change is only defined when the baseline is a usable positive
 * number. A zero or missing baseline yields null so callers cannot print a
 * misleading "increase".
 */
export function deltaPercent(
  current: number | null | undefined,
  baseline: number | null | undefined,
) {
  if (current == null || baseline == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return null;
  if (baseline <= 0) return null;
  return (current - baseline) / baseline;
}
export function signedNumber(value: number | null | undefined, decimals = 1) {
  if (value == null || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  const formatted = Math.abs(value).toLocaleString("th-TH", {
    maximumFractionDigits: decimals,
  });
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatted}`;
}
export function percentLabel(fraction: number | null | undefined) {
  if (fraction == null || !Number.isFinite(fraction)) return "เทียบเปอร์เซ็นต์ไม่ได้";
  const percent = fraction * 100;
  const formatted = Math.abs(percent).toLocaleString("th-TH", {
    maximumFractionDigits: 1,
  });
  return `${percent > 0 ? "+" : percent < 0 ? "−" : ""}${formatted}%`;
}
export function legacySignal(p: Plant) {
  return p.inverterYieldKwh !== null && p.riskLevel !== "normal";
}
export function selectPlants(plants: Plant[], q: string, filter: string) {
  return plants.filter(
    (p) =>
      p.siteName.toLocaleLowerCase().includes(q.toLocaleLowerCase()) &&
      (filter === "missing"
        ? p.inverterYieldKwh === null
        : filter === "signal"
          ? legacySignal(p)
          : true),
  );
}
export function plotPath(
  points: ChartPoint[],
  field: "value" | "previous",
  max: number,
  width = 760,
) {
  let drawing = false;
  return points
    .map((p, i) => {
      const v = p[field];
      if (v === null) {
        drawing = false;
        return "";
      }
      const command = drawing ? "L" : "M";
      drawing = true;
      return `${command}${48 + i * ((width - 78) / 11)},${218 - (v / max) * 180}`;
    })
    .join(" ");
}
