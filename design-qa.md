# Inspection Desk fidelity QA — 10 September 2026

**Source:** `artifacts/inspection-desk-fidelity/reference.png` — exact user attachment, 1487×1058.
**Implementation:** `artifacts/inspection-desk-fidelity/detail-final.png`, 1487×1058 CSS pixels, DPR 1. No density scaling in the saved comparison.
**State:** checks, February 2026, source scope, the corresponding สำนักงาน สฟต.3 site. The reference uses illustrative values/names; implementation uses actual API records. Real zero/partial history cannot reproduce the invented reference curve. The roster's source month is August because that is the actual verified roster in the database.
**Full comparison:** `artifacts/inspection-desk-fidelity/comparison.png` contains both images side by side.
**Focused comparison:** `artifacts/inspection-desk-fidelity/comparison-focus.png` contains header/chart/KPIs at native scale; `detail-full.png` exposes all three panels and additional persisted workflow below them.

## Findings and iteration history
1. P1 fixed: `/` still rendered V1. It now shares the V2 page with `/prototype`.
2. P1 fixed: floating rail and two-column facts/repair with AI spanning a separate row did not match the selected composition. Rail now touches the left edge at 310px, main starts x336 at reference size, and facts/maintenance/AI have three adjacent columns.
3. P2 fixed: first rendered chart and duplicate month labels pushed operational panels out of view (`detail-initial.png`). Removed duplicate SVG labels, retained keyboard month controls, shortened plot, moved detailed scope/text into disclosures, and placed KPIs inside chart (`detail-revised.png` → `detail-final.png`).
4. P2 fixed: help inherited the new left margin despite having no rail. Help now centers independently; mobile overflow check passed.
5. P2 fixed: manual form screenshots used obsolete crop offsets. Pages 12–13 now show the actual findings/action and outcome/evidence controls.

## Required fidelity surfaces
- **Fonts/typography:** Sarabun retained; navy 28px site heading, 18–19px panel headings, compact secondary labels; Thai names wrap. Mobile body in operational panels is 14px with 1.65 line height. Browser month input displays Gregorian year, while report labels use Thai Buddhist year; both refer to the same stored month.
- **Spacing/layout:** header 69px, rail 310px, main x336 at 1487 width, thin borders and 7px panel radii. Full-width chart followed by three operational columns. Chart is 426px versus approximately 372px in the reference because real comparison controls, null explanations and accessible data disclosures remain. Coverage is a separate compact strip to retain scope selection. This is an intentional functional accommodation, not a claim of pixel identity. Extra persisted work forms below the reference area are preserved.
- **Colors/tokens:** white background, dark green actions/series, orange Sun logo, navy text, blue-gray boundaries. Prior-year series has both amber color and dashed/hatch pattern; visible legend is shown when comparison is active. Data quality and legacy assessment labels remain separate from work status.
- **Images/icons:** the reference contains standard outline icons rather than photo assets. Existing Lucide Sun/FileText/ClipboardCheck/Brain/Info icons are used, without invented avatar or illustrative artwork. Chart SVG is actual data visualization, not an image substitute.
- **Copy/content:** facts, possible causes and next checks are separate. No fabricated site metadata, repairs, authentication, AI output, sync success or daily average. Existing saved AI output remains labelled unconfirmed. Actual partial history explains differences in curve, capacity and KPI values.

## Interaction/accessibility checks
Four pages at 1440px and 390px; no document overflow. Mobile site picker, real long Thai site name, month/scope preservation, graph bar toggle, graph text table, keyboard copy and help tested. Copy observed zero POST requests. Empty search, server-error retry UI, missing values and real AI-empty/saved states checked. Browser console had only the intentional simulated HTTP 500 error during error-state QA; no application runtime error seen. Native controls retain labels and visible focus. This is a targeted browser review, not a full automated accessibility audit or a new backend-write test.

## Follow-up polish
P3: native month-picker typography differs between browsers. Further pixel-level compacting of the provenance area can be considered after user review; do not remove provenance to force identical dimensions.

## Implementation checklist
- [x] Shared V2 default route and four-page shell.
- [x] Reference-based chart-first detail and three operational columns.
- [x] Real backend behavior preserved; mock form images isolated.
- [x] Desktop/mobile evidence, typecheck, 153 tests, production build.
- [x] Revised 16-page A4 PDF and web help.

final result: passed
