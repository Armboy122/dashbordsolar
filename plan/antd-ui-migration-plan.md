# AnalysisSolar Ant Design Migration Plan

**Goal:** Move the AnalysisSolar dashboard/detail UI from hand-rolled CSS-only components toward Ant Design components so the app looks more polished and consistent, while preserving current API/data behavior.

## Current styling stack

- Tailwind CSS: **not installed / not used**. `package.json` has no `tailwindcss`, no `postcss`, and no Tailwind config was found.
- Ant Design: **not installed yet**. Current latest checked: `antd@6.3.7`, `@ant-design/icons@6.2.2`.
- Current UI uses:
  - `app/globals.css`
  - plain JSX elements with custom `className`
  - `@tanstack/react-table` for table state/sorting
  - custom SVG charts
  - `lucide-react` icons

## Recommendation

Use Ant Design incrementally, not as a full rewrite in one pass.

Why:
- AntD `Card`, `Statistic`, `Table`, `Tag`, `Alert`, `Button`, `Select`, `Upload`, `Badge`, `Typography`, `ConfigProvider`, `Skeleton`, `Empty`, and `App` will immediately improve visual consistency.
- Existing custom data logic is already working; replacing all logic at once would be risky.
- Keep custom SVG charts initially; AntD does not provide charting. We can style chart containers with AntD `Card` and maybe later add Ant Design Charts if desired.

## Non-goals

- Do not change API routes, DB schema, import parser, risk scoring, or analytics calculations.
- Do not introduce Tailwind.
- Do not migrate charts to a charting package in this phase.
- Do not rewrite all CSS; keep minimal bridge CSS for layout/charts/tables where needed.

## Target UI architecture

1. Add Ant Design dependencies:
   ```bash
   npm install antd @ant-design/icons
   ```

2. Add AntD reset CSS and theme provider:
   - `app/layout.tsx`: import `antd/dist/reset.css` before/near `globals.css`
   - Create `src/components/antd-provider.tsx` as a client provider using `ConfigProvider` and `App`
   - Wrap `children` in layout with the provider
   - Theme tokens should match current solar/lavender brand:
     - `colorPrimary: #7c5cd3`
     - `borderRadius: 14`
     - font family: Sarabun stack

3. Replace low-risk primitives first:
   - buttons → `Button`
   - selects → `Select`
   - pills/status → `Tag`
   - empty/loading/error → `Empty`, `Skeleton`, `Alert`, `Result`
   - KPI cards → `Card` + `Statistic`
   - risk cards → `Card` + `Tag` + `Typography`

4. Table migration strategy:
   - Keep TanStack table if migration is large.
   - Alternatively migrate dashboard/site history tables to AntD `Table` only if sorting behavior remains equivalent and tests/smoke pass.
   - This phase should prioritize visual polish and safety over replacing every table implementation.

5. Import panel strategy:
   - Replace file input with `Upload.Dragger` if feasible.
   - Keep existing XLSX parse/submit behavior.
   - Use AntD `DatePicker` only if it does not add localization complexity; otherwise use `Input`/`Select` for report month.

## Task split for Sonnet workers

### Worker A — AntD migration audit/design spec (read-only)

Output a concise design/spec review:
- Which current components map cleanly to AntD components.
- Which parts should remain custom for now.
- Risks specific to Next 16 + React 19 + AntD 6.
- Recommended order of implementation.

### Worker B — visual QA baseline (read-only)

Output UX notes from current screenshots/code:
- Dashboard top, KPI, import, table, chart, detail page.
- AntD components that would make each section better.
- Any rough edges not solved by component library alone.

### Worker C — implementation (write)

Implement a safe first AntD pass:
- Install dependencies.
- Add provider/theme/reset.
- Convert obvious primitives/KPI/cards/loading/error/status to AntD.
- Keep custom charts and data logic unchanged.
- Keep or minimally adapt CSS bridge.
- Add/update tests for presentation helpers only if logic changes.
- Run full verification and capture screenshots.

### Worker D — post-implementation review (read-only, after Worker C)

Review final diff and screenshots for:
- regressions
- bad AntD usage
- accessibility
- UX issues
- remaining cleanup.

## Acceptance criteria

- `npm test` passes.
- `npm run typecheck` passes.
- `npm run build` passes.
- `npm run dev` loads dashboard and site detail on `http://127.0.0.1:3000`.
- Browser requests `/api/dashboard/latest` and `/api/sites/history?...` are seen.
- Screenshots show AntD-styled UI without skeleton/loading stuck.
- No Tailwind added.

## Handoff prompt for implementation worker

Work in `/Users/sakdithat/Desktop/myproject/analysissolar`. Implement `plan/antd-ui-migration-plan.md` Worker C only. Use Ant Design incrementally and safely. Do not change API/data/risk logic. Install `antd` and `@ant-design/icons`. Add AntD provider/theme/reset. Convert low-risk UI primitives/cards/status/loading/error/import controls where feasible. Keep custom charts and current data behavior. Use TDD for any extracted logic. Run `npm test`, `npm run typecheck`, `npm run build`, then browser-smoke dashboard and one site detail page on `http://127.0.0.1:3000`. Return changed files, verification output, and screenshot paths.
