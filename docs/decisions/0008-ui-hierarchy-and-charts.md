# ADR-0008: UI hierarchy, validated series colours and aligned night tracks

- Status: accepted
- Date: 2026-10-09

## Context
The first web UI worked but read as a flat grid of equal cards: no clear first number, charts you could not read values from, colour as the only carrier of state (green/amber AHI), a status red reused for an event type, tabular digits on large figures, a timeline that did not line up with the charts, and a calendar-less way to see consistency over months.

## Decision
1. **One hero figure** (AHI) per summary, with a status chip (icon + text) and a delta versus the average of the 30 previous nights; other measures are tiles with a sparkline. AHI bands (5 / 15) are reading aids, labelled as such.
2. **One validated hue per measure** from the categorical series palette, identical in every view; chrome uses the teal accent; status colours only for state. Palette validated for both themes against the app's surfaces.
3. **Every chart is interactive**: tooltip with value first (dashboard), click-through to the night, and on the night a single shared readout plus synchronised crosshair instead of one tooltip per track.
4. **Night detail as aligned tracks.** The HTML event timeline and the uPlot charts share the same x domain (the night extent), a fixed y-axis width and a fixed right padding, so they line up at every zoom level; time labels only on the last track; a test measures the alignment.
5. **Calendar heatmap with six discrete steps**, tuned so the day number is always readable; empty nights are visibly different from low values.
6. **Time-weighted statistics** everywhere a statistic spans intervals (see [analytics.md](../analytics.md)); **configured pressure** instead of the ramp-polluted logged values ([ADR-0007](0007-night-definition-and-pressure.md)).

## Consequences
- More UI code to maintain (`Hero`, `CalendarHeatmap`, track layout) but every piece has unit or E2E coverage.
- Keyboard users cannot scrub the charts; the tables are the keyboard path. A keyboard cursor for the night tracks is a follow-up.
- The alignment relies on three CSS variables (`--gutter`, `--axis`, `--pad-r`) and matching uPlot padding; changing one requires changing the other (documented in `design-system.md`, enforced by the E2E test).
- Light-mode aqua/yellow/magenta stay below 3:1 on white; they are only used on labelled rows with a table twin.
