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

export type MonthlyPortfolioInput = {
  reportMonth: string;
  inverterYieldKwh: number | string | null;
};

export type MonthlyPortfolioSeriesPoint = {
  reportMonth: string;
  currentYearYieldKwh: number | null;
  previousYearSameMonthYieldKwh: number | null;
};

export type PortfolioMonthlySeriesPoint = {
  month: string;
  year: number;
  monthNumber: number;
  totalYieldKwh: number | null;
  previousYearTotalYieldKwh: number | null;
  deltaPct: number | null;
};

export type PortfolioComparisonChartPoint = {
  monthNumber: number;
  monthLabel: string;
  currentYearYieldKwh: number | null;
  previousYearSameMonthYieldKwh: number | null;
};

export type PortfolioChartScale = {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  yMin: number;
  yMax: number;
  xForMonth: (monthNumber: number) => number;
  yForValue: (value: number | null) => number | null;
};

const MONTH_SHORT_LABELS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export type SiteHistoryInput = {
  reportMonth: string;
  inverterYieldKwh: number | string | null;
  capacityKwp: number | string | null;
  consumptionKwh: number | string | null;
  selfConsumptionKwh: number | string | null;
  selfConsumptionRate: number | string | null;
  peakPowerKw: number | string | null;
  exportKwh: number | string | null;
  importKwh: number | string | null;
  baselineInverterYield: number | string | null;
  productionPercent: number | string | null;
  energyBalanceGapKwh: number | string | null;
  loadBalanceGapKwh: number | string | null;
  performanceRatio: number | string | null;
};

export type SiteHistoryYearTotal = {
  year: number;
  yieldKwh: number;
};

export type SiteHistoryView = {
  rows: SiteHistoryInput[];
  yearTotals: SiteHistoryYearTotal[];
  comparison: YieldComparison;
};

export function buildMonthlyPortfolioSeries(rows: MonthlyPortfolioInput[], selectedYear?: number): MonthlyPortfolioSeriesPoint[] {
  const years = uniqueYears(rows);
  const effectiveYear = selectedYear ?? years[years.length - 1] ?? null;
  if (effectiveYear === null) return [];

  const months = uniqueMonths(rows)
    .filter((reportMonth) => yearFromMonth(reportMonth) === effectiveYear)
    .sort((a, b) => a.localeCompare(b));

  return months.map((reportMonth) => ({
    reportMonth,
    currentYearYieldKwh: sumByMonth(rows, reportMonth),
    previousYearSameMonthYieldKwh: sumByMonth(rows, shiftYear(reportMonth, -1)),
  }));
}

export function buildPortfolioMonthlySeries(rows: MonthlyPortfolioInput[], selectedYear?: number): PortfolioMonthlySeriesPoint[] {
  const years = uniqueYears(rows);
  const effectiveYear = selectedYear ?? years[years.length - 1] ?? null;
  if (effectiveYear === null) return [];

  const monthNumbers = Array.from(
    new Set(
      rows
        .map((row) => yearMonthParts(row.reportMonth))
        .filter((parts): parts is { year: number; monthNumber: number } => parts !== null)
        .filter(({ year }) => year === effectiveYear || year === effectiveYear - 1)
        .map(({ monthNumber }) => monthNumber),
    ),
  ).sort((a, b) => a - b);

  return monthNumbers.map((monthNumber) => {
    const month = formatYearMonth(effectiveYear, monthNumber);
    const previousMonth = formatYearMonth(effectiveYear - 1, monthNumber);
    const totalYieldKwh = sumByMonth(rows, month);
    const previousYearTotalYieldKwh = sumByMonth(rows, previousMonth);
    const deltaPct =
      totalYieldKwh === null || previousYearTotalYieldKwh === null || previousYearTotalYieldKwh === 0
        ? null
        : (totalYieldKwh - previousYearTotalYieldKwh) / previousYearTotalYieldKwh;

    return {
      month,
      year: effectiveYear,
      monthNumber,
      totalYieldKwh,
      previousYearTotalYieldKwh,
      deltaPct,
    };
  });
}

