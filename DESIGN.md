# Solar Ops Dashboard — Design Spec

A calm, minimal dashboard for the PEA O&M team.

The home page answers exactly one question:

> **Which sites need attention this month?**

Everything else (consumption, peak, PR, revenue, raw history) lives on the
site detail page. The home page is for scanning. The detail page is for
investigating.

---

## 0. Stack reference

This spec targets the existing repo. Do **not** introduce a new framework or
design library to satisfy it.

- Next.js (App Router), React, TypeScript.
- Pages: `app/page.tsx` (home) and `app/sites/[siteId]/page.tsx` (detail).
- Components live under `src/components/`.
- Data: Drizzle + Postgres, `monthly_reports` table in `src/db/schema.ts`.
- Risk scoring already exists in `src/lib/scoring.ts` — reuse it, don't rewrite.

---

## 1. Product principles

1. **One question per screen.** Home answers attention only. No KPI grids.
2. **Quiet by default.** Light purple on white. No gradients, no shadows
   beyond 1dp, no decorative illustrations, no charts on the home page.
3. **Words a non-technical reader can parse.** No jargon on the home page.
   Technical terms (PR, specific yield, peak ratio) only appear in the
   detail page and the glossary.
4. **Empty is a real state.** When data is missing, say so. Never render
   `0`, `—`, or `NaN` in place of missing data.
5. **Compare, don't dump.** Inverter yield is always shown next to a
   baseline. A bare value is not allowed on the home page.

---

## 2. Visual system

### 2.1 Palette — light purple + white

The whole product uses one accent. Status colors are restrained and only
ever color a small dot, chip border, or 2px bar — never a whole row.

| Token              | Hex       | Usage                                     |
| ------------------ | --------- | ----------------------------------------- |
| `--bg`             | `#FBFAFE` | Page background                           |
| `--surface`        | `#FFFFFF` | Card / table surface                      |
| `--surface-muted`  | `#F5F2FB` | Hover, table stripe, chip background      |
| `--border`         | `#ECE7F6` | Default border                            |
| `--border-strong`  | `#D7CEEA` | Focused / selected border                 |
| `--ink`            | `#1F1B2E` | Primary text                              |
| `--ink-muted`      | `#6B6781` | Secondary text                            |
| `--ink-soft`       | `#9A95AE` | Captions, units, empty-state text         |
| `--primary`        | `#7C5CD3` | Light purple accent                       |
| `--primary-soft`   | `#EDE6FB` | Tinted backgrounds, badges                |
| `--primary-strong` | `#5B3FB3` | Hover / pressed / focus ring              |

Status colors (used sparingly):

| Status  | Token            | Hex       | Meaning                              |
| ------- | ---------------- | --------- | ------------------------------------ |
| ok      | `--status-ok`    | `#3F8F5C` | At or above expected yield           |
| watch   | `--status-warn`  | `#B07A1F` | Slightly below expected              |
| attention | `--status-bad` | `#B23A48` | Materially below expected            |
| no data | `--status-empty` | `#9A95AE` | Month not reported                   |

Risk-band thresholds (reuse `riskLevel` from `src/lib/scoring.ts`):

- `attention` ← `critical` or `high`
- `watch` ← `watch`
- `ok` ← `normal`

### 2.2 Typography

- System UI stack. Tabular numerals for all numbers (`tabular-nums`).
- Sizes:
  - H1 page title: 22 / 28, semibold
  - Site name: 16 / 22, medium
  - Body: 14 / 20, regular
  - Caption / unit: 12 / 16, regular, `--ink-soft`

### 2.3 Spacing, radius, borders

- Spacing scale: 4, 8, 12, 16, 20, 24, 32.
- Card/table radius: 14. Chip radius: 999.
- Borders: 1px `--border`. Selected: 1px `--border-strong`.
- Shadow: at most `0 1px 2px rgba(31, 27, 46, 0.04)`.

### 2.4 Motion

- 150ms ease-out, `transform` and `opacity` only.
- Honor `prefers-reduced-motion`.

---

## 3. Information architecture

