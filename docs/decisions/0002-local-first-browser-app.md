# ADR-0002: Local-first, browser-only architecture

- Status: accepted
- Date: 2026-10-09

## Context
CPAP data is health data. Comparable tools (CPAP Clarity, AirwayLab) already process data locally; SleepHQ uploads to a server.

## Decision
Parse and analyze entirely in the browser (Web Workers, File System Access API with fallbacks). No server is required. Server features (sharing, sync) are optional later phases.

## Consequences
- Strong privacy by default; trivial static hosting.
- Must handle performance and storage limits in the browser.
- File System Access API is Chromium-only; `<input webkitdirectory>` and ZIP fallbacks are mandatory.
