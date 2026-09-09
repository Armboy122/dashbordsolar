# Site count correction

The February 2026 Huawei export contains **72 unique site names**. Two independent issues produced the confusing 71/73 counts:

1. The workbook's declared worksheet range starts at `A4`, although the header is in row 2 and the first site, SKL, is in row 3. Reading the declared range lost that first site. The parser now reads from row 1 and retains rows with unavailable measurements.
2. The database retains a historical TYD report that is absent from this export. Counting all stored site names therefore returns 73. Historical records are useful and are not deleted to make the counter match.

The dashboard now defaults to the roster from a count-verified sync. Its table, portfolio totals and charts use the same roster; history scope additionally includes legacy names. Sites with missing monthly reports remain in the roster as missing-data entries. Counts are calculated from identities and reports, never hardcoded to 72.

The latest synced file may be a historical report. Its report month and sync time must stay visible; these are not proof that every site is currently operating.

## Verification

The February source scope has 72 sites and 93,406.49 kWh of inverter yield. History scope has 73 sites and the same yield, because the extra TYD row has no yield measurement. SKL is present in source scope. Three source sites have no yield measurement, which is distinct from a zero-yield report.

Regression tests cover malformed workbook ranges, missing measurements, roster versus historical counts, missing-month placeholders, fallback without a verified roster, totals/chart scope consistency, and refusal to present a partially reconstructed verified roster.

## UI changes

Kimi K3 through pi coding contributed the dashboard, neutral stylesheet, navigation and Ant Design theme. Integration adds consistent source/history navigation, missing-report notices, data coverage, and readable detail summaries. Search/status filters retain scope totals, attention cards are capped at four, and charts follow the selected year. Technical metrics remain available in a disclosure.

The imported `self_consumption_rate` column stores percentage points from Huawei's `(%)` column. The site-history API converts it to a fraction once for percentage formatters (97.651 becomes 97.651%, not 9,765.1%). Source/database values remain unchanged, including legitimate values below 1%. The detail screen also identifies energy-balance discrepancies present in the report without substituting invented values.

Validated with 82 tests, TypeScript and production build, plus desktop/mobile browser checks for counts, filters, year selection, site links, technical disclosure and missing-month navigation. Scheduling and a monthly data-editing form remain separate work; this change does not claim those are active.