Two routes. Three sections on home.

```
/                         → Home (the only page operators look at daily)
  Section 1: Sites that need attention   (risk-ranked overview)
  Section 2: All sites                   (clean table)
  Section 3: What the numbers mean       (collapsed glossary)

/sites/[siteId]           → Site detail (everything else)
```

Anything not listed above does not belong on the home page.

---

## 4. Home page

The home page compares **inverter yield only**. Every other metric is
demoted to the detail page.

### 4.1 Header

- H1: `Site health`
- Sub-line (single sentence, plain language):
  `Sites are sorted by how much attention they need this month.`
- Right-aligned month selector. Defaults to the latest month with data.

No KPI tiles. No portfolio totals. No charts.

### 4.2 Section 1 — Sites that need attention

A vertical list, **sorted highest risk first**, of every site that has
data this month. One row per site. Designed so a non-engineer can scan it
in five seconds.

Each row is a card with four pieces, in this order:

1. **Status pill** (left edge, `--status-*` color):
   `Needs attention` / `Watch` / `OK` / `No data`.
2. **Site name** (medium weight) and capacity in kWp (caption).
3. **This month's inverter yield** (display number, kWh).
4. **One short reason in plain language**, e.g.:
   - `Producing 38% less than usual.`
   - `Below last year by 22%.`
   - `No power generated this month.`
   - `Slightly below recent months.`
   - `On track.`

Optional small chip on the right: a single comparison delta
(e.g. `−18% vs avg`). One chip max, never three.

Rules for Section 1:

- Show **all** sites. Don't hide low-risk sites — operators want one
  scrollable list, not a hidden tab.
- Sort by risk descending. Within the same risk band, sort by the worst
  delta first.
- A site with no report this month renders the `No data` pill and a
  one-line explanation. It does not vanish.
- The whole row is a link to `/sites/[siteId]`. Hover: `--surface-muted`.
- Status color appears only on the left pill and a 2px left border. The
  rest of the row stays neutral.

This section is the answer to "which sites need attention?". Keep it
quiet. Resist the urge to add charts, sparklines, or extra numbers here.

### 4.3 Section 2 — All sites (table)

Below Section 1, a single table. This is the section operators use when
they want exact numbers, not vibes. Still inverter-yield-focused, still
no secondary metrics.

Columns, in order:

| Column           | Plain-language header     | Notes                                |
| ---------------- | ------------------------- | ------------------------------------ |
| Status           | `Status`                  | Same pill as Section 1               |
| Site name        | `Site`                    | Links to detail page                 |
| Capacity         | `Size (kWp)`              | Right-aligned, `--ink-soft`          |
| This month yield | `This month (kWh)`        | Right-aligned, tabular               |
| vs previous      | `vs last month`           | Signed %, tabular                    |
| vs site average  | `vs site average`         | Signed %, tabular                    |
| vs same month LY | `vs same month last year` | Signed %, tabular                    |

Rules:

- One header row, one row per site, alternating `--surface-muted` stripe.
- Sort: clickable column headers; default sort = same as Section 1
  (worst risk first).
- Empty cells render the small text `no data` in `--ink-soft`.
  Never `0`, `—`, or `N/A`.
- No totals row, no portfolio row, no sparkline column.
- Numbers right-aligned, names left-aligned, status left-aligned.

### 4.4 Section 3 — What the numbers mean

A collapsed `<details>` block at the bottom of the page, closed by default.
Opens to a short glossary of the three comparisons used above and the four
status pills. Plain language, no formulas. See §6.

This section exists so a new team member can self-serve. It is not the
primary surface and must not occupy space when closed.

### 4.5 What the home page must NOT show

- Revenue, payback, financial KPIs.
- Consumption, self-consumption, self-consumption rate.
- Peak power, peak ratio, performance ratio (PR).
- Specific yield / specific energy.
- Any chart, sparkline, or visualization.
- Risk score as a number (the pill is enough).
- Reason and action lists from `scoring.ts` (those go on the detail page).
- Multi-metric KPI strips, donut charts, "portfolio health" widgets.

