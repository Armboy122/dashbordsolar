# UX/UI Pro Polish Phase 2 — Implementation Spec

> Design direction, component contracts, and acceptance criteria for the Solar Operations Command Center upgrade.

---

## 1. Design Direction: Solar Operations Command Center

### Vision Statement

The dashboard should feel like a professional operations tool used by people who manage solar assets for a living — not a data spreadsheet. The operator should be able to open the page, scan the headline numbers in 5 seconds, and know immediately which sites need attention today.

### Guiding Principles

- Hierarchy before density: the most critical information (alert count, total yield, largest decline) must be visible without scrolling.
- Operational calm: a page with no alerts should look quiet and reassuring, not empty.
- Action-oriented cards: every risk card should leave the operator with one clear next step.
- Thai-first typography: primary labels are Thai; English technical terms (kWh, kWp, ratio) appear as secondary sublabels or units, never as primary headings.
- Consistent color grammar: purple (#7c5cd3) = primary/good, red (#c45b6e) = urgent/bad, amber (#b8974a) = watch, gray = muted/empty. Do not add new semantic colors without changing this spec.

### Visual Upgrade Goals (Phase 2)

The current first pass is functional but has these UX weaknesses:

1. The ImportPanel is always visible above the KPI cards, breaking the visual hierarchy — data consumers see the import form before they see the numbers.
2. The summary cards show totals but no context (no delta vs. prior year, no trend signal).
3. The portfolio comparison chart lacks a readable insight summary (the user must stare at the chart to understand if the current year is trending ahead or behind).
4. The risk cards display three ComparisonBlocks (MoM / SiteAvg / YoY) as a flat list — they all look equally important even when only YoY and SiteAvg are significant.
5. The main AntD table mixes "percent-only" comparison columns with no absolute kWh delta, making it hard to judge severity.
6. The site detail KPI grid shows 6 cards at the same visual weight; the three most actionable (inverter yield, specific energy, peak ratio) should dominate.

---

## 2. Dashboard Page Layout (home `/`)

### 2.1 Page Structure (top to bottom)

```
[1] PageHeader     — title + month selector + collapse-toggle for import form
[2] AlertBanner    — shown only when monitoringRows.length > 0; 0-alert state is silent
[3] KpiSummaryRow  — 4 cards: month yield, latest-year yield, selected-year yield, capacity
[4] PortfolioTrendChart — YoY comparison chart with insight summary line
[5] RiskCommandCenter   — attention-only cards (shown when monitoringRows.length > 0)
                         or quiet empty state when everything is normal
[6] SiteTable           — full portfolio table with AntD columns
[7] ImportSection       — collapsible, collapsed by default, sticky to bottom of page
[8] Glossary            — existing <details> element, unchanged
```

### 2.2 PageHeader

Current: h1 "สรุปไซต์ที่ต้องดูตอนนี้" + month select + import panel inline.

Target:
- h1 stays: "สรุปไซต์ที่ต้องดูตอนนี้"
- Page subtitle: "เลือกเดือนเพื่อดูผลผลิตรวม เทียบปีก่อน และไซต์ที่ควรตรวจสอบก่อน" (unchanged)
- Month select stays in the toolbar-meta area (unchanged)
- Add a small "นำเข้ารายงาน ↓" button (AntD Button ghost/secondary) that scrolls to or expands the import section. Remove ImportPanel from the top of the main flow.

Component notes for implementer:
- The month select is a native `<select>` — keep as-is (AntD Select adds too much visual weight here).
- The import trigger button can use AntD `<Button icon={<CloudUploadOutlined />} type="default">`.
- Collapse state is `useState(false)` local to the dashboard component; no global state needed.

### 2.3 AlertBanner

New component. Only render when `monitoringRows.length > 0`.

Content: "{n} ไซต์ต้องตรวจสอบ — {n_attention} ตรวจด่วน, {n_watch} เฝ้าระวัง, {n_review} พิจารณา"

Layout: full-width pill/banner below the page header, above the KPI row. Use a subtle red-left-border card style (matching `--bad` color) for attention counts > 0, amber for watch-only situations.

When 0 sites need attention: do not render this component at all. The absence communicates calm.

CSS class: `alert-banner`, `alert-banner--urgent`, `alert-banner--watch`.

Acceptance criteria:
- [ ] Banner appears only when monitoringRows.length > 0
- [ ] Banner shows correct counts per severity tier
- [ ] Banner is not rendered when all sites are status "ok"

### 2.4 KpiSummaryRow (currently `summary-grid`)

Current: 4 cards — month, latest year, selected year, capacity. Values only, no context.

Target: Same 4 cards, add context sub-line to each:

| Card | Value | Context sub-line |
|---|---|---|
| เดือนนี้ ({monthLabel}) | monthlyYieldKwh kWh | [delta vs same month last year: "ต่ำกว่าปีก่อน 86 kWh (-7.6%)" or "สูงกว่าปีก่อน 126 kWh (+42.9%)"] |
| ปีล่าสุด | latestYearYieldKwh kWh | "{latestYear}: ผลรวมปีนี้" — static label, no delta needed |
| ปีที่เลือก | yearSelection.yieldKwh kWh | "จาก {availableMonthsInYear} เดือน" |
| กำลังติดตั้งรวม | installedCapacityKwp kWp | "{siteCount} ไซต์" |

Delta for "เดือนนี้" card: use `portfolioMonthlySeries` — find the point matching `selectedMonth` and read `previousYearTotalYieldKwh` and `deltaPct`. If not available, show "-" not an error.

Display rule: show "ลดลง X kWh (Y%)" or "เพิ่มขึ้น X kWh (Y%)" — always both absolute and percent. Color the delta text using `--bad` for negative, `--good` for positive.

Implementer note: The `portfolioMonthlySeries` array is already in `DashboardResponse`. A helper `findMonthDelta(series, selectedMonth)` returns `{ deltaAbsKwh, deltaPct }` or null.

Component interface:
```tsx
<SummaryCard
  label="เดือนนี้ (ม.ค. 2568)"
  value="1,051"
  unit="kWh"
  delta={{ abs: -86, pct: -0.076 }}   // new prop, nullable
  note="กำลังติดตั้ง 245 kWp"
/>
```

Acceptance criteria:
- [ ] Monthly card shows YoY absolute delta and percent when data is available
- [ ] Delta text uses correct color (red for negative, purple/green for positive)
- [ ] When delta data is unavailable, card renders without delta line (no "-" clutter)
- [ ] No AntD Statistic re-renders on every month change (memoize the delta lookup)

### 2.5 PortfolioTrendChart — Insight Summary

Current: chart title "ผลผลิตรวมทุกไซต์เทียบเดือนเดียวกันปีก่อน" + SVG chart + data table. No narrative.

Target: add an insight summary line between the section heading and the chart card:

Insight line logic (compute in `analytics.ts` or as a derived value in the component):
1. Count months in the current year where `currentYearYieldKwh < previousYearSameMonthYieldKwh`.
2. Count months where current year is ahead.
3. Compute average `deltaPct` for months where both values are available.
4. Render: e.g. "ปีนี้อยู่เหนือปีก่อน 7 จาก 9 เดือน (เฉลี่ย +12.4%)" or "ปีนี้อยู่ต่ำกว่าปีก่อน 5 จาก 9 เดือน"

Render this as a `<p className="chart-insight-line">` inside the `section-head` div, below the section-note. Use color coding: `--good` for net-positive, `--bad` for net-negative, `--ink-muted` when tied.

CSS: `.chart-insight-line { font-size: 14px; font-weight: 600; margin: 0; }`

Acceptance criteria:
- [ ] Insight line renders when at least 2 months have both current and previous year data
- [ ] Insight line is absent when not enough comparison data exists
- [ ] Month counts and average delta are accurate (unit test in analytics.test.ts)

### 2.6 RiskCommandCenter (currently `section "ไซต์ที่ต้องเฝ้าระวัง"`)

Current: flat list of risk-cards with three ComparisonBlock rows each.

Target: visually tiered command center.

#### 2.6.1 Section heading

Rename section heading: "ศูนย์ควบคุมความเสี่ยง (Risk Command Center)"

Section note: "แสดงเฉพาะไซต์ที่ต้องดำเนินการ จัดเรียงตามความเร่งด่วน" (unchanged in substance)

#### 2.6.2 Risk card redesign

The three ComparisonBlocks (MoM, SiteAvg, YoY) should be visually differentiated by weight:

- Primary comparisons (YoY and SiteAvg): full `comparison-row` display with abs kWh + percent delta + baseline label.
- Secondary comparison (MoM): render as a smaller footnote line only. CSS: `.comparison-row--secondary { font-size: 12px; color: var(--ink-soft); }`.
- Rule: if MoM is positive (recovery signal) but YoY or SiteAvg are negative, show a recovery indicator "↑ ฟื้นจากเดือนก่อน" in the card's top-right area. This is already computed in `buildAssessmentReason()` — surface it visually.

Card status colors (keep existing CSS classes, just ensure consistent use):
- `risk-card--attention`: red left border, subtle red bg tint
- `risk-card--watch`: amber left border
- `risk-card--review`: light blue/purple tint (currently using var(--primary-soft))
- Empty state: single `.empty-state--soft` card, text "เดือนนี้ทุกไซต์อยู่ในเกณฑ์ปกติ ✓"

#### 2.6.3 Risk card layout spec

```
┌─────────────────────────────────────────────────────────────┐
│ [StatusTag]      [yield: 1,234 kWh]        [↑ ฟื้น] (optional) │
│                                                              │
│ Site Name (h3, bold, 17px)                                  │
│ 245 kWp • reason text (13px, muted)                          │
│                                                              │
│ YoY:      ลดลง 86 kWh (-7.6%)  ฐาน 1,137 kWh               │
│ Site avg: ลดลง 45 kWh (-4.1%)  ฐาน 1,095 kWh               │
│ MoM:      เพิ่มขึ้น 23 kWh (+2.1%)  (smaller, muted)         │
└─────────────────────────────────────────────────────────────┘
```

Acceptance criteria:
- [ ] YoY and SiteAvg comparisons show both abs kWh delta and percentage
- [ ] MoM comparison is visually smaller/secondary
- [ ] Recovery indicator appears when MoM > 0 but YoY or SiteAvg < 0
- [ ] Empty state renders correctly when monitoringRows.length === 0
- [ ] Cards link to `/sites/{siteName}?month={selectedMonth}` (unchanged)

### 2.7 SiteTable — AntD Column Enhancement

Current: TanStack table with 7 columns. Percentage columns show only % delta, no abs kWh.

Target changes:

1. Add absolute kWh delta to comparison columns as a sub-value in the same cell:
   - Current: "+12.4%"
   - Target: "+12.4% / +86 kWh" (or two-line cell: "+12.4%" on line 1, "+86 kWh" smaller on line 2)
   - Use data from `row.original.comparison.yoy.deltaAbsKwh`, `.mom.deltaAbsKwh`, `.siteAvg.deltaAbsKwh`

2. Column header labels — translate to clearer Thai:
   - "เทียบเดือนก่อน" → "เดือนก่อน" (shorter, fits better)
   - "เทียบค่าเฉลี่ยไซต์" → "ค่าเฉลี่ยไซต์"
   - "เทียบเดือนเดียวกันปีก่อน" → "YoY (ปีก่อน)"

3. Status column: replace AntD Tag with the existing `StatusTag` component but make it wider so the Thai label fits without wrapping.

4. Sortable columns: keep existing TanStack sort behavior. No change to sort logic.

Implementer note: The cell renderer for comparison columns needs to access `row.original.comparison` not just the column accessor value. Switch these cells to use `({ row }) => ...` instead of `({ getValue }) => ...`.

Acceptance criteria:
- [ ] Each comparison column shows both % and abs kWh
- [ ] Abs kWh delta is visually secondary (smaller font, muted color)
- [ ] No new columns added — this is a cell content change only
- [ ] Existing sort behavior is unaffected
- [ ] TypeScript build passes with no new errors

---

## 3. Site Detail Page Layout (`/sites/[siteId]`)

### 3.1 Hero Card

Current: site name h1 + subtitle paragraph + data range/capacity meta grid (3 cells).

Target: add a risk-level indicator to the hero card right side.

If `view.selectedRow?.riskLevel` is present, render an AntD `<Tag color="...">` or the existing `risk-score-badge` component inline with the meta grid. Purpose: operator sees risk level immediately on page load without scrolling to the risk section.

Acceptance criteria:
- [ ] Risk level is visible in the hero card for the selected month
- [ ] Hero card layout does not break on narrow viewports (flex-wrap is already set)

### 3.2 KPI Section — Visual Hierarchy

Current: 6 KPI cards in a 3-column grid, all visually equal.

Target: two-tier layout.

Tier 1 (primary, full width or 3-col with larger card): inverterYield, specificEnergy, performanceRatio (peak ratio).
Tier 2 (secondary, smaller): selfConsumptionRate, energyBalanceGap, loadBalanceGap.

Implementation: use CSS `grid-template-columns` combined with a `detail-kpi--primary` class that increases `min-height` and value `font-size`.

```css
.detail-kpi--primary .detail-kpi__value {
  font-size: clamp(28px, 3.5vw, 40px);
}
.detail-kpi--secondary .detail-kpi__value {
  font-size: clamp(20px, 2.5vw, 28px);
  color: var(--ink-muted);
}
```

The primary/secondary split is determined by KPI key, not by value magnitude. Primary keys: `inverterYield`, `specificEnergy`, `performanceRatio`. Secondary keys: `selfConsumptionRate`, `energyBalanceGap`, `loadBalanceGap`.

Acceptance criteria:
- [ ] Primary KPIs are visually larger than secondary KPIs
- [ ] Layout remains readable at 1024px and 1280px viewport widths
- [ ] All 6 KPIs are still present (no hiding)

### 3.3 Risk/Reasons Section

Current: two-column layout with "เหตุผล" (reasons) list and "คำแนะนำ" (actions) list. Risk score badge in the section header.

Target changes:
1. Rename the section: "การวินิจฉัยและคำแนะนำ" (more professional than "เหตุผลและคำแนะนำ")
2. Each action item should be visually styled as an action step, not just a plain bullet:
   - Add a subtle left-border or background tint (var(--primary-soft)) to action `<li>` elements.
   - CSS: `.action-item { padding: 8px 12px; border-radius: 10px; background: var(--primary-soft); border-left: 3px solid var(--primary); }`

Acceptance criteria:
- [ ] Actions are visually distinct from reasons
- [ ] Section renders correctly when both lists are empty (no-data fallback unchanged)

### 3.4 Chart Section — Insight Annotations

Current: 3 SVG trend charts (yield, peak ratio, self-consumption). No annotations.

Target: add a one-line insight below each chart title.

Insight rules:
- Yield chart: "ปีที่ดีที่สุด: {year} ({maxYieldKwh} kWh)" and "ปีล่าสุด {pct}% เทียบค่าสูงสุด" — derive from series data.
- Peak ratio chart: if any year has a point below 0.65, show "พบค่าต่ำกว่า 0.65 ใน {n} เดือน"
- Self-consumption chart: if rate is consistently > 0.9, show "ใช้ไฟเองสูงตลอด — ตรวจ export meter"

These are pure UI computations — no new API fields needed.

CSS: `.chart-insight { font-size: 13px; color: var(--ink-muted); margin: 0; }`

Acceptance criteria:
- [ ] Yield insight line appears when at least 2 years of data exist
- [ ] Peak ratio warning appears when any monthly value < 0.65
- [ ] Insight lines are absent when data is insufficient (no placeholder text)

### 3.5 History Table

Current: 12-column raw data table. Column headers are all English technical names.

Target:
1. Add Thai primary labels to every column header (English as secondary in parentheses):
   - "เดือน" (unchanged)
   - "ผลผลิต (Inverter yield)"
   - "กำลัง (Capacity)"
   - "ผลผลิตต่อกำลัง (Specific energy)"
   - "ประสิทธิภาพ (Peak ratio)"
   - "ใช้เอง (Self-consumption)"
   - "ส่งออก (Export)"
   - "นำเข้า (Import)"
   - "ใช้รวม (Consumption)"
   - "ช่องว่างพลังงาน (Energy gap)"
   - "ช่องว่างโหลด (Load gap)"
   - "ความเสี่ยง (Risk)"

2. Highlight the selected month row with a subtle purple background tint. Use a `data-selected="true"` attribute on the `<tr>` and a CSS rule: `tr[data-selected="true"] td { background: var(--primary-soft) !important; }`

Acceptance criteria:
- [ ] Every column has a Thai primary label
- [ ] Selected month row is visually highlighted
- [ ] Table still scrolls horizontally on narrow viewports

---

## 4. Import Panel — Collapsible Section

### Current problem

The `<ImportPanel>` is rendered immediately above the KPI cards on the main dashboard, which pushes the data section down and draws attention to a utility function before the operator sees their numbers.

### Target behavior

- The import form is moved below the main content (after the SiteTable, before the Glossary).
- It is collapsed by default. An `isImportOpen` state controls visibility.
- The PageHeader has a small "นำเข้ารายงาน" button that sets `isImportOpen(true)` and scrolls into view.
- When import succeeds, collapse the panel (`setIsImportOpen(false)`) and show a brief toast/Alert near the top.

### Component contract

```tsx
// In SolarDashboard:
const [isImportOpen, setIsImportOpen] = useState(false);
const importRef = useRef<HTMLDivElement>(null);

function openImport() {
  setIsImportOpen(true);
  setTimeout(() => importRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
}

// In handleImportSubmit, after success:
setImportSuccess("...");
setIsImportOpen(false);
// also show a temporary Alert near the KPI row
```

Acceptance criteria:
- [ ] Import panel is collapsed by default on page load
- [ ] "นำเข้ารายงาน" button in PageHeader opens and scrolls to the import form
- [ ] Successful import collapses the panel
- [ ] Import error keeps the panel open so the user can fix the issue

---

## 5. AntD Usage Guidelines

The project already imports from `antd`. Phase 2 should use the following AntD components for new UI elements and avoid custom replacements:

| Use case | AntD component |
|---|---|
| Import trigger button | `<Button type="default" icon={<CloudUploadOutlined />}>` |
| Alert banner | `<Alert type="error" showIcon banner>` for urgent, `<Alert type="warning" banner>` for watch |
| Insight summary pills | Plain `<Tag>` with color |
| Status tags in table | Keep existing `StatusTag` (wraps AntD `<Tag>`) |
| Loading skeleton | Keep `<Skeleton>` |
| Empty states | Keep `<Empty>` on true empty, custom `.empty-state--soft` for "no alerts" states |

Do NOT introduce AntD `<Table>` for the site table — the existing TanStack table + custom CSS handles the sticky-header, column sizing, and sort behavior that AntD Table would complicate.

Do NOT introduce AntD `<Drawer>` for the import panel — a simple collapse + scroll approach is sufficient and more accessible.

---

## 6. CSS Extension Points

The following CSS classes need to be added to `app/globals.css`. Do not modify existing classes; append new ones:

```css
/* Alert banner */
.alert-banner { ... }
.alert-banner--urgent { border-left: 4px solid var(--bad); background: rgba(196,91,110,0.06); }
.alert-banner--watch  { border-left: 4px solid var(--warn); background: rgba(184,151,74,0.06); }

/* Chart insight line */
.chart-insight-line { font-size: 14px; font-weight: 600; margin: 0; }
.chart-insight-line--good { color: var(--good); }
.chart-insight-line--bad  { color: var(--bad); }

/* KPI tiers */
.detail-kpi--primary  .detail-kpi__value { font-size: clamp(28px, 3.5vw, 40px); }
.detail-kpi--secondary .detail-kpi__value { font-size: clamp(20px, 2.5vw, 28px); color: var(--ink-muted); }

/* Action item bullets in risk section */
.action-item { padding: 8px 12px; border-radius: 10px; background: var(--primary-soft); border-left: 3px solid var(--primary); }

/* Secondary comparison row */
.comparison-row--secondary { font-size: 12px; color: var(--ink-soft); }

/* Recovery indicator */
.recovery-indicator { font-size: 12px; font-weight: 700; color: var(--good); }

/* Selected row in history table */
tr[data-selected="true"] td { background: var(--primary-soft) !important; }

/* Import section wrapper */
.import-section-wrapper { }
.import-section-wrapper--collapsed .import-card { display: none; }
```

---

## 7. Analytics Logic Extensions

The following pure logic changes are needed (no API changes):

### 7.1 Portfolio insight computation

Add to `src/lib/analytics.ts`:

```ts
export type PortfolioInsight = {
  totalMonthsCompared: number;
  monthsAhead: number;
  monthsBehind: number;
  averageDeltaPct: number | null;  // positive = ahead, negative = behind
};

export function buildPortfolioInsight(
  series: PortfolioComparisonChartPoint[],
): PortfolioInsight { ... }
```

Unit test required in `tests/analytics.test.ts`.

### 7.2 Month delta lookup

Add to `src/lib/analytics.ts`:

```ts
export type MonthDelta = {
  deltaAbsKwh: number | null;
  deltaPct: number | null;
  previousYearKwh: number | null;
};

export function findMonthDelta(
  series: PortfolioComparisonChartPoint[],
  reportMonth: string,
): MonthDelta | null { ... }
```

Unit test required.

---

## 8. Acceptance Criteria Summary

Phase 2 is complete when all of the following are true:

### Dashboard (home page)
- [ ] ImportPanel is NOT visible above the KPI cards on initial page load
- [ ] KPI cards include a delta vs. prior year for the monthly card
- [ ] Portfolio trend chart shows an insight line ("ปีนี้อยู่เหนือ/ต่ำกว่าปีก่อน N จาก M เดือน")
- [ ] Alert banner renders when any site has status other than "ok"
- [ ] Alert banner is absent when all sites are "ok"
- [ ] Risk cards show YoY and SiteAvg with both abs kWh and percent delta
- [ ] MoM comparison is visually smaller in risk cards
- [ ] Recovery indicator appears on risk cards when applicable
- [ ] Table comparison columns show abs kWh delta alongside percent

### Site detail page
- [ ] Hero card shows risk level for selected month
- [ ] Primary KPIs (inverterYield, specificEnergy, performanceRatio) are visually larger
- [ ] Actions in risk section have visual action-item styling
- [ ] History table column headers have Thai primary labels
- [ ] Selected month row is highlighted in the history table
- [ ] Yield chart shows insight line when 2+ years of data exist

### Technical
- [ ] `tsc --noEmit` passes with no new errors
- [ ] `pnpm test` passes (include new analytics unit tests)
- [ ] No new AntD Table, Drawer, or Modal introduced
- [ ] No API route changes required (all data is already in existing payloads)

---

## 9. Component Change Map

| Component file | Change type | Details |
|---|---|---|
| `src/components/solar-dashboard.tsx` | Modify | Move import panel, add AlertBanner, add delta to SummaryCard, add insight line to chart, restructure risk cards |
| `src/components/site-detail.tsx` | Modify | Add risk badge to hero, tier KPI grid, style action items, localize table headers, highlight selected row |
| `src/lib/analytics.ts` | Extend | Add buildPortfolioInsight + findMonthDelta |
| `app/globals.css` | Extend | Append new CSS classes (see section 6) |
| `tests/analytics.test.ts` | Extend | Add tests for new analytics functions |
| `src/lib/solar-table.ts` | No change | Existing column definitions and types are sufficient |
| `src/lib/site-detail-view.ts` | No change | Existing SiteDetailView type is sufficient |
| `src/lib/site-detail-presentation.ts` | No change | KPI labels and risk badge mappings are sufficient |
| API routes | No change | All required data is already in DashboardResponse and SiteHistoryResponse |

---

## 10. What This Spec Does NOT Include

- Dark mode support (out of scope for Phase 2)
- Mobile/responsive redesign (out of scope — existing min-width handling is acceptable for Phase 2)
- New data ingestion sources (Excel import behavior is unchanged)
- Pagination or search on the main site table (out of scope)
- Real-time / auto-refresh (out of scope)
- User authentication or role-based views (out of scope)
