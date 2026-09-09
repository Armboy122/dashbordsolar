# FusionSolar Excel sync

Downloads the monthly **Plant Report** through Huawei's normal web UI. This is an interim connector until Northbound API access is available. It does not use private HTTP endpoints and does not change inverter settings or source measurements.

## Setup

Requires Node.js 22.15+ and the project's existing PostgreSQL schema (`NEON_DB`).

```bash
npm install
npx playwright install chromium
```

Supply `FUSIONSOLAR_USERNAME`, `FUSIONSOLAR_PASSWORD`, and `NEON_DB` through the worker's environment/secret manager. The existing project `.env` is loaded for `NEON_DB`. No credentials or browser cookies are committed or saved by the script. The current connector uses the English UI on `intl.fusionsolar.huawei.com`.

## Commands

Download and validate February without accessing the database:

```bash
npm run sync:fusionsolar -- --month 2026-02 --download-only
```

Download, validate, and preview database changes (no writes):

```bash
npm run sync:fusionsolar -- --month 2026-02
```

Download and import:

```bash
npm run sync:fusionsolar -- --month 2026-02 --apply
```

Import an already downloaded file, checking the expected report count:

```bash
npm run sync:fusionsolar -- --file '/absolute/path/Plant Report_02-2026.xlsx' --month 2026-02 --expected-sites 72 --apply
```

Without `--month`, the worker refreshes the previous month and current month using Asia/Bangkok time. This command is suitable for a daily worker schedule:

```bash
npm run sync:fusionsolar -- --apply
```

This repository change does not install a scheduler. Run it on an always-on machine with Chromium and the required environment. A serverless web request is not the intended runtime. A failure exits nonzero for a scheduler to report. Use `--headed` to diagnose the UI locally; CAPTCHA/OTP is not solved automatically.

## Validation and import behavior

- Confirms By plant / By month selection and requested month; verifies the downloaded filename and parsed count against the report's total.
- Saves the original Excel plus a `result.json` under ignored `cache/fusionsolar/`. Files may contain private operational data; the directory is owner-only.
- Supports the known 24-column headerless export and exports with column headers. Huawei's sample declares `A4:X74` while its header and first site are in rows 2 and 3; reading starts at row 1 to retain both. Sites with missing capacity/yield are retained, rather than silently discarded.
- Rejects duplicate normalized names, unexpected month, incomplete downloads, and reports with no inverter-yield data at all.
- Uses existing exact site names. Whitespace/case collisions with the site registry require explicit mapping. Full stable-ID/alias migration is still separate work.
- Never deletes a site or monthly report just because it is missing from this export. `missingFromSource` identifies those records. The historical registry count can therefore exceed the current FusionSolar count.
- PostgreSQL transaction and table locks protect the complete import, audit snapshot, and analysis rebuild. A failed import rolls back the entire month's changes. Two months are separate transactions.
- Reuses the app's peer scoring and historical-analysis rules. Historical queries are batched for the worker.
- Historic imports do not replace a site's more recent installed-capacity record.

## Dashboard site counts

The default dashboard uses the names from the latest successfully imported export with a verified `expectedSites` count. Browser downloads supply this count from Huawei; local-file imports must use `--expected-sites`. The screen identifies the source report month and sync time, because syncing an old report does not establish today's active roster.

`GET /api/dashboard/latest?month=2026-02&scope=source` uses that roster for the table, headline totals, and charts. A site remains visible when its selected-month report is missing. `scope=history` additionally includes historical-only names without deleting or changing their reports. When no verified roster exists, the default uses selected-month report names and reports `sourceAvailable: false`.

Site count, sites with reports, and sites without yield measurements are separate values. Search and status filters only narrow visible table rows; they do not change the portfolio scope.

## Preserving local changes

`fusionsolar_sources` keeps the latest source values separately from `monthly_reports` (the effective values consumed by the dashboard).

On the first sync, any existing non-null field that differs from the downloaded value is protected for review; an initially missing field may be filled. On later syncs, a field changed since the last source value is protected. Once protected, it stays protected across runs. Other fields continue refreshing normally. `protectedSites` lists affected fields in `result.json`.

This conservative rule cannot determine whether an initial difference was a manual correction or a stale import. Review the stored source values and `fusionsolar_sync_runs.before_rows` before reconciling differences. Do not delete a protected flag casually: the data-editing UI and an explicit "use source value" workflow are planned separately.

Every committed run records its source hash, original month rows, and outcome in `fusionsolar_sync_runs`. `import_files` records successful imports. Repeated runs do not create duplicate site/month records.

## Recovery

- Login error: check the account interactively. The worker does not repeatedly submit failed credentials. Login diagnostics redact supplied credentials.
- UI/export timeout: inspect the local diagnostic file, confirm the page layout, and update selectors if Huawei changed the UI.
- Partial export: keep the original file, investigate the report count; never bypass the check simply to get a successful import.
- A local lock prevents overlapping runs. After a killed process, verify that no worker is running before removing `cache/fusionsolar/sync.lock`.
- An always-on schedule needs monitoring for nonzero exit codes and occasional manual login intervention. This is less reliable than the official API.