If a future change requests one of these on the home page, it gets a new
route instead.

---

## 5. Site detail page — `/sites/[siteId]`

Everything that was removed from the home page lives here. The detail
page is allowed to be denser, because by the time an operator reaches it
they already know which site they care about.

### 5.1 Header

- H1: site name + capacity in kWp.
- Sub-line: status pill + the same one-line plain-language reason
  used in Section 1.
- Back link to `/`.

### 5.2 This month at a glance

The three inverter-yield comparisons from the home table, but rendered
larger:

- vs last month
- vs site average (all months for this site)
- vs same month last year

Each comparison shows: signed percent, absolute kWh delta, and a small
status dot. If a comparison cannot be computed, render the no-data
phrase from §7.

### 5.3 Secondary metrics table

A single table, one row per metric, in this fixed order. This is the
**only** place these metrics are shown.

| Metric              | Source field             | Unit  |
| ------------------- | ------------------------ | ----- |
| Consumption         | `consumption_kwh`        | kWh   |
| Self-consumption    | `self_consumption_kwh`   | kWh   |
| Self-consumption rate | `self_consumption_rate` | %     |
| Peak power          | `peak_power_kw`          | kW    |
| Performance ratio   | `peak_ratio`             | ratio |
| Specific yield      | `specific_energy`        | kWh/kWp |

Each row: metric name, current month value, unit, and a 12-month
sparkline. Missing months are gaps in the sparkline, never zeros.

### 5.4 Reasons & suggested checks

Below the metrics table, render `reasons` and `actions` from
`scoring.ts` as two short bulleted lists:

- `Why this site is flagged` (`reasons[]`)
- `Suggested checks` (`actions[]`)

These are the only place the existing Thai-language scoring text appears.
Keep it as-is from the scoring engine; do not rewrite into English.

### 5.5 History

A simple two-column list of the most recent 12 months: month label and
inverter yield. No chart needed; the sparklines in §5.3 already carry
the trend.

---

## 6. UI copy guidance

The home page is read by people who are not solar engineers. Use these
rules for any text shown on `/`.

**Do**
- Write full, calm sentences. `Producing less than usual.`
- State the comparison in words, not formulas. `Below last year by 22%.`
- Use `this month`, `last month`, `last year` — not `MoM`, `YoY`.
- Use `Needs attention`, `Watch`, `OK`, `No data` for status.
- Round percentages to whole numbers in narrative copy. Keep one decimal
  in the table column for precision.

**Don't**
- Don't use `MoM`, `YoY`, `PR`, `kWh/kWp`, or any acronym on the home page.
- Don't say `delta`, `variance`, `anomaly`, `outlier`.
- Don't use exclamation marks, emoji, or color-coded all-caps.
- Don't render `—`, `N/A`, `null`, `0` for missing data. Always use
  the `no data` phrase from §7.

**Reference copy table**

| Where          | Text                                                |
| -------------- | --------------------------------------------------- |
| Status pill    | `Needs attention`                                   |
| Status pill    | `Watch`                                             |
| Status pill    | `OK`                                                |
| Status pill    | `No data`                                           |
| Reason (high)  | `Producing far less than usual this month.`        |
| Reason (med)   | `Producing less than usual this month.`            |
| Reason (low)   | `Slightly below recent months.`                    |
| Reason (ok)    | `On track.`                                         |
| Reason (zero)  | `No power generated this month.`                   |
| Reason (empty) | `No report received for this month yet.`           |

The detail page may keep the existing Thai operational text from
`scoring.ts` for reasons/actions, since that page is read by O&M staff
who already use those phrases on the ground.

---

## 7. Empty / no-data states

Missing data is always rendered explicitly.

- Whole site missing this month:
  - Pill: `No data`
  - Row text: `No report received for this month yet.`
- A single comparison can't be computed:
  - `vs last month` → `No data for last month.`
  - `vs site average` → `Not enough history yet.`
  - `vs same month last year` → `No data for the same month last year.`
- A single table cell:
  - `no data` in `--ink-soft`, lowercase.
