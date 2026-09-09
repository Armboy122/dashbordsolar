import { NextResponse } from "next/server";
import { sql } from "../../../../src/db/client";
import { buildPortfolioMonthlySeries } from "../../../../src/lib/analytics";
import { withTimeout } from "../../../../src/lib/async-timeout";
import {
  buildDashboardScope,
  type SourceRoster,
} from "../../../../src/lib/dashboard-scope";
import { buildCohortComparisonSeries } from "../../../../src/lib/portfolio-cohort";

export const runtime = "nodejs";

const DB_TIMEOUT_MS = 8000;

type MonthlyRow = {
  site_name: string;
  report_month: string;
  inverter_yield_kwh: string | null;
  export_kwh: string | null;
  import_kwh: string | null;
  consumption_kwh: string | null;
  self_consumption_kwh: string | null;
  self_consumption_rate: string | null;
  peak_power_kw: string | null;
  capacity_kwp: string | null;
  risk_score: string | null;
  risk_level: string | null;
  reasons_json: string | null;
  actions_json: string | null;
};

type ComparisonState = "ok" | "warn" | "bad" | "no-data";

type ComparisonValue = {
  state: ComparisonState;
  deltaPct: number | null;
  deltaAbsKwh: number | null;
  baselineKwh: number | null;
};

type YieldComparison = {
  mom: ComparisonValue;
  siteAvg: ComparisonValue;
  yoy: ComparisonValue;
};

type YearYield = {
  year: number;
  yieldKwh: number;
  reportCount: number;
};

type SiteSummary = {
  siteId: string;
  siteName: string;
  capacityKwp: number | null;
  inverterYieldKwh: number | null;
  riskLevel: "critical" | "high" | "watch" | "normal";
  riskScore: number;
  reasons: string[];
  actions: string[];
  comparison: YieldComparison;
  yearTotals: Array<{ year: number; yieldKwh: number }>;
};

