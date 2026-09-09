/**
 * Year-over-year comparison that keeps the compared group explicit.
 *
 * A portfolio total for one month and the same month a year earlier can cover
 * different sites. Presenting those two totals as a performance comparison is
 * wrong, so every point also carries the matched cohort: sites that reported a
 * usable value in BOTH months. null is never treated as 0 and a percentage is
 * only produced when the baseline is strictly positive.
 */

export type CohortReportRow = {
  site_name: string;
  report_month: string;
  inverter_yield_kwh: string | number | null;
};

export type CohortComparisonPoint = {
  month: string;
  /** Sum of usable values in this month, across every scoped site. null when nothing usable. */
  totalYieldKwh: number | null;
  /** How many scoped sites had a usable value in this month. */
  siteCountWithValue: number;
  /** Same month one year earlier, same scope. */
  previousYearMonth: string;
  previousYearTotalYieldKwh: number | null;
  previousYearSiteCountWithValue: number;
  /** Sites with a usable value in both months. Comparison basis. */
  cohortSiteCount: number;
  cohortCurrentKwh: number | null;
  cohortPreviousKwh: number | null;
  cohortDeltaKwh: number | null;
  /** Only when cohortPreviousKwh > 0. Fraction, not percent. */
  cohortDeltaPct: number | null;
  /** True when the two totals cover different site sets. */
  membershipDiffers: boolean;
};

export function shiftMonthKey(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(monthNumber)) return month;
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function usableValue(value: string | number | null): number | null {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** month -> siteName -> usable value. Rows without a usable value are omitted, not zeroed. */
function indexUsableValues(
  rows: CohortReportRow[],
): Map<string, Map<string, number>> {
  const index = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const value = usableValue(row.inverter_yield_kwh);
    if (value === null) continue;
    const bucket = index.get(row.report_month) ?? new Map<string, number>();
    bucket.set(row.site_name, value);
    index.set(row.report_month, bucket);
  }
  return index;
}

function sumValues(values: Iterable<number>): number | null {
  let total = 0;
  let seen = false;
  for (const value of values) {
    total += value;
    seen = true;
  }
  return seen ? total : null;
}

/**
 * Builds `length` consecutive months ending at `endMonth` (inclusive).
 * Rows must already be limited to the selected dashboard scope.
 */
export function buildCohortComparisonSeries(
  rows: CohortReportRow[],
  endMonth: string,
  length = 12,
): CohortComparisonPoint[] {
  if (!/^\d{4}-\d{2}$/.test(endMonth) || length < 1) return [];
  const index = indexUsableValues(rows);

  return Array.from({ length }, (_, position) => {
    const month = shiftMonthKey(endMonth, position - (length - 1));
    const previousYearMonth = shiftMonthKey(month, -12);
    const current = index.get(month) ?? new Map<string, number>();
    const previous = index.get(previousYearMonth) ?? new Map<string, number>();

    const cohortNames = [...current.keys()].filter((name) =>
      previous.has(name),
    );
    const cohortCurrentKwh = sumValues(
      cohortNames.map((name) => current.get(name) as number),
    );
    const cohortPreviousKwh = sumValues(
      cohortNames.map((name) => previous.get(name) as number),
    );
    const cohortDeltaKwh =
      cohortCurrentKwh === null || cohortPreviousKwh === null
        ? null
        : cohortCurrentKwh - cohortPreviousKwh;
    const cohortDeltaPct =
      cohortDeltaKwh === null ||
      cohortPreviousKwh === null ||
      cohortPreviousKwh <= 0
        ? null
        : cohortDeltaKwh / cohortPreviousKwh;

    return {
      month,
      totalYieldKwh: sumValues(current.values()),
      siteCountWithValue: current.size,
      previousYearMonth,
      previousYearTotalYieldKwh: sumValues(previous.values()),
      previousYearSiteCountWithValue: previous.size,
      cohortSiteCount: cohortNames.length,
      cohortCurrentKwh,
      cohortPreviousKwh,
      cohortDeltaKwh,
      cohortDeltaPct,
      membershipDiffers:
        current.size !== previous.size ||
        cohortNames.length !== current.size ||
        cohortNames.length !== previous.size,
    };
  });
}
