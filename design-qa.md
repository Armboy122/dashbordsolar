# Inspection Desk design QA — 9 September 2026

**Final result: passed**

Source visual truth: `/Users/sakdithat/.codex/generated_images/01a085b4-a3ed-7fe3-95c9-7015684840e8/exec-38ce0a94-d3c9-4250-a60d-372a60672da7.png` (selected displayed option 2).
Implementation: `artifacts/inspection-desk/comparison-desktop.png`.
Both source and comparison are 1487 × 1058 pixels; browser CSS viewport 1487 × 1058, deviceScaleFactor 1. No density normalization. Additional required QA at 1440 × 1050 and 390 × 1050, full-page captures in `artifacts/inspection-desk/`.

State: February 2026, source roster, selected long Thai site สำนักงาน สฟต.3. Source is a concept with example data; implementation is actual API data with no repair records for the site. Full images were opened together for comparison. Inspected header/control/long-name and chart regions at readable viewport size; full-page captures used for mobile flow and lower sections.

## Findings and fixes

- P1 resolved: initial inherited sidebar flex direction stacked navigation vertically. Changed to horizontal top navigation matching the reference.
- P2 resolved: full AI evidence expanded by default produced an excessively tall single column. Kept summary visible and put detailed hypotheses/evidence behind an explicit disclosure, with saved result history available separately.
- P2 resolved: initial detail headings pushed the chart below the fold. Moved desktop month/scope/coverage beside selected-site heading, keeping source month visible.
- P2 resolved: limiting SVG height shrank the plot into the middle of the available width. The chart now measures its width with ResizeObserver and computes positions for the actual viewport; Thai labels and values keep readable sizing on mobile.
- P2 resolved: report copy still said imports were unavailable. Updated it to distinguish real imports/repair storage from unavailable edit/sync/export functions.
- Verification: captured the final desktop comparison and all four pages at both required widths after fixes. No horizontal page overflow in any of the eight page captures. Mobile detail and blank repair form also captured.

## Fidelity surfaces

- Typography: existing Sarabun used for Thai, clear 25–30px selected-site/page headings, 14–16px body, smaller provenance. Long names wrap instead of clipping. No attempt to reproduce malformed or invented text in generated source.
- Layout: horizontal top navigation, approximately 250px site rail, full-width chart above three operational columns. Mobile stacks these sections and uses site cards. Actual evidence and explicit provenance make the page taller than the concept; this is accepted to satisfy the user's data requirements.
- Colors/tokens: white and neutral surfaces, dark green action/graph, subtle borders, amber/red/text labels for legacy signals. Prior-year graph uses amber dashed line. Status is not communicated by color alone.
- Images/assets: source has no photos or custom illustrations requiring raster assets. Existing Sun/Building/Info and other library icons retained. Charts are live data visualizations, not decorative mockup assets. No invented user avatar/authentication or company/location metadata.
- Content: source example figures, positive trend claims, capacity and location were deliberately not copied. Real selected-site yield is zero and several historical months are absent, so chart gaps and explicit uncertainty are required. Portfolio coverage is labelled in sites, distinct from selected-site graph. Legacy scoring labels stay identified as legacy and not mapped to new priority.

## Functional and data QA

- Navigation all four pages, selected-month/scope persistence entering and returning from a site.
- Keyboard focus/Enter on LINE copy; no POST on copy or return navigation. No automatic notification status.
- Real saved AI result and repair empty state loaded. No generation on ordinary navigation.
- Failed repair save mocked in browser: failure message displayed, typed textarea remains; mock removed and page reloaded afterward. No QA repair inserted into DB. One expected HTTP 500 console entry from this fault injection; normal page captures showed no runtime errors.
- Provider live request and persisted queue result checked separately on existing real report. Import→queue tested with mocked DB to avoid overwriting actual monthly data.
- Typecheck, 126 tests and production build pass; logs in `artifacts/auto-analysis/`.

## Follow-up polish and limits

P3: consolidate the inherited prototype stylesheet and fine-tune dense desktop evidence spacing after user review. The source includes download/avatar controls without implemented backing; these were omitted rather than shown as functioning. No new priority rules, formula changes, or fake maintenance data. Full production auth, immutable import revisions and durable multi-host worker deployment are separate backend work.

Implementation checklist completed: horizontal navigation; source/month preserved; chart responsive; evidence disclosures; actual maintenance persistence; saved AI history; desktop/mobile capture; failure checks; test/build logs.

final result: passed