type PortfolioHeadline = {
  monthlyYieldKwh: number | null;
  latestYearYieldKwh: number | null;
  cumulativeYieldKwh: number | null;
  installedCapacityKwp: number | null;
  latestYear: number | null;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedMonth = searchParams.get("month")?.trim() || "";
    const scope =
      searchParams.get("scope") === "history" ? "history" : "source";

    const [allRows, roster] = await Promise.all([
      withTimeout(
        sql`
      select
        site_name,
        report_month,
        inverter_yield_kwh,
        export_kwh,
        import_kwh,
        consumption_kwh,
        self_consumption_kwh,
        self_consumption_rate,
        peak_power_kw,
        capacity_kwp,
        risk_score,
        risk_level,
        reasons_json,
        actions_json
      from monthly_reports
      order by report_month asc, site_name asc
    `,
        DB_TIMEOUT_MS,
        "Dashboard query timed out",
      ) as Promise<MonthlyRow[]>,
      loadSourceRoster(),
    ]);

    const availableMonths = uniqueMonths(allRows);
    const availableYears = uniqueYears(allRows);
    const selectedMonth = availableMonths.includes(requestedMonth)
      ? requestedMonth
      : (availableMonths[availableMonths.length - 1] ?? "");

    if (!selectedMonth) {
      return NextResponse.json({
        ok: true,
        scope,
        selectedMonth: "",
        availableMonths: [],
        availableYears: [],
        meta: {
          siteCount: 0,
          reportCount: 0,
          firstMonth: "",
          latestMonth: "",
          sourceSiteCount: roster?.names.length ?? null,
          historicalSiteCount: 0,
          reportedSiteCount: 0,
          missingReportCount: 0,
          missingYieldCount: 0,
          rosterUpdatedAt: roster?.updatedAt ?? null,
          rosterReportMonth: roster?.reportMonth ?? null,
          sourceAvailable: roster !== null,
        },
        portfolio: null,
        portfolioMonthlySeries: [],
        cohortComparisonSeries: [],
        yearTotals: [],
        plants: [],
      });
    }

    const coverage = buildDashboardScope(allRows, selectedMonth, roster, scope);
    const rows = coverage.rows;
    const bySite = groupBySite(rows);
    const selectedBySite = new Map(
      coverage.monthRows.map((row) => [row.site_name, row]),
    );
    const latestMonth =
      availableMonths[availableMonths.length - 1] ?? selectedMonth;
    const firstMonth = availableMonths[0] ?? selectedMonth;

    const plants = coverage.names.map((name) => {
      const history = bySite.get(name) ?? [];
      const row = selectedBySite.get(name);
      if (row) return scoreEnergyRow(row, history);
      return scoreEnergyRow(
        {
          site_name: name,
          report_month: selectedMonth,
          inverter_yield_kwh: null,
          capacity_kwp: history[history.length - 1]?.capacity_kwp ?? null,
          export_kwh: null,
          import_kwh: null,
          consumption_kwh: null,
          self_consumption_kwh: null,
          self_consumption_rate: null,
          peak_power_kw: null,
          risk_score: null,
          risk_level: null,
          reasons_json: JSON.stringify(["ยังไม่มีรายงานสำหรับเดือนที่เลือก"]),
          actions_json: JSON.stringify(["ตรวจสอบหรือนำเข้ารายงานเดือนนี้"]),
        },
        history,
      );
    });
    const portfolio = buildPortfolioHeadline(rows, selectedMonth);
    const portfolioMonthlySeries = availableYears.flatMap((year) =>
      buildPortfolioMonthlySeries(
        rows.map((row) => ({
          reportMonth: row.report_month,
          inverterYieldKwh: row.inverter_yield_kwh,
        })),
        year,
      ),
    );
    const yearTotals = buildYearTotals(rows);
    // Read-only comparison basis. Does not change scoring, thresholds or stored data.
    const cohortComparisonSeries = buildCohortComparisonSeries(
      rows,
      selectedMonth,
      12,
    );

    return NextResponse.json({
      ok: true,
      scope,
      selectedMonth,
      availableMonths,
      availableYears,
      meta: {
        siteCount: plants.length,
        reportCount: rows.length,
        firstMonth,
        latestMonth,
        sourceSiteCount: coverage.sourceSiteCount,
        historicalSiteCount: coverage.historicalSiteCount,
        reportedSiteCount: coverage.reportedSiteCount,
        missingReportCount: coverage.missingReportCount,
        missingYieldCount: coverage.missingYieldCount,
        rosterUpdatedAt: coverage.rosterUpdatedAt,
        rosterReportMonth: coverage.rosterReportMonth,
        sourceAvailable: coverage.sourceAvailable,
      },
      portfolio,
      portfolioMonthlySeries,
      cohortComparisonSeries,
      yearTotals,
      plants: plants.sort((a, b) => sortSiteSummary(a, b)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Cannot load dashboard data",
      },
      { status: 500 },
    );
  }
}

async function loadSourceRoster(): Promise<SourceRoster | null> {
  const tables = await withTimeout(
    sql`select to_regclass('public.fusionsolar_sync_runs') as runs, to_regclass('public.fusionsolar_sources') as sources`,
    DB_TIMEOUT_MS,
    "Roster query timed out",
  );
  if (!tables[0]?.runs || !tables[0]?.sources) return null;
  const result = await withTimeout(
    sql`
    with latest as (
      select report_month, source_sha256, created_at, summary
      from fusionsolar_sync_runs
      where (summary->>'expectedSites') is not null
      order by created_at desc limit 1
    )
    select latest.report_month, latest.created_at, latest.summary->>'expectedSites' as expected_sites,
      array_agg(s.site_name order by s.site_name) as names
    from latest join fusionsolar_sources s
      on s.report_month=latest.report_month and s.source_sha256=latest.source_sha256
    group by latest.report_month, latest.created_at, latest.summary
  `,
    DB_TIMEOUT_MS,
    "Roster query timed out",
  );
  const row = result[0];
  if (!row) return null;
  const names = row.names as string[];
  if (names.length !== Number(row.expected_sites))
    throw new Error(
      "Source roster is incomplete; sync again before displaying site counts",
    );
  return {
    names,
    reportMonth: String(row.report_month),
    updatedAt: new Date(String(row.created_at)).toISOString(),
  };
}

