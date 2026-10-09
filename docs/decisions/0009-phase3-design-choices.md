# ADR-0009: Phase 3 design choices

- Status: accepted
- Date: 2026-10-09

## Context
Phase 3 adds user-generated data (notes, equipment), comparisons, a clinician report, summaries in plain language and backups. Each has a tempting but worse alternative.

## Decisions
1. **The report is print-to-PDF, not a PDF library.** The browser prints a purpose-built HTML page (A4 stylesheet, light palette, static SVG figures). Result: real text PDFs, no dependency, works offline, the same numbers as the app. Rejected: jsPDF/pdf-lib (drawing every table and chart by hand, fonts, accessibility) and server-side rendering (violates local-first). The E2E test renders a PDF in Chrome and reads it with `pdftotext`.
2. **The plain-language summary is a fixed rule set, not an LLM.** Same input, same sentences, nothing leaves the device, every rule is unit-tested and translatable. Wording is neutral, never advises on settings, and links no change to a cause. A local-LLM option stays a later, opt-in phase.
3. **Dates are relative to the latest data ("as of"), not to today.** Equipment age, reminders and the default periods use the date of the newest night, so results are reproducible, tests are deterministic, and a user who imports once a month does not see everything "overdue" by the calendar.
4. **Backups are streamed NDJSON + gzip with validation on read.** Sessions without flow by default (re-importable from the card); journal/equipment merge by `updatedAt` so restoring an old file never overwrites newer notes. Rejected: one big JSON (string size limits), IndexedDB dump formats (browser-specific), encryption now (needs a passphrase UX; documented as a warning instead).
5. **Notes are private by default in every output.** They are in backups (the point of a backup) but only in the printed report when the user ticks the box, which is off by default.
6. **Setting changes are detected only where both nights report the setting** and are always presented with their before/after values and a caution that a difference between periods is not proof of cause.
7. **Equipment intervals are editable defaults with a visible "follow your manufacturer" note**, not claims of clinical guidance.
8. **Schema v2 is additive**, so no data migration is needed; a test opens a v1 database with the v2 code.

## Consequences
- The report depends on the browser's print engine (page breaks can vary slightly between browsers); the layout is tested in Chrome only.
- Reminders look at the last imported night: a user who stops importing sees stale ages (the page states the "as of" date).
- Findings thresholds are constants that need a clinical review before any claim stronger than "reading aids".