- No sites at all:
  - Whole-page message: `No reports imported yet. Import a monthly file to begin.`

The page layout (header, section titles, table headers) always renders
even when empty so the structure doesn't shift when data arrives.

---

## 8. Minimum data shape

The schema in `src/db/schema.ts` already has more fields than the home
page needs. Don't change it. The home page only needs the shape below.
The API layer is responsible for computing comparisons — the React
component must not recompute them on the client.

```ts
// GET /api/dashboard?month=YYYY-MM  (month optional; defaults to latest)
interface HomeResponse {
  monthLabel: string;             // e.g. "2026-04"
  availableMonths: string[];      // for the month selector
  sites: HomeSiteRow[];           // already sorted: worst risk first
}

interface HomeSiteRow {
  siteId: string;
  siteName: string;
  capacityKwp: number | null;

  yieldKwh: number | null;        // null = no report this month

  // Plain-language status, derived from existing scoring.ts riskLevel.
  status: "attention" | "watch" | "ok" | "no-data";
  reason: string;                 // one-line plain-language sentence (§6)

  // Three comparisons against inverter_yield_kwh. Each is null when it
  // can't be computed (no prior month, no history, etc.) — never 0.
  vsLastMonthPct: number | null;
  vsSiteAvgPct: number | null;
  vsSameMonthLastYearPct: number | null;
}
```

Notes for the data layer:

- All comparisons are against `inverter_yield_kwh` only.
- `siteAvg` is the average over every prior month with data, excluding
  the selected month itself.
- A missing prior period is `null`, not `0`. The API must distinguish
  `0 kWh produced` (a real, alarming value) from `no report imported`.
- `status` is computed from existing `riskLevel` in `scoring.ts`. Do
  not add a second risk model.

The detail page reuses the same row plus the secondary fields listed
in §5.3 and the existing `reasons` / `actions` arrays.

---

## 9. Components

Keep the component count small. Suggested split (refactor of the
existing `solar-dashboard.tsx` rather than a rewrite):

- `<HomePage />` — owns the month selector and renders Section 1, 2, 3.
- `<SiteRow />` — Section 1 list row.
- `<SiteTable />` — Section 2 table (header + rows).
- `<StatusPill />` — shared by both sections and the detail header.
- `<ComparisonCell />` — signed percent with no-data fallback.
- `<Glossary />` — the closed `<details>` block.

The existing `site-detail.tsx` can stay as the detail-page component; the
secondary metrics table in §5.3 is its main job. Strip any home-page-only
UI from it if present.

---

## 10. Accessibility

- All text meets WCAG AA contrast on `--bg` and `--surface`.
- Status is conveyed by both color and the pill text — never color alone.
- Focus ring: 2px `--primary-strong`, 2px offset.
- Tab order on home: month selector → Section 1 rows in order → Section 2
  rows in order → glossary toggle.
- Tables use `<th scope="col">` headers and a visible caption.
- The whole site row in Section 1 is a single `<a>` for one clean tab stop
  per site, not a card-with-button pattern.

---

## 11. Out of scope (do not add to home)

- Forecasts / predicted yield.
- Weather overlays.
- Financial KPIs (revenue, payback, tariffs).
- Cross-site benchmarking ("rank vs portfolio").
- Alerting / notifications UI.
- Any chart or sparkline on `/`.

If any of these are requested, they get a new route — not a new tile on
the home page.

---

## 12. Definition of done

A change to the dashboard is done when:

1. `/` shows three sections in order: risk-ranked list, table, glossary.
2. Section 1 lists every site, sorted worst risk first, with one
   plain-language reason per row and no charts.
3. Section 2 is a single table of inverter-yield comparisons, no
   secondary metrics.
4. No revenue, consumption, peak, PR, or specific-yield numbers appear
   anywhere on `/`.
5. Missing data is rendered with the §7 phrases — never `0`, `—`, `NaN`.
6. Visual tokens come from §2.1–§2.3. No ad-hoc hex values, radii, or
   shadows in component CSS.
7. `prefers-reduced-motion` is respected.
8. TypeScript builds clean with no new `any` introduced.