export function buildPortfolioComparisonPoints(
  series: PortfolioMonthlySeriesPoint[],
  selectedYear?: number,
): PortfolioComparisonChartPoint[] {
  const effectiveYear = selectedYear ?? series[series.length - 1]?.year ?? null;
  if (effectiveYear === null) return [];

  const pointsByMonth = new Map(series.map((item) => [item.monthNumber, item] as const));
  return Array.from({ length: 12 }, (_, index) => {
    const monthNumber = index + 1;
    const source = pointsByMonth.get(monthNumber);

    return {
      monthNumber,
      monthLabel: MONTH_SHORT_LABELS[index] ?? String(monthNumber),
      currentYearYieldKwh: source?.year === effectiveYear ? source.totalYieldKwh : null,
      previousYearSameMonthYieldKwh: source?.year === effectiveYear ? source.previousYearTotalYieldKwh : null,
    };
  });
}

export function buildPortfolioChartScale(points: PortfolioComparisonChartPoint[], width: number, height: number): PortfolioChartScale {
  const padding = { top: 20, right: 20, bottom: 28, left: 44 };
  const usableWidth = Math.max(width - padding.left - padding.right, 1);
  const usableHeight = Math.max(height - padding.top - padding.bottom, 1);
  const values = points.flatMap((point) => [point.currentYearYieldKwh, point.previousYearSameMonthYieldKwh]);
  const numericValues = values.filter((value): value is number => value !== null);
  const yMax = numericValues.length ? Math.max(...numericValues) : 0;

  return {
    width,
    height,
    padding,
    yMin: 0,
    yMax,
    xForMonth(monthNumber) {
      return padding.left + ((monthNumber - 1) / 11) * usableWidth;
    },
    yForValue(value) {
      if (value === null) return null;
      if (yMax === 0) return height - padding.bottom;
      return padding.top + (1 - value / yMax) * usableHeight;
    },
  };
}

export function buildSiteHistoryView(rows: SiteHistoryInput[], selectedMonth: string): SiteHistoryView {
  const sortedRows = rows.slice().sort((a, b) => a.reportMonth.localeCompare(b.reportMonth));
  const selectedIndex = sortedRows.findIndex((row) => row.reportMonth === selectedMonth);
  const selectedRow = selectedIndex >= 0 ? sortedRows[selectedIndex] : null;

  return {
    rows: sortedRows,
    yearTotals: buildYearTotals(sortedRows),
    comparison: buildComparison(sortedRows, selectedIndex >= 0 ? selectedIndex : sortedRows.length - 1),
  };
}

export function buildSiteHistoryUrl(siteName: string): string {
  return `/api/sites/history?site=${encodeURIComponent(siteName)}`;
}

function buildComparison(rows: SiteHistoryInput[], selectedIndex: number): YieldComparison {
  const selectedRow = rows[selectedIndex] ?? null;
  const current = toNumber(selectedRow?.inverterYieldKwh ?? null);

  if (current === null) {
    return emptyComparison();
  }

  const previous = selectedIndex > 0 ? toNumber(rows[selectedIndex - 1].inverterYieldKwh) : null;
  const avg = average(
    rows
      .filter((_, index) => index !== selectedIndex)
      .map((row) => toNumber(row.inverterYieldKwh))
      .filter((value): value is number => value !== null && value > 0),
  );
  const lastYear = toNumber(rows.find((row) => row.reportMonth === shiftYear(selectedRow.reportMonth, -1))?.inverterYieldKwh ?? null);

  return {
    mom: makeComparison(current, previous),
    siteAvg: makeComparison(current, avg),
    yoy: makeComparison(current, lastYear),
  };
}

function makeComparison(current: number | null, baseline: number | null): ComparisonValue {
  if (current === null || baseline === null || baseline === 0) {
    return { state: "no-data", deltaPct: null, deltaAbsKwh: null, baselineKwh: null };
  }

  const deltaAbsKwh = current - baseline;
  const deltaPct = deltaAbsKwh / baseline;
  const state: ComparisonState = deltaPct >= 0 ? "ok" : Math.abs(deltaPct) < 0.1 ? "warn" : "bad";

  return { state, deltaPct, deltaAbsKwh, baselineKwh: baseline };
}

