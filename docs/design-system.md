# Design system

How the web app looks and why. The rules come from a data-visualisation method (form first, colour last, validated palettes, thin marks, hover everywhere, a table twin for every chart) plus WCAG 2.1 AA. Everything lives in `apps/web/src/styles.css` (tokens and components) and `apps/web/src/components/`.

## Principles
1. **One hero per view.** The first thing on the dashboard and on a night is the AHI as a large figure; everything else is a tile with context (change versus the 30-night average, a sparkline). No wall of equal cards.
2. **Colour follows the measure, not the rank.** Each measure has one hue everywhere it appears; the chrome (buttons, links, navigation) uses the teal accent and never competes with data.
3. **State is never colour alone.** Status chips and deltas always carry an icon and text (`✓ Under 5 per hour`, `▲ Under 4 h`, `↓ −0.5 vs 30-night avg`).
4. **Charts are for reading values.** Every chart has a crosshair and a value readout; bars and cells are clickable; every chart has a table twin.
5. **Quiet furniture.** Hairline solid grids and axes one step off the surface, thin marks, generous space. The data is the only thing allowed to be loud.
6. **Text never wears a data colour.** Values and labels use text tokens; identity comes from a small coloured mark beside the text.

## Colour tokens
Defined as CSS variables on `:root`, redefined for dark mode twice (OS preference and the explicit `data-theme` toggle) so the user's choice always wins.

### Data series (categorical, validated)
Eight fixed hues in a fixed order; the dark column is the same hues re-stepped for the dark surface, not an automatic flip.

| Token | Hue | Light | Dark | Used for |
|---|---|---|---|---|
| `--s-blue` | blue | `#2a78d6` | `#3987e5` | usage, flow, obstructive apnea |
| `--s-orange` | orange | `#eb6834` | `#d95926` | AHI, hypopnea |
| `--s-aqua` | aqua | `#1baf7a` | `#199e70` | periodic breathing |
| `--s-yellow` | yellow | `#eda100` | `#c98500` | vibratory snore |
| `--s-magenta` | magenta | `#e87ba4` | `#d55181` | flow limitation |
| `--s-green` | green | `#008300` | `#008300` | pressure, RERA |
| `--s-violet` | violet | `#4a3aa7` | `#9085e9` | leak, central apnea |
| `--s-red` | red | `#e34948` | `#e66767` | snore, large leak |

Measure aliases: `--m-usage` (blue), `--m-ahi` (orange), `--m-leak` (violet), `--m-pressure` (green), `--m-flow` (blue), `--m-snore` (red), and for Phase 4 `--m-flat` (magenta), `--m-rate` (aqua), `--m-spo2` (blue) and `--m-pulse` (orange). Eight hues cannot give every measure a unique one: the night tracks reuse blue and orange for oxygen and pulse. They are always separate, labelled tracks with their values in the readout, so colour is never the only cue; the light-mode contrast relief for aqua and magenta (below 3:1 on white) is covered the same way. Event types are mapped in `features/night/Timeline.tsx` (`EVENT_COLOR`); minor/noisy types (snore, variable breathing) use the muted grey.

**Validation.** The palette was run through the six-check validator (lightness band, chroma floor, colour-vision separation of adjacent pairs, normal-vision floor, contrast) against this app's own surfaces (`#ffffff`, `#141e24`): all checks pass in both modes. Light-mode aqua, yellow and magenta fall below 3:1 on white (the validator's "relief required" warning); the app only uses them for thin marks in rows that are labelled and have a table twin (event timeline rows carry their name and count; the event table lists every event). When you change a colour, re-run the validator for both modes.

### Surfaces, text and status
| Role | Light | Dark |
|---|---|---|
| page `--bg` / card `--surface` | `#f4f6f7` / `#ffffff` | `#0d1418` / `#141e24` |
| primary / secondary / tertiary text | `#0f1b24` / `#4a5964` / `#5f6d78` | `#e8eff3` / `#b3c0c9` / `#9aa9b4` |
| accent (chrome) | `#0f766e` | `#2dd4bf` |
| status good / warn / bad (text) | `#006300` / `#8a5300` / `#b42323` | `#4ade80` / `#fbbf24` / `#fca5a5` |
| chart grid / axis / text | `#e6eaed` / `#c3cbd1` / `#50606b` | `#22313a` / `#3a4c57` / `#a9b7c1` |

