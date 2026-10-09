# Testing strategy

| Layer | Tool | Where | What it proves |
|---|---|---|---|
| Unit | Vitest | `packages/*/src/*.test.ts`, `apps/web/src/**/*.test.ts`, `scripts/*.test.ts` | Parsers, CRC/crypto, model helpers, analytics, formatting, router, i18n parity, repository (fake IndexedDB) |
| Synthetic integration | Vitest | `packages/loaders/philips-ds2/src/loader.test.ts`, `packages/browser/src/{fs,worker}.test.ts` | Whole loader on a tiny generated card; every card source; worker message protocol with an in-process fake |
| Real-card integration | Vitest | `real-card.test.ts` in `philips-ds2` and `browser` | Needs `fixtures/raw/P-SERIES` (not in git). All files decrypt, all 24 154 chunks pass CRC, parsed event counts equal the device's own counts (333 sessions), all card sources give identical sessions |
| End to end | Playwright + system Chrome | `e2e/*.e2e.ts` (55 tests + 1 skipped screenshot generator) | The built PWA in a real browser: empty state, demo data, hero and status chips, tooltips and click-through, calendar, night view with aligned tracks (pixel-measured), shared readout, linked zoom, therapy settings, navigation and date jump, language/theme persistence, deletion, PWA manifest + service worker, 390 px phone without horizontal overflow, import from ZIP and from the real card folder through the Web Worker and IndexedDB, error messages, console silence; **Phase 3**: notes saved and restored, plain-language summary, setting-change panel and markers, comparison presets/swap/empty period/settings diff, equipment add/replace/delete/reminders/leak trend, **PDF rendered by Chrome and read with `pdftotext`** (text present, patient name, notes only when opted in, no navigation, no serial number), backup download → wipe → restore round trip, invalid backup refused, persistent-storage request, every header link, axe on compare/equipment/report/settings/night in both themes, 390 px layout of the new pages; **Phase 4**: breathing card and tracks, oximetry import with preview/overlap, removal, exports (CSV content and EDF header), alerts, rolling average and histograms, a zoom-drag regression test (render loop), axe on the new sections |
| Accessibility | axe-core via Playwright | `e2e/app.e2e.ts` | No WCAG 2.1 A/AA violations on dashboard, night, import, settings, in light and dark themes |
| Comparison with OSCAR | `scripts/compare-oscar.ts` | [oscar-comparison.md](oscar-comparison.md) | Hours, AHI, RDI, event counts and leak versus OSCAR's CSV export (needs a manual export; last run: 550/550 sessions match) |

## Commands
```bash
npx tsc -b                      # type-check everything (project references)
npx vitest run                  # all unit + integration tests (248; real-card tests skip without fixtures)
npx playwright test             # builds the web app, starts `vite preview`, runs the E2E suite in Chrome
DOC_SHOTS=1 npx playwright test e2e/docshots.e2e.ts   # regenerate docs/img from demo data
```
E2E uses the system Chrome (`channel: 'chrome'`). To use Playwright's own browser set `PW_CHANNEL=` (empty) after `npx playwright install chromium`.

## Requirements
Node 20+, Google Chrome (system install), and `poppler-utils` (`pdftotext`, `pdfinfo`) for the PDF test (`sudo apt install poppler-utils`).

## Rules
- Committed tests use **synthetic data only** (`syntheticCardFiles`, `generateDemoSessions`, builders in `philips-ds2/src/testing`). Real-card tests must skip cleanly when the fixture is absent and must not print serial numbers or write health data anywhere.
- Every parser change comes with a synthetic test; every format discovery with a real-card assertion when possible.
- E2E tests fail on `pageerror` and `console.error`, so a healthy app stays silent.
- Mouse-driven E2E steps must bring the target to the middle of the viewport first (`scrollToCenter`): Playwright only dispatches inside the viewport, and `scrollIntoViewIfNeeded` can leave the element under a sticky header.

## Lessons recorded by the tests
- Building links from route builders that take parameters (`href.compare`) produced `<a>` elements without `href`; the header-link test now checks every link's `href` and `aria-current`.
- An absolutely positioned `.sr-only` element inside a scrolling table wrapper widened the whole page; `.table-wrap` is now `position: relative`. The 390 px tests exist to catch this class of bug.
- Print output must be checked in the PDF, not on screen: the test runs the app in dark mode and asserts the report text, hidden navigation and opt-in notes.

## Gaps
- Firefox and Safari are not exercised; the File System Access picker and drag & drop of a folder have no automated end-to-end test (browsers do not allow scripting them).
- No manual screen-reader pass yet; no visual-regression tests.
- No performance budget test (the real-card import takes ~15 s in Chrome for 1 207 files).
