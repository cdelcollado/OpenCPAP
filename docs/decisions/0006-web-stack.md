# ADR-0006: Web stack — React, Vite, Dexie, uPlot, i18next, vite-plugin-pwa

- Status: accepted
- Date: 2026-10-09

## Context
The app must be static-hostable, work offline, plot signals with hundreds of thousands of points, keep data locally, and be maintainable by contributors who know mainstream tooling.

## Decision
- **React 19 + TypeScript + Vite 6**: ubiquitous, strong typing for the shared model, fast builds, first-class Web Worker support.
- **uPlot** for charts: canvas, ~50 KB, designed for large time series (a night of flow is ~160 k points); linked zoom and crosshair sync built in. ECharts/Chart.js were considered and rejected for performance and size on this data shape.
- **Dexie (IndexedDB)** for storage: typed arrays natively, transactions, a small ergonomic API. SQLite-WASM/OPFS stays an option if analytical queries outgrow IndexedDB.
- **i18next/react-i18next**: standard, supports plurals and interpolation, easy to extend with languages.
- **vite-plugin-pwa (Workbox)**: installable and offline with a few lines of config.
- **Hash routing** implemented in ~30 lines instead of a router library: no server rewrites needed, tiny surface.
- **Playwright with the system Chrome** + axe for E2E and accessibility.
- No CSS framework: design tokens in plain CSS with dark mode; no external fonts or CDNs (privacy, offline).

## Consequences
- Two Vite versions coexist (Vitest 2 bundles Vite 5; the app uses Vite 6). Harmless, but upgrade Vitest to unify them.
- uPlot is canvas-based: charts re-read CSS variables on theme change and need explicit `aria-label`s and table alternatives.
- Dexie schema changes require explicit migrations ([storage.md](../storage.md)).
