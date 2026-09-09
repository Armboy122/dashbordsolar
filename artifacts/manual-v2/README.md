# V2 illustrated user guide

PDF: ../../public/manual/AnalysisSolar-V2-User-Guide.pdf
Online: http://localhost:3100/help (linked by วิธีใช้งาน in V2 header)

16 A4 landscape pages in Thai. Screenshots are actual local V2 UI. FusionSolar download is an explicitly labelled menu diagram based on the repository connector documentation and verified download workflow. Inspection progress/result examples are labelled fixtures shown only through browser interception; they were never saved as technician records. AI screenshot is an existing saved result, not generated for the manual.

Covers: manual download path, what is and is not automatic, selecting file and confirming month, overview/scope/coverage, line/bar charts, site search, facts vs hypotheses, opening work, LINE copy, notified status, inspection outcome/evidence, direct repair history, AI history, reopening work and troubleshooting.

Source: src/lib/user-manual.ts shared by /help and scripts/build-user-manual.ts.
Rebuild HTML/diagrams: npx tsx scripts/build-user-manual.ts. Print /manual/v2/print.html with Chromium page.pdf(printBackground=true,preferCSSPageSize=true) after document.fonts.ready, to public/manual/AnalysisSolar-V2-User-Guide.pdf.

Checks run:
- typecheck: passed
- production build: passed (/help generated)
- git diff --check: passed
- PDF A4 check: all 16 pages are landscape A4; expected count matches, no warnings
- Rendered PDF pages inspected visually, corrected screenshot overlays and a stale AI-history caption
- Browser geometry check: instructions and figures clear of footer across all pages
- /help tested at 1440px and 390px: no document overflow
- PDF served HTTP 200, application/pdf
- No new unit tests for this documentation-only flow; existing scoring/backend not changed
- No import, Gemini generation, LINE send or inspection write performed while collecting screenshots. Local Excel selected only to show preview.

Images and screenshots in public/manual/v2 are included for local user documentation; no account credentials or API keys are in them.
