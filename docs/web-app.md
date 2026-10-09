# Web application (`apps/web`)

A React + TypeScript single-page app, built with Vite, that is also an installable PWA. Everything runs in the browser: parsing in a Web Worker ([browser-import.md](browser-import.md)), storage in IndexedDB ([storage.md](storage.md)), charts on canvas.

![Dashboard](img/dashboard.png)
![Night view](img/night.png)

*(Screenshots use synthetic demo data.)*

## Running it
```bash
npm install
npm run dev          # Vite dev server with HMR (http://localhost:5173)
npm run build        # type-check + production build into apps/web/dist
npm run preview      # serve the production build (http://localhost:4173), needed by the E2E tests
```
Requirements: Node 20+. For import from the card the browser must be able to read a folder (any browser via the folder input; Chromium also offers the File System Access picker) or a ZIP file.

## Screens

| Route | Screen | What it shows |
|---|---|---|
| `#/` | **Dashboard** | Last night (use, AHI, 95 % leak, pressure), 30-night compliance, average use/AHI, trend charts (hours of use, AHI with a reference line at 5, 95 % leak) with a 7/30/90/All selector, and a table of nights |
| `#/night/YYYY-MM-DD` | **Night** | Summary cards (use, AHI, leak, pressure, RERA index, snore index), event timeline, flow waveform (when the card kept it), total-leak, pressure and snore charts with linked zoom, event counts and an optional full event table, previous/next night links |
| `#/import` | **Import** | Folder picker (Chromium), folder input (any browser), ZIP input, drag & drop of a folder or ZIP, progress with cancel, detected device, clear errors, demo data loader |
| `#/settings` | **Settings** | Language (English, Català, Español), theme (system/light/dark), stored data summary and browser storage usage, per-device and global delete, privacy and about |

Routing is hash-based (`router.ts`): it needs no server configuration and works from any static host and from the installed PWA.

## Behaviour worth knowing
- **Nights, not sessions.** The device may split one night into several sessions (mask taken off); the UI groups them into a *night* (noon-to-noon, see [analytics.md](analytics.md)).
- **Linked zoom.** Dragging on any night chart zooms all charts and the timeline; double-click or *Reset zoom* restores the full night. The crosshair is synchronised across charts.
- **Mask-off periods** are shaded on the charts and on the timeline.
- **Missing detail.** Nights for which the card kept no flow data still show summary statistics and a notice instead of the flow chart.
- **Metric explainers.** Every key figure has a `?` button with a plain-language explanation (`explain.*` strings), including a reminder that targets are for the clinician to decide.
- **Demo mode.** *Load demo data* generates 75 synthetic nights (`generateDemoSessions`) under a fictitious "Demo" device; a banner tells the user, and the data can be removed independently of real data.
- **Idempotent imports.** Importing the same card again replaces sessions with the same device and id; nothing is duplicated.

## Source layout (`apps/web/src`)
| Path | Responsibility |
|---|---|
| `main.tsx`, `App.tsx` | Bootstrapping (i18n, theme, service worker) and the page shell with navigation |
| `router.ts` | Hash router (`parseRoute`, `href`, `useRoute`) |
| `state.tsx` | `DataProvider`/`useData`: night summaries and devices loaded from the repository, `reload()` after changes |
| `db/` | Dexie schema (`db.ts`) and the `Repository` data-access layer (`repository.ts`) |
| `features/import/` | `ImportPanel`, `importService` (worker import → database, demo data, folder drop traversal) |
| `features/dashboard/` | `Dashboard` |
| `features/night/` | `NightView`, `Timeline` (SVG), `nightData` (model → chart arrays) |
| `features/settings/` | `Settings` |
| `components/` | `Chart` (uPlot wrapper), `axes` (locale-aware axis labels), `Stat`, `InfoTip` |
| `i18n/` | i18next setup and the three locale files |
| `format.ts`, `theme.ts`, `styles.css` | Formatting, theme handling, design tokens |

## Charts
`components/Chart.tsx` wraps [uPlot](https://github.com/leeoniya/uPlot) (canvas, handles hundreds of thousands of points). It
- rebuilds when the theme changes (canvas cannot follow CSS variables), reading colours from the design tokens,
- resizes with its container (`ResizeObserver`),
- shares an x range between charts (`range`/`onRangeChange`) and a crosshair sync key,
- exposes an `aria-label` and the page offers equivalent tables (nights table, event counts, event table).

Timestamps are device wall-clock encoded as UTC, so all time axes use `tzDate` = UTC and locale formatting via `Intl` with `timeZone: 'UTC'` (24 h clock for Catalan/Spanish, 12 h for English).

## Internationalisation
`i18next` + `react-i18next`, languages `en`, `ca`, `es`. The language is the saved choice, else the browser language, else English; it also sets `<html lang>`. Plural forms use i18next suffixes (`_one`/`_other`). Unit tests guarantee all locales have identical keys and interpolation placeholders. To add a language: add `locales/<code>.json` (copy `en.json`), register it in `i18n/index.ts` (`LANGUAGES`, `resources`), and the parity test will list anything missing.

## Theming
Design tokens are CSS variables in `styles.css`. Light is the default; dark follows `prefers-color-scheme` unless the user chooses a theme explicitly (`data-theme` on `<html>`, stored in `localStorage`). Charts re-read the tokens when the theme changes.

## Accessibility
Semantic landmarks and headings, a skip link, visible focus rings, text/background pairs checked for WCAG AA, `aria-live` import status, native `<details>` for explainers, charts with accessible names and table alternatives, reduced-motion support. Automated checks (axe, WCAG 2.1 A/AA) run on all main screens in light and dark themes in CI-style E2E tests. Manual screen-reader testing has **not** been done yet.

## PWA
`vite-plugin-pwa` (Workbox `generateSW`, auto-update) precaches the build (about 540 KiB) so the app opens offline; the manifest provides name, icons (192/512 px PNG and SVG) and `display: standalone`. User data is never cached by the service worker, it lives in IndexedDB.

## Known limitations
- Hash routing means night links look like `#/night/2026-03-05`.
- The File System Access picker path (Chromium) and drag & drop are only exercised through unit fakes; E2E covers the folder input, ZIP, errors and persistence in real Chrome. Firefox/Safari are untested.
- Flow values are shown as reported (OSCAR calls them L/min); physical scaling is unverified ([formats/ds2.md](formats/ds2.md)).
- No PDF report, journal, notes or period comparison yet (Phase 3).
