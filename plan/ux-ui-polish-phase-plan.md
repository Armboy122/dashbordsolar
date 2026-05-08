# AnalysisSolar UX/UI Polish Phase Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Polish the loaded AnalysisSolar dashboard and site-detail experience so the UI is more scannable, operational, and visually confident without changing API/data contracts.

**Architecture:** Keep the existing Next.js App Router and client components. Prefer small view-model/helper extractions for testable presentation logic, then CSS/component refinements. Do not redesign the product from scratch; improve hierarchy, table readability, chart interpretation, risk/status emphasis, and bilingual metric labels.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest node tests, CSS in `app/globals.css`, browser/Playwright screenshot smoke checks.

---

## Current state / evidence

Recent verification showed content now loads correctly on `http://127.0.0.1:3000` after the dev-origin hydration fix.

Dashboard visible content:
- header: `สรุปไซต์ที่ต้องดูตอนนี้`
- month selector
- import panel
- 4 KPI cards
- portfolio comparison chart + monthly comparison table
- attention cards
- site detail table

Site detail visible content:
- site header and metadata
- year/month controls
- selected-month KPI grid
- risk reason/recommendation card
- trend charts
- monthly history table

UX issues to polish:
1. Dashboard hierarchy is dense; sections need clearer explanation and spacing.
2. Tables are information-heavy and need better scan affordances.
3. Charts need stronger legend/axis support and clearer semantic color separation.
4. Risk/status needs stronger visual encoding, especially site detail `Risk score`.
5. Detail KPI labels mix English and Thai without a consistent pattern.
6. Loading UX was improved for dashboard only; detail loading can be clearer too.

## Non-goals

- Do not change API routes or DB schema.
- Do not alter business/risk scoring logic.
- Do not add new dependencies unless absolutely required.
- Do not do a full brand redesign.
- Do not remove existing import functionality.

## Acceptance criteria

1. Dashboard remains fully functional and loaded content is visible.
2. Dashboard top hierarchy includes a short operational subtitle and clearer section notes.
3. Main tables have improved readability:
   - sticky header retained/added where applicable
   - numeric columns remain right-aligned and nowrap
   - row hover/striping/separators make scanning easier
   - first identifying column is easier to track if feasible
4. Portfolio chart legend and axis styling are easier to interpret.
5. Site detail risk score appears as a semantic badge/panel with severity color.
6. Site detail KPI labels follow Thai-primary + English-secondary pattern or otherwise reduce confusing mixed-language copy.
7. Tests prove presentation helper behavior where production code changes logic/copy.
8. Verification passes:
   - `npm test`
   - `npm run typecheck`
   - `npm run build`
9. Browser screenshots are captured for dashboard and one site detail page after changes.

---

## Task 1: Add testable presentation labels/helpers for site detail KPI labels

**Objective:** Normalize site-detail KPI display labels without embedding hard-to-test mapping directly in JSX.

**Files:**
- Create or modify: `src/lib/site-detail-labels.ts` or `src/lib/site-detail-view.ts`
- Test: `tests/site-detail-labels.test.ts` or extend `tests/site-detail-view.test.ts`
- Modify: `src/components/site-detail.tsx`

**Desired label pattern:** Thai title as primary, English metric as secondary muted text. Suggested mapping:
- `Inverter yield` → Thai: `ผลผลิตอินเวอร์เตอร์`, English: `Inverter yield`
- `Specific energy` → Thai: `ผลผลิตต่อกำลังติดตั้ง`, English: `Specific energy`
- `Peak ratio` → Thai: `อัตรากำลังสูงสุด`, English: `Peak ratio`
- `Self-consumption rate` → Thai: `สัดส่วนใช้ไฟเอง`, English: `Self-consumption rate`
- `Energy balance gap` → Thai: `ช่องว่างสมดุลพลังงาน`, English: `Energy balance gap`
- `Load balance gap` → Thai: `ช่องว่างสมดุลโหลด`, English: `Load balance gap`

**RED test:**
- Assert the helper returns Thai/English labels for known KPI keys or titles.
- Assert unknown labels fall back safely.

**Run RED:**
```bash
npx vitest run tests/site-detail-labels.test.ts --environment node
```
Expected: FAIL before implementation.

**GREEN implementation:**
- Add helper such as:
  ```ts
  export function getKpiDisplayLabel(kpi: { key?: string; title: string }) {
    return { title: "ผลผลิตอินเวอร์เตอร์", subtitle: "Inverter yield" };
  }
  ```
- Update JSX to render primary Thai label and muted English subtitle.

**Verification:**
```bash
npx vitest run tests/site-detail-labels.test.ts --environment node
```

---

## Task 2: Add semantic risk badge presentation helper

**Objective:** Make risk score/level visually clearer and test class/copy mapping.

**Files:**
- Create/modify: `src/lib/risk-presentation.ts` or reuse an existing lib file
- Test: `tests/risk-presentation.test.ts`
- Modify: `src/components/site-detail.tsx`
- Modify: `app/globals.css`

**Desired behavior:**
- `high` → Thai label `ความเสี่ยงสูง`, class `risk-badge--high`
- `medium`/`watch`/similar → Thai label `เฝ้าระวัง`, class `risk-badge--medium`
- `low`/`normal` → Thai label `ปกติ`, class `risk-badge--low`
- missing → Thai label `ยังไม่มีระดับ`, class `risk-badge--unknown`

