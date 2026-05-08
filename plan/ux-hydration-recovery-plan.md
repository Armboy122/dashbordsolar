# AnalysisSolar UX/Hydration Recovery Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix the app so `npm run dev` renders real dashboard/detail content instead of a permanent skeleton/loading shell, then improve loading UX enough to make failures obvious.

**Architecture:** Treat this as a root-cause debugging task first. The API already returns data, so isolate why the client component does not fetch/render after hydration. Add tests around the specific regression before modifying production code. Keep visual polish minimal until real content renders.

**Tech Stack:** Next.js App Router 16, React 19, TypeScript, Vitest node tests, browser/Playwright CLI smoke verification.

---

## Current evidence

- `npm run dev` serves `http://127.0.0.1:3000` successfully.
- `/api/db/health` returns 200.
- `/api/dashboard/latest` returns 200 with `selectedMonth: 2026-04` and `plants.length = 72`.
- `/api/sites/history?site=HYA%20...` returns 200 with history rows.
- Browser page shows only `Solar Ops`, `แดชบอร์ด`, and loading skeleton.
- Browser performance entries show no `/api/...` requests from the page, suggesting `useEffect` is not running or client component hydration is blocked.
- Site detail page remains at `กำลังโหลด HYA สฟฟ.หาดใหญ่ 1`.

## Acceptance criteria

1. Dashboard page renders real operational content after initial load:
   - month selector or selected month
   - portfolio KPI area
   - portfolio chart or monthly comparison area
   - site table/cards with at least one site row/link
2. Site detail page renders real content for a known site from API data.
3. If data fetch fails or times out, user sees a clear error/retry state rather than indefinite skeleton.
4. Tests pass:
   - `npm test`
   - `npm run typecheck`
   - `npm run build`
5. Browser smoke screenshots prove loaded content, not just skeleton.

---

## Task 1: Root-cause hydration/fetch not running

**Objective:** Identify why client components do not issue `/api/...` fetches in the browser.

**Files to inspect:**
- `app/page.tsx`
- `app/sites/[siteId]/page.tsx`
- `app/layout.tsx`
- `src/components/solar-dashboard.tsx`
- `src/components/site-detail.tsx`
- `src/components/navbar.tsx`
- `next.config.*` if present

**Steps:**
1. Reproduce with `npm run dev` and browser/Playwright screenshot.
2. Check console/page errors after waiting 5 seconds.
3. Confirm whether client bundles load and execute.
4. Search for client-side runtime errors hidden by tooling.
5. State one root-cause hypothesis before changing code.

**Verification command:**
```bash
npm run build
```
Expected: build succeeds or reveals the runtime/hydration issue.

---

## Task 2: Add regression test for dashboard loaded-state behavior

**Objective:** Before fixing, add a test that proves the dashboard view can leave loading state and render loaded data when the fetch returns a valid dashboard payload.

**Preferred test location:**
- Create/modify `tests/dashboard-view.test.ts` or equivalent.

**Constraints:**
- Keep test lightweight; Vitest node environment only.
- If React DOM browser rendering tools are unavailable, extract a pure view-model/helper from `src/components/solar-dashboard.tsx` and test that helper.
- Test should fail first because current app remains stuck in loading or lacks the extracted behavior.

**Run RED:**
```bash
npx vitest run tests/dashboard-view.test.ts --environment node
```
Expected: FAIL for the intended missing/stuck behavior, not a syntax/setup error.

---

## Task 3: Implement minimal root-cause fix

**Objective:** Fix the real cause found in Task 1 without broad redesign.

**Likely files:**
- `src/components/solar-dashboard.tsx`
- `src/components/site-detail.tsx`
- possibly `app/page.tsx` / `app/sites/[siteId]/page.tsx`

**Rules:**
- Do not mask the issue by hardcoding data.
- Do not redesign the whole dashboard in this task.
- If the cause is hydration/runtime execution, fix that cause and keep API contracts unchanged.
- Add/adjust only tests necessary for the regression.

**Run GREEN:**
```bash
npx vitest run tests/dashboard-view.test.ts --environment node
npm test
npm run typecheck
npm run build
```
Expected: all pass.

---

## Task 4: Add clear timeout/error UX for loading states

**Objective:** Ensure users do not see indefinite skeletons if API/client fails again.

**Files:**
- `src/components/solar-dashboard.tsx`
- `src/components/site-detail.tsx`
- optional tests under `tests/`

**Behavior:**
- Dashboard loading state includes human-readable Thai text.
- Site detail loading state includes human-readable Thai text.
- If fetch fails, error screen includes retry action.
- Existing `AbortController` behavior remains safe.

**Verification:**
```bash
npm test
npm run typecheck
```

---

## Task 5: Browser smoke verification and UX screenshot report

**Objective:** Capture proof that content is loaded and identify next visual polish tasks.

**Commands:**
```bash
npm run dev
# open http://127.0.0.1:3000
# capture dashboard full-page screenshot
# open one /sites/[siteId] page
# capture site detail full-page screenshot
```

**Report should include:**
- dashboard screenshot path
- site detail screenshot path
- list of remaining UX/UI issues after content loads
- whether the app is now usable

---

## Handoff prompt for gpt-5.4-mini worker

Use this exact assignment:

> Work in `/Users/sakdithat/Desktop/myproject/analysissolar`. Follow `systematic-debugging` and `test-driven-development`. The app APIs return data, but browser pages stay in loading/skeleton state and do not issue `/api/...` requests. Implement the plan in `plan/ux-hydration-recovery-plan.md`. Find root cause first, write a failing regression test, implement the minimal fix, then run `npm test`, `npm run typecheck`, `npm run build`, and capture screenshots proving dashboard/detail content loaded. Do not do broad visual redesign yet; only fix loading/hydration and clear loading/error UX.
