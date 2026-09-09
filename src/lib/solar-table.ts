export type ComparisonState = "ok" | "warn" | "bad" | "no-data";

export type ComparisonValue = {
  state: ComparisonState;
  deltaPct: number | null;
  deltaAbsKwh: number | null;
  baselineKwh: number | null;
};

export type YieldComparison = {
  mom: ComparisonValue;
  siteAvg: ComparisonValue;
  yoy: ComparisonValue;
};

export type YearTotal = {
  year: number;
  yieldKwh: number;
};

export type Status = "attention" | "watch" | "review" | "ok" | "no-data";

export type SiteSummary = {
  siteId: string;
  siteName: string;
  capacityKwp: number | null;
  inverterYieldKwh: number | null;
  riskLevel: "critical" | "high" | "watch" | "normal";
  riskScore: number;
  reasons: string[];
  actions: string[];
  comparison: YieldComparison;
  yearTotals: YearTotal[];
};

export type SiteTableRow = {
  siteId: string;
  siteName: string;
  capacityKwp: number | null;
  monthYieldKwh: number | null;
  yearYieldKwh: number | null;
  status: Status;
  reason: string;
  comparison: YieldComparison;
  alertScore: number;
  declineCount: number;
  vsLastMonthPct: number | null;
  vsSiteAvgPct: number | null;
  vsLastYearPct: number | null;
};

export const statusLabel: Record<Status, string> = {
  attention: "ตรวจสอบด่วน",
  watch: "เฝ้าระวัง",
  review: "พิจารณา",
  ok: "ปกติ",
  "no-data": "ยังไม่มีข้อมูล",
};

export const statusRank: Record<Status, number> = {
  attention: 0,
  "no-data": 1,
  watch: 2,
  review: 3,
  ok: 4,
};

export const siteTableColumnOrder = [
  "status",
  "siteName",
  "monthYieldKwh",
  "yearYieldKwh",
  "vsLastMonthPct",
  "vsSiteAvgPct",
  "vsLastYearPct",
] as const;

export const siteTableHeaderLabels: Record<(typeof siteTableColumnOrder)[number], string> = {
  status: "สถานะ",
  siteName: "ไซต์",
  monthYieldKwh: "เดือนนี้ (kWh)",
  yearYieldKwh: "ปีที่เลือก (kWh)",
  vsLastMonthPct: "เดือนก่อน",
  vsSiteAvgPct: "เทียบค่าเฉลี่ยไซต์",
  vsLastYearPct: "YoY (ปีก่อน)",
};

export const rightAlignedColumnIds = new Set(["monthYieldKwh", "yearYieldKwh", "vsLastMonthPct", "vsSiteAvgPct", "vsLastYearPct"]);
export const percentageColumnIds = new Set(["vsLastMonthPct", "vsSiteAvgPct", "vsLastYearPct"]);

export function buildSiteTableRows(sites: SiteSummary[], selectedYear: number | null): SiteTableRow[] {
  return sites.map((site) => toSiteTableRow(site, selectedYear));
}

export function compareSiteRowsByRisk(a: SiteTableRow, b: SiteTableRow): number {
  const rankDiff = statusRank[a.status] - statusRank[b.status];
  if (rankDiff !== 0) return rankDiff;
  const scoreDiff = b.alertScore - a.alertScore;
  if (scoreDiff !== 0) return scoreDiff;
  const countDiff = b.declineCount - a.declineCount;
  if (countDiff !== 0) return countDiff;
  const aWorst = worstDelta(a);
  const bWorst = worstDelta(b);
  if (aWorst !== bWorst) return aWorst - bWorst;
  return a.siteName.localeCompare(b.siteName, "th");
}

function toSiteTableRow(site: SiteSummary, selectedYear: number | null): SiteTableRow {
  const assessment = assessSite(site);
  return {
    siteId: site.siteId,
    siteName: site.siteName,
    capacityKwp: site.capacityKwp,
    monthYieldKwh: site.inverterYieldKwh,
    yearYieldKwh: selectedYear === null ? null : yieldForYear(site.yearTotals, selectedYear),
    status: assessment.status,
    reason: assessment.reason,
    comparison: site.comparison,
    alertScore: assessment.score,
    declineCount: assessment.declineCount,
    vsLastMonthPct: site.comparison.mom.deltaPct,
    vsSiteAvgPct: site.comparison.siteAvg.deltaPct,
    vsLastYearPct: site.comparison.yoy.deltaPct,
  };
}