**RED test:**
```bash
npx vitest run tests/risk-presentation.test.ts --environment node
```
Expected: FAIL before implementation.

**GREEN implementation:**
- Render the selected-row risk score as a compact badge/panel, e.g.:
  ```tsx
  <div className={`risk-score-badge ${risk.className}`}>
    <span>Risk score</span>
    <strong>{formatNumber(view.selectedRow.riskScore)}</strong>
    <em>{risk.label}</em>
  </div>
  ```
- Use semantic color CSS variables/classes.

---

## Task 3: Dashboard hierarchy and section notes polish

**Objective:** Make the dashboard top and sections easier to scan in under 10 seconds.

**Files:**
- Modify: `src/components/solar-dashboard.tsx`
- Modify: `app/globals.css`
- Optional test: extend existing dashboard/helper tests only if logic is extracted.

**Required UI changes:**
- Add a short subtitle under `สรุปไซต์ที่ต้องดูตอนนี้`, e.g. `เลือกเดือนเพื่อดูผลผลิตรวม เทียบปีก่อน และไซต์ที่ควรตรวจสอบก่อน`.
- Add short section notes to:
  - portfolio chart: explain current vs previous year in fewer words if current copy is verbose.
  - attention section: `แสดงเฉพาะไซต์ที่มีสัญญาณผิดปกติหรือข้อมูลไม่ครบ`.
  - table section: `เรียง/คลิกหัวตารางเพื่อจัดลำดับไซต์ และคลิกชื่อไซต์เพื่อดูประวัติ`.
- Keep copy production-like; no demo/test wording.

**Verification:** visual screenshot should show clearer title/subtitle/notes without clutter.

---

## Task 4: Table readability CSS polish

**Objective:** Improve dashboard and detail table scanability without changing data.

**Files:**
- Modify: `app/globals.css`

**Required CSS improvements:**
- Ensure `.table-wrap--elevated` has clear horizontal overflow behavior.
- Strengthen sticky header background and shadow/separator.
- Add clear but subtle row hover and zebra/section separators.
- Keep numeric cells right-aligned, nowrap, tabular numerals.
- Make first site/month column easier to track using wrapping and optional sticky first column if it does not break horizontal scroll.
- Improve color semantics for `.success`, `.danger`, `.muted` so red/green/purple meanings are readable.

**Caution:** Do not shrink text to solve density. Use layout/spacing/overflow.

---

## Task 5: Chart and card visual polish

**Objective:** Improve interpretability of portfolio and detail charts/cards.

**Files:**
- Modify: `app/globals.css`
- Optional small JSX class additions in `src/components/solar-dashboard.tsx` and `src/components/site-detail.tsx`

**Required improvements:**
- Current-year line/legend should be primary purple.
- Previous-year/baseline should be muted gray/indigo dashed, less visually dominant.
- Axis/grid text should be slightly darker for legibility.
- Chart cards should have consistent padding and section header spacing.
- Detail KPI cards should use grid spacing better and avoid large unused whitespace.

---

## Task 6: Detail loading UX parity

**Objective:** Ensure site detail loading state communicates clearly, like dashboard loading.

**Files:**
- Modify: `src/components/site-detail.tsx`
- Modify: `app/globals.css` if needed

**Required behavior:**
- `DetailLoading` should have `role="status"` and `aria-live="polite"`.
- It should show Thai text: `กำลังโหลดข้อมูลไซต์...` and the site name.
- Keep skeleton if present, but make state explicit.

**Test:** only add if helper/extracted copy is used; otherwise verify visually and typecheck.

---

## Task 7: Full verification and screenshots

**Commands:**
```bash
npm test
npm run typecheck
npm run build
```

**Browser smoke:**
- Start/reuse `npm run dev`.
- Open `http://127.0.0.1:3000`.
- Confirm browser requests `/api/dashboard/latest` and real dashboard text is present.
- Capture full-page dashboard screenshot.
- Open a known site detail page, e.g. `/sites/HYA%20%E0%B8%AA%E0%B8%9F%E0%B8%9F.%E0%B8%AB%E0%B8%B2%E0%B8%94%E0%B9%83%E0%B8%AB%E0%B8%8D%E0%B9%88%201`.
- Confirm browser requests `/api/sites/history?...` and real detail text is present.
- Capture full-page detail screenshot.

**Final response must include:**
- changed files
- tests/verification output summary
- screenshot paths
- short UX assessment of remaining issues, if any

---

## Handoff prompt for gpt-5.4-mini worker

Use this exact assignment:

> Work in `/Users/sakdithat/Desktop/myproject/analysissolar`. Follow `data-dashboard-ux` and `test-driven-development`. Implement `plan/ux-ui-polish-phase-plan.md`. Keep API/data logic unchanged. Use strict TDD for any extracted presentation helpers: first write failing tests, run them, then implement. Prioritize dashboard hierarchy, table readability, chart/legend clarity, site-detail risk badge, Thai-primary KPI labels, and detail loading UX. Run `npm test`, `npm run typecheck`, `npm run build`, then browser-smoke dashboard and one site detail page on `http://127.0.0.1:3000`. Return changed files, RED/GREEN evidence, verification output summary, and screenshot paths.