function scoreEnergyRow(row: MonthlyRow, siteRows: MonthlyRow[]): SiteSummary {
  const inverterYield = toNumber(row.inverter_yield_kwh);
  const capacityKwp = toNumber(row.capacity_kwp);
  const riskScore = clampScore(toNumber(row.risk_score) ?? 0);
  const riskLevel = normalizeRiskLevel(row.risk_level, riskScore);
  const reasons = parseJsonList(row.reasons_json);
  const actions = parseJsonList(row.actions_json);
  const comparison = buildComparison(row, siteRows, inverterYield);

  return {
    siteId: slugify(row.site_name),
    siteName: row.site_name,
    capacityKwp,
    inverterYieldKwh: inverterYield,
    riskLevel,
    riskScore,
    reasons: reasons.length ? reasons : ["เดือนนี้ไม่มีเหตุผลประกอบ"],
    actions: actions.length ? actions : ["ยังไม่มีคำแนะนำ"],
    comparison,
    yearTotals: buildSiteYearTotals(siteRows),
  };
}

function buildComparison(
  row: MonthlyRow,
  siteRows: MonthlyRow[],
  current: number | null,
): YieldComparison {
  const sorted = siteRows
    .slice()
    .sort((a, b) => a.report_month.localeCompare(b.report_month));
  const index = sorted.findIndex(
    (item) => item.report_month === row.report_month,
  );
  const previous =
    index > 0 ? toNumber(sorted[index - 1].inverter_yield_kwh) : null;
  const avg = average(
    sorted
      .filter((item) => item.report_month !== row.report_month)
      .map((item) => toNumber(item.inverter_yield_kwh))
      .filter((value): value is number => value !== null && value > 0),
  );
  const lastYearRow = sorted.find(
    (item) => item.report_month === shiftYear(row.report_month, -1),
  );
  const lastYear = lastYearRow
    ? toNumber(lastYearRow.inverter_yield_kwh)
    : null;

  return {
    mom: makeComparison(current, previous),
    siteAvg: makeComparison(current, avg),
    yoy: makeComparison(current, lastYear),
  };
}

function buildPortfolioHeadline(
  rows: MonthlyRow[],
  selectedMonth: string,
): PortfolioHeadline {
  const currentRows = rows.filter((row) => row.report_month === selectedMonth);
  const monthlyYieldKwh = sum(
    currentRows.map((row) => toNumber(row.inverter_yield_kwh)),
  );
  const yearTotals = buildYearTotals(rows);
  const latestYearTotal = yearTotals[yearTotals.length - 1] ?? null;
  const cumulativeYieldKwh = sum(
    rows.map((row) => toNumber(row.inverter_yield_kwh)),
  );

  return {
    monthlyYieldKwh,
    latestYearYieldKwh: latestYearTotal?.yieldKwh ?? null,
    cumulativeYieldKwh,
    installedCapacityKwp: totalInstalledCapacity(rows),
    latestYear: latestYearTotal?.year ?? null,
  };
}

function buildYearTotals(rows: MonthlyRow[]): YearYield[] {
  const byYear = new Map<number, { yieldKwh: number; reportCount: number }>();

  for (const row of rows) {
    const year = yearFromMonth(row.report_month);
    if (year === null) continue;
    const value = toNumber(row.inverter_yield_kwh) ?? 0;
    const current = byYear.get(year) ?? { yieldKwh: 0, reportCount: 0 };
    current.yieldKwh += value;
    current.reportCount += 1;
    byYear.set(year, current);
  }

  return Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, value]) => ({
      year,
      yieldKwh: value.yieldKwh,
      reportCount: value.reportCount,
    }));
}

function buildSiteYearTotals(
  rows: MonthlyRow[],
): Array<{ year: number; yieldKwh: number }> {
  const byYear = new Map<number, number>();

  for (const row of rows) {
    const year = yearFromMonth(row.report_month);
    if (year === null) continue;
    const value = toNumber(row.inverter_yield_kwh) ?? 0;
    byYear.set(year, (byYear.get(year) ?? 0) + value);
  }

  return Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, yieldKwh]) => ({ year, yieldKwh }));
}

function totalInstalledCapacity(rows: MonthlyRow[]): number | null {
  const bySite = new Map<string, MonthlyRow[]>();
  for (const row of rows) {
    if (!bySite.has(row.site_name)) bySite.set(row.site_name, []);
    bySite.get(row.site_name)?.push(row);
  }

  let total = 0;
  let hasAny = false;

  Array.from(bySite.values()).forEach((siteRows) => {
    const sorted = siteRows
      .slice()
      .sort((a, b) => a.report_month.localeCompare(b.report_month));
    let capacity: number | null = null;
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const current = toNumber(sorted[index].capacity_kwp);
      if (current !== null) {
        capacity = current;
        break;
      }
    }
    if (capacity !== null) {
      total += capacity;
      hasAny = true;
    }
  });

  return hasAny ? total : null;
}