function yieldForYear(yearTotals: YearTotal[], selectedYear: number): number | null {
  const match = yearTotals.find((item) => item.year === selectedYear);
  return match ? match.yieldKwh : null;
}

type Assessment = {
  status: Status;
  score: number;
  declineCount: number;
  reason: string;
};

type DeclineSignal = {
  key: "yoy" | "siteAvg" | "mom";
  label: string;
  deltaPct: number;
  severity: number;
};

function assessSite(site: SiteSummary): Assessment {
  if (site.inverterYieldKwh === null) {
    return { status: "no-data", score: 6, declineCount: 0, reason: "เดือนนี้ยังไม่มีค่าผลิตไฟ" };
  }

  if (site.inverterYieldKwh === 0) {
    return { status: "attention", score: 9, declineCount: 3, reason: "รายงานเดือนนี้ระบุผลผลิต 0 หน่วย ควรตรวจสอบ" };
  }

  const signals = collectDeclineSignals(site.comparison);
  const score = signals.reduce((total, signal) => total + signal.severity, 0);
  const declineCount = signals.filter((signal) => signal.severity > 0).length;
  const status = statusFromScore(score);

  return {
    status,
    score,
    declineCount,
    reason: buildAssessmentReason(site.comparison, signals, status),
  };
}

function statusFromScore(score: number): Status {
  if (score >= 6) return "attention";
  if (score >= 4) return "watch";
  if (score >= 2) return "review";
  return "ok";
}

function collectDeclineSignals(comparison: YieldComparison): DeclineSignal[] {
  const signals: DeclineSignal[] = [];
  const yoySeverity = comparison.yoy.deltaPct === null ? 0 : severityForPrimaryDecline(comparison.yoy.deltaPct);
  const siteAvgSeverity = comparison.siteAvg.deltaPct === null ? 0 : severityForPrimaryDecline(comparison.siteAvg.deltaPct);
  const momSeverity = comparison.mom.deltaPct === null ? 0 : severityForMonthDecline(comparison.mom.deltaPct);

  if (yoySeverity > 0 && comparison.yoy.deltaPct !== null) {
    signals.push({ key: "yoy", label: "ปีก่อน", deltaPct: comparison.yoy.deltaPct, severity: yoySeverity });
  }
  if (siteAvgSeverity > 0 && comparison.siteAvg.deltaPct !== null) {
    signals.push({ key: "siteAvg", label: "ค่าเฉลี่ยไซต์", deltaPct: comparison.siteAvg.deltaPct, severity: siteAvgSeverity });
  }
  if (momSeverity > 0 && comparison.mom.deltaPct !== null) {
    signals.push({ key: "mom", label: "เดือนก่อน", deltaPct: comparison.mom.deltaPct, severity: momSeverity });
  }

  return signals.sort((a, b) => b.severity - a.severity || a.deltaPct - b.deltaPct);
}

function severityForPrimaryDecline(deltaPct: number): number {
  const decline = -deltaPct;
  if (decline < 0.1) return 0;
  if (decline < 0.2) return 1;
  if (decline < 0.4) return 2;
  return 3;
}

function severityForMonthDecline(deltaPct: number): number {
  const decline = -deltaPct;
  if (decline < 0.15) return 0;
  if (decline < 0.25) return 1;
  if (decline < 0.4) return 2;
  return 3;
}

function buildAssessmentReason(comparison: YieldComparison, signals: DeclineSignal[], status: Status): string {
  if (status === "ok" || signals.length === 0) return "อยู่ในเกณฑ์ปกติ";

  const momIsRecovering = comparison.mom.deltaPct !== null && comparison.mom.deltaPct > 0;
  const nonMonthSignals = signals.filter((signal) => signal.key !== "mom");
  const strongest = signals[0];
  const labels = signals.slice(0, 2).map((signal) => signal.label).join("และ");

  if (momIsRecovering && nonMonthSignals.length > 0) {
    return `ฟื้นจากเดือนก่อน แต่ยังต่ำกว่า${nonMonthSignals.slice(0, 2).map((signal) => signal.label).join("และ")}`;
  }

  if (signals.length >= 2) return `ต่ำกว่า${labels}`;
  if (strongest.severity >= 2) return `ต่ำกว่า${strongest.label}มาก`;
  return `ต่ำกว่า${strongest.label}เล็กน้อย`;
}

function worstDelta(row: SiteTableRow): number {
  const values = [row.vsLastMonthPct, row.vsSiteAvgPct, row.vsLastYearPct].filter((value): value is number => value !== null);
  if (!values.length) return 0;
  return Math.min(...values);
}