Status colours are reserved for state and always sit next to an icon and a label.

## Typography and figures
System UI sans everywhere (no web fonts: privacy and offline). The hero figure is 3.6 rem (3 rem on phones), tile values 1.85 rem, in **proportional** figures. `tabular-nums` is used only where numbers align in columns (tables, readouts, axis ticks).

## Components
| Component | File | Notes |
|---|---|---|
| Hero + tiles | `features/dashboard/Hero.tsx` | AHI hero with status chip, delta and sparkline; use/leak tiles with sparkline; pressure and event tiles |
| `Badge` | `components/Badge.tsx` | Status chip: icon + text; levels good / warn / bad / neutral |
| `Delta` | `components/Delta.tsx` | Signed change against a named baseline; arrow shows direction; colour only when a direction is clearly better (use, AHI) |
| `Sparkline` | `components/Sparkline.tsx` | 2 px line, 12 % area wash, end dot with a surface ring |
| `Meter` | `components/Meter.tsx` | Progress track with a target marker (compliance, 70 % line) |
| `Chart` | `components/Chart.tsx` | uPlot wrapper: theme-aware, resize-aware, shared zoom, crosshair sync, cursor callback, click callback |
| `tooltipPlugin` | `components/chartTooltip.ts` | One tooltip for every series: value first, label second, line keys, DOM built with `textContent` |
| `CalendarHeatmap` | `features/dashboard/CalendarHeatmap.tsx` | One cell per night, 6 discrete steps of one hue; cells are links |
| `Timeline` | `features/night/Timeline.tsx` | SVG event rows aligned with the charts, shaded mask-off periods, cursor line |
| `InfoTip` | `components/InfoTip.tsx` | Native `<details>` explainer |
| `Header` | `components/Header.tsx` | Navigation, language selector, theme button (system → light → dark) |