function emptyComparison(): YieldComparison {
  const value: ComparisonValue = { state: "no-data", deltaPct: null, deltaAbsKwh: null, baselineKwh: null };
  return { mom: value, siteAvg: value, yoy: value };
}

function buildYearTotals(rows: SiteHistoryInput[]): SiteHistoryYearTotal[] {
  const byYear = new Map<number, number>();

  for (const row of rows) {
    const year = yearFromMonth(row.reportMonth);
    if (year === null) continue;
    byYear.set(year, (byYear.get(year) ?? 0) + (toNumber(row.inverterYieldKwh) ?? 0));
  }

  return Array.from(byYear.entries())
    .sort(([left], [right]) => left - right)
    .map(([year, yieldKwh]) => ({ year, yieldKwh }));
}

function uniqueYears(rows: MonthlyPortfolioInput[]): number[] {
  return Array.from(new Set(rows.map((row) => yearFromMonth(row.reportMonth)).filter((year): year is number => year !== null))).sort((a, b) => a - b);
}

function uniqueMonths(rows: MonthlyPortfolioInput[]): string[] {
  return Array.from(new Set(rows.map((row) => row.reportMonth))).sort((left, right) => left.localeCompare(right));
}

function sumByMonth(rows: MonthlyPortfolioInput[], reportMonth: string): number | null {
  const matches = rows
    .filter((row) => row.reportMonth === reportMonth)
    .map((row) => toNumber(row.inverterYieldKwh))
    .filter((value): value is number => value !== null);

  if (!matches.length) return null;
  return matches.reduce((total, value) => total + value, 0);
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function toNumber(value: number | string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function yearFromMonth(reportMonth: string): number | null {
  const year = Number(reportMonth.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function yearMonthParts(reportMonth: string): { year: number; monthNumber: number } | null {
  const [yearPart, monthPart] = reportMonth.split("-");
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);
  if (!Number.isFinite(year) || !Number.isFinite(monthNumber)) return null;
  return { year, monthNumber };
}

function formatYearMonth(year: number, monthNumber: number): string {
  return `${year}-${String(monthNumber).padStart(2, "0")}`;
}

function shiftYear(reportMonth: string, yearDelta: number): string {
  const [yearPart, monthPart] = reportMonth.split("-");
  const year = Number(yearPart);
  if (!Number.isFinite(year) || !monthPart) return reportMonth;
  return `${year + yearDelta}-${monthPart}`;
}

export type PortfolioInsight = {
  totalMonthsCompared: number;
  monthsAhead: number;
  monthsBehind: number;
  averageDeltaPct: number | null;
};

export function buildPortfolioInsight(series: PortfolioComparisonChartPoint[]): PortfolioInsight {
  let monthsAhead = 0;
  let monthsBehind = 0;
  let deltaSum = 0;
  let deltaCount = 0;

  for (const point of series) {
    if (point.currentYearYieldKwh === null || point.previousYearSameMonthYieldKwh === null) continue;
    if (point.currentYearYieldKwh >= point.previousYearSameMonthYieldKwh) {
      monthsAhead++;
    } else {
      monthsBehind++;
    }
    if (point.previousYearSameMonthYieldKwh > 0) {
      deltaSum += (point.currentYearYieldKwh - point.previousYearSameMonthYieldKwh) / point.previousYearSameMonthYieldKwh;
      deltaCount++;
    }
  }

  return {
    totalMonthsCompared: monthsAhead + monthsBehind,
    monthsAhead,
    monthsBehind,
    averageDeltaPct: deltaCount > 0 ? deltaSum / deltaCount : null,
  };
}

export type MonthDelta = {
  deltaAbsKwh: number | null;
  deltaPct: number | null;
  previousYearKwh: number | null;
};

export function findMonthDelta(
  series: PortfolioMonthlySeriesPoint[],
  reportMonth: string,
): MonthDelta | null {
  const point = series.find((p) => p.month === reportMonth);
  if (!point) return null;
  return {
    deltaAbsKwh:
      point.totalYieldKwh !== null && point.previousYearTotalYieldKwh !== null
        ? point.totalYieldKwh - point.previousYearTotalYieldKwh
        : null,
    deltaPct: point.deltaPct,
    previousYearKwh: point.previousYearTotalYieldKwh,
  };
}