function makeComparison(
  current: number | null,
  baseline: number | null,
): ComparisonValue {
  if (current === null || baseline === null || baseline === 0) {
    return {
      state: "no-data",
      deltaPct: null,
      deltaAbsKwh: null,
      baselineKwh: baseline,
    };
  }

  const deltaPct = (current - baseline) / baseline;
  return {
    state: comparisonState(deltaPct),
    deltaPct,
    deltaAbsKwh: current - baseline,
    baselineKwh: baseline,
  };
}

function comparisonState(deltaPct: number): ComparisonState {
  if (deltaPct >= -0.02) return "ok";
  if (deltaPct >= -0.1) return "warn";
  return "bad";
}

function sortSiteSummary(a: SiteSummary, b: SiteSummary) {
  const rank = (value: ComparisonValue) =>
    value.state === "bad"
      ? 0
      : value.state === "warn"
        ? 1
        : value.state === "ok"
          ? 2
          : 3;
  const aWorst = Math.min(
    rank(a.comparison.mom),
    rank(a.comparison.siteAvg),
    rank(a.comparison.yoy),
  );
  const bWorst = Math.min(
    rank(b.comparison.mom),
    rank(b.comparison.siteAvg),
    rank(b.comparison.yoy),
  );

  if (aWorst !== bWorst) return aWorst - bWorst;
  const aDelta = worstDelta(a.comparison);
  const bDelta = worstDelta(b.comparison);
  if (aDelta !== bDelta) return aDelta - bDelta;
  return a.siteName.localeCompare(b.siteName, "th");
}

function worstDelta(comparison: YieldComparison): number {
  const values = [
    comparison.mom.deltaPct,
    comparison.siteAvg.deltaPct,
    comparison.yoy.deltaPct,
  ].filter((value): value is number => value !== null);
  return values.length ? Math.min(...values) : 0;
}

function normalizeRiskLevel(
  value: string | null,
  score: number,
): "critical" | "high" | "watch" | "normal" {
  if (
    value === "critical" ||
    value === "high" ||
    value === "watch" ||
    value === "normal"
  )
    return value;
  if (score >= 65) return "critical";
  if (score >= 38) return "high";
  if (score >= 16) return "watch";
  return "normal";
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function parseJsonList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function groupBySite(rows: MonthlyRow[]) {
  const bySite = new Map<string, MonthlyRow[]>();
  for (const row of rows) {
    if (!bySite.has(row.site_name)) bySite.set(row.site_name, []);
    bySite.get(row.site_name)?.push(row);
  }
  return bySite;
}

function uniqueMonths(rows: MonthlyRow[]) {
  return Array.from(new Set(rows.map((row) => row.report_month))).sort();
}

function uniqueYears(rows: MonthlyRow[]) {
  return Array.from(
    new Set(
      rows
        .map((row) => yearFromMonth(row.report_month))
        .filter((year): year is number => year !== null),
    ),
  ).sort((a, b) => a - b);
}

function yearFromMonth(month: string): number | null {
  const [yearPart] = month.split("-").map(Number);
  if (!Number.isFinite(yearPart)) return null;
  return yearPart;
}

function shiftMonth(month: string, delta: number): string {
  const [yearPart, monthPart] = month.split("-").map(Number);
  if (!Number.isFinite(yearPart) || !Number.isFinite(monthPart)) return month;
  const date = new Date(Date.UTC(yearPart, monthPart - 1 + delta, 1));
  const year = date.getUTCFullYear();
  const monthNum = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${monthNum}`;
}

function shiftYear(month: string, delta: number): string {
  const [yearPart, monthPart] = month.split("-").map(Number);
  if (!Number.isFinite(yearPart) || !Number.isFinite(monthPart)) return month;
  return `${yearPart + delta}-${String(monthPart).padStart(2, "0")}`;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sum(values: Array<number | null>): number | null {
  const nonNull = values.filter((value): value is number => value !== null);
  if (!nonNull.length) return null;
  return nonNull.reduce((total, value) => total + value, 0);
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9ก-๙-]/g, "")
    .slice(0, 80);
}