### Chart specification (as built)
- Bars ≤ 24 px thick with a small corner radius; lines 2 px; markers 8 px with a 2 px surface ring; area washes ≈ 13 %; gridlines and axes hairline and solid (the only dashed line is the labelled 5 events/h reference).
- One series per chart, so no legend box: the card title names the measure.
- Time axes are device wall-clock (UTC accessors), 24 h for ca/es and 12 h for en, with seconds only when zoomed in far.
- The night tracks share one x scale (`domain` = the night's extent), a fixed y-axis width (`--axis`) and a fixed right padding (`--pad-r`), and the HTML timeline uses the same insets: the plot areas line up to the pixel (an E2E test measures it). Time labels appear only on the last track.

### Heatmap
Six discrete steps are better than a continuous ramp (classes blur past ~7). On a light surface the ramp ends in a darkened version of the hue because the validated hues are mid tones where neither black nor white text reaches 4.5:1; each step is nudged along the ramp until its day number is readable (`heatRamp` in `color.ts`, unit-tested for 3 hues × light/dark). Empty nights are dashed outlines, so "no data" differs from "low value".

### Phase 3 components
| Component | File | Notes |
|---|---|---|
| Mood selector | `features/night/JournalCard.tsx` | five radio buttons in a `fieldset` (`.seg`), emoji **plus** a word, clearing by clicking the selected one |
| Tag chips | same | chips with a labelled remove button; Enter or comma adds, Backspace removes the last; suggestions through a native `<datalist>` |
| Findings list | `features/night/Findings.tsx` | one sentence per observation with a ✓ / ⚠ / ● icon |
| Settings diff | `features/compare/ComparePage.tsx` | table rows that differ get a warning chip and a tinted background (not colour alone) |
| Paired bars | same | A in the muted grey, B in the event's colour, the value printed beside the bar (never over the colour) |
| Equipment card | `features/equipment/EquipmentPage.tsx` | meter with a target marker at 100 % of the interval, status chip, action buttons |
| Report SVG charts | `features/report/SvgCharts.tsx` | static SVG for print: thin bars, 2 px line, hairline grid, dashed reference lines and setting-change flags, titles on every mark |
| Histogram | `components/Histogram.tsx` | inline SVG bars, a title on every bar, an accessible name listing the counts |
| Breathing card, Oximeter card | `features/night/BreathingCard.tsx`, `features/oximetry/OximetryCard.tsx` | tiles in a four-column grid with explainers and the experimental/own-device notes |
| Oximetry preview | `features/oximetry/OximetryImport.tsx` | a table of nights with an OK / warning / red chip (icon + text) for how well the recording covers the CPAP night |
| Change markers | `components/annotations.ts` | dashed vertical line with a small flag on the uPlot trend charts |

The report (`.report`) defines its own light tokens so that it looks the same on screen and in print whatever theme the app is in.

## Layout and responsiveness
Max content width 1180 px. The hero is a two-column grid that stacks below 860 px. On phones (≤ 600 px) tiles are single column and each night track puts its label above the plot (the gutter becomes 0 and the axis shrinks to 40 px) so the plots keep their width; the `?` explainers open centred in the viewport so they cannot run off the edge. Selects, inputs and long words are constrained (`max-width: 100%`, `overflow-wrap: anywhere`) so no control can widen the page. E2E tests assert there is no horizontal overflow at 390 px on the dashboard, a night, compare, equipment, report and settings. On phones the segmented controls (trends range, calendar measure, report range) wrap into whole options in a 2×2 grid, so no option breaks a word; the nights table keeps each date and usage value on one line and the date sticks to the left edge while the other columns scroll; the header links, buttons, selects and the segmented options are at least 44 px high, the `?` explainers and checkboxes at least 24 px (WCAG 2.2 AA). Percent values use a non-breaking space before the `%` sign so `70 %` never splits across lines. E2E tests cover the wrapping, the touch-target sizes, the single-line table cells and the sticky date column at 390 px.

## Motion
No decorative animation; `prefers-reduced-motion` disables transitions. While a night loads, the previous content stays at reduced opacity (no skeleton flash).

## Accessibility checklist (applies to every new screen)
- Landmarks, one `<h1>`, ordered headings, skip link, visible focus ring (3 px).
- Contrast: text ≥ 4.5:1, large text and marks ≥ 3:1 (or a visible label / table twin).
- Status and trend always have icon + text.
- Every chart: `aria-label`, hover/tap readout, and a table view (nights table, event table).
- Controls are native elements (`select`, `input[type=date]`, radio groups in a `fieldset` with a `legend`, `<details>`).
- Run `npm run e2e`: the axe checks cover dashboard, night, import and settings in both themes.

## Adding a measure or chart — checklist
1. Pick the form (is it even a chart? a tile with a sparkline is often better).
2. Give the measure one token (`--m-…`) from the series palette; never reuse a status colour for a series.
3. Build the options with `axisStyle`, thin marks, a tooltip (`tooltipPlugin`) or a readout entry.
4. Add the table twin and the i18n strings (all three languages).
5. Check both themes visually and run the validator if a colour changed.
6. Update this document and the E2E tests.

## Pitfalls found while building
- **`.sr-only` is absolutely positioned.** Inside a scrolling wrapper (tables) it can escape the clip and widen the page; wrappers that scroll must be `position: relative`.
- **Never build `href` from a function.** Route builders that take parameters (`compare`, `report`) must be called; React silently drops a function-valued `href`.
- **Mouse tests must scroll targets to the centre**; sticky headers hide elements scrolled to the viewport edge.
- **A palette is not a contrast guarantee for text on tinted cells**: heatmap steps are tuned for the number inside them (`heatRamp`).
- **Chart data must keep its identity between renders.** Passing a new `data` array to `Chart` on every render resets its scale and reports a "new" range, which with several linked charts can loop forever (it froze the night view once oximetry tracks were added). Memoise per track, and `Chart` no longer echoes a range the parent already holds.
- **`opt?.(++counter)` skips the increment when there is no callback.** Increment before the optional call.
