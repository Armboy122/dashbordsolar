export type DashboardScope = "source" | "history";
export type SourceRoster = { names: string[]; updatedAt: string; reportMonth: string };
export type ScopeReport = { site_name: string; report_month: string; inverter_yield_kwh: string | number | null };

/** Report rows and site identities are different counts. Missing reports retain a site in the roster. */
export function buildDashboardScope<T extends ScopeReport>(rows: T[], month: string, roster: SourceRoster | null, scope: DashboardScope) {
  const allNames = [...new Set(rows.map(row => row.site_name))];
  const sourceNames = roster ? [...new Set(roster.names)] : null;
  const sourceSet = new Set(sourceNames ?? []);
  const names = scope === "history"
    ? [...new Set([...allNames, ...(sourceNames ?? [])])]
    : sourceNames ?? [...new Set(rows.filter(row => row.report_month === month).map(row => row.site_name))];
  const allowed = new Set(names);
  const scopedRows = rows.filter(row => allowed.has(row.site_name));
  const monthRows = scopedRows.filter(row => row.report_month === month);
  const reportingNames = new Set(monthRows.map(row => row.site_name));
  return {
    names: names.sort((a, b) => a.localeCompare(b, "th")),
    rows: scopedRows,
    monthRows,
    siteCount: names.length,
    sourceSiteCount: sourceNames?.length ?? null,
    historicalSiteCount: roster ? allNames.filter(name => !sourceSet.has(name)).length : 0,
    reportedSiteCount: reportingNames.size,
    missingReportCount: names.filter(name => !reportingNames.has(name)).length,
    missingYieldCount: names.filter(name => !monthRows.some(row => row.site_name === name && row.inverter_yield_kwh !== null)).length,
    rosterUpdatedAt: roster?.updatedAt ?? null,
    rosterReportMonth: roster?.reportMonth ?? null,
    sourceAvailable: roster !== null,
  };
}
