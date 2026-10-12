# Design and usability review

- Status: proposal (not implemented)
- Date: 2026-10-12
- Scope: the web app under `apps/web`, as of `main` at `6928571`
- Related: [design-system.md](design-system.md), [ADR-0008](decisions/0008-ui-hierarchy-and-charts.md), [features.md](features.md)

## Purpose

This document records a review of the current interface and proposes an integral visual and usability update. The goal is an app that feels more modern and more attractive, while keeping the rules the project has already adopted for data display, accessibility and privacy.

Nothing here is implemented. Each proposal lists its cost, its risk and whether it needs an ADR. Items marked *unverified* were not checked in a running browser; they come from reading the code and the screenshots in `docs/img/`, which use synthetic demo data and may not match the latest build.

## Method

- Read the web app sources: `apps/web/src/App.tsx`, `components/Header.tsx`, `features/dashboard/*`, `features/night/NightView.tsx`, `features/import/ImportPanel.tsx`, and `styles.css`.
- Read the design rules in [design-system.md](design-system.md) and the decision in [ADR-0008](decisions/0008-ui-hierarchy-and-charts.md).
- Reviewed the committed screenshots (`docs/img/dashboard.png`, `night.png`, `night-mobile.png`).

Not yet done: a running-browser walkthrough, a contrast audit of the new proposed tokens, a timed task study with real users, and a check at 390 px on the latest build. These are listed in [Next steps](#next-steps).

## What works

- **One hero per view.** The AHI is the first large figure on the dashboard and on a night, as [design-system.md](design-system.md) requires.
- **Status is never colour alone.** Chips and deltas carry an icon and text (for example `✓ Under 5 per hour`, `↑ +1.0 vs 30-night avg`).
- **Every chart has a table twin**, and the night tracks share one x scale that is tested for alignment.
- **Plain language.** Labels and summaries avoid jargon. The night summary uses fixed rules and says it is not a diagnosis.
- **Medical disclaimer** appears in the night summary and in the footer.
- **Dark mode** follows the operating system and can be overridden by the user.
- **Accessibility groundwork.** Skip link, one `<h1>`, native controls, focus ring, touch-target sizes on phones, and axe checks in the end-to-end suite.
- **Empty state** on the dashboard explains what to do and that data stays in the browser.

## What does not work well

Each finding cites where it was seen. Severity is a judgement: **high** blocks or confuses a common task, **medium** slows or clutters it, **low** is polish.

| # | Finding | Where | Severity |
|---|---|---|---|
| F1 | The flow waveform at one-second resolution renders as a solid blue mass, so the breath shape cannot be read at normal zoom. | `night.png`, `NightView.tsx` (`flow` track) | High |
| F2 | The "Last night" hero card has a large empty gap between the AHI chip and the sparkline. The sparkline is pushed to the bottom by `margin-top: auto` in a stretched grid row. | `dashboard.png`, `features/dashboard/Hero.tsx` | Medium |
| F3 | On phones, six navigation links use two rows before any content. | `night-mobile.png`, `Header.tsx` | Medium |
| F4 | The import page offers several entry points at once (folder, ZIP, drop zone, oximetry, demo) with equal visual weight. The first step is not obvious. | `ImportPanel.tsx` | Medium |
| F5 | The row of eight coloured values in the night header is the cursor readout, not a legend. It appears only while the cursor is over the charts, so it is not a permanent crowding problem. Hiding tracks would be a new feature rather than a fix. *Corrected after implementation review.* | `night.png`, `NightView.tsx` (`data-testid="readout"`) | Low (corrected from Medium) |
| F6 | Many `?` explainer buttons appear across cards and add visual noise. | `InfoTip.tsx`, all cards | Low–medium |
| F7 | Charts cannot be navigated with a keyboard. Tables are the only keyboard path. | ADR-0008, "Consequences" | Medium |
| F8 | Surfaces use similar weight: cards, borders and shadows look the same at every level, so the hierarchy depends mainly on size. | `styles.css` tokens | Low |
| F9 | The typeface is the system stack. It is safe and private, but it gives the app little identity. | `styles.css` line 45 | Low |
| F10 | Hover readouts are the main way to read values on charts. On touch devices the tap behaviour is less clear. | `Chart.tsx`, `chartTooltip.ts` | Medium (unverified on touch) |

## Proposal

### Direction

"Clinical but warm": calm surfaces, precise numbers and a little more character. The data remains the loudest element; the chrome becomes quieter and more deliberate. The direction does not add gradients, decorative illustrations or a new accent colour.

### Typography (addresses F9)

- Bundle one variable sans-serif font as a file served from the same origin. It makes no third-party request, so it respects the privacy rules, but it changes the decision recorded as "system UI everywhere". That needs a new ADR that supersedes the typography section of [design-system.md](design-system.md).
- Keep proportional figures for the hero and use tabular figures only in tables, readouts and axis ticks, as now.
- Define a short type scale (for example 0.8, 0.9, 1, 1.25, 1.85, 3.6 rem) and use it everywhere.

### Surfaces and spacing (addresses F8)

- One elevation level. Cards differ by background, padding and a hairline border, not by shadow.
- One radius for cards and a smaller radius for controls.
- Keep the existing tokens (`--bg`, `--surface`, `--surface-2`, `--surface-3`) and add only what the new hierarchy needs.

### Hero and tiles (addresses F2)

- Anchor the sparkline to the bottom of the "Last night" card, and add the 30-night range (minimum to maximum) under the delta.
- Keep the same card height on the dashboard so tiles align.

### Navigation (addresses F3)

- Desktop: a compact top bar. Primary items are Dashboard, Equipment, Report and Import; Compare and Settings move under a "More" menu.
- Phones: a fixed bottom bar with the same four primary items and "More".
- Both layouts keep the same routes and the same labels in all three languages.

### Night view (addresses F1, F5)

- Flow: draw a min/max envelope per pixel column, or a thinner line with a density option. The raw waveform stays available as a zoom level.
- Legend: replace the header row with toggle chips. A chip shows or hides its track, which also reduces the number of tracks on small screens.
- A sticky readout bar appears when the user scrolls past the header.

### Import (addresses F4)

- One large drop zone as the primary action, with "Choose folder" as the main button beside it.
- A compact three-step indicator above the drop zone.
- Oximetry import and the demo data move into collapsed sections.

### Explanations (addresses F6)

- One "How this is calculated" disclosure per card, instead of a `?` next to each label.
- The explanation text itself is unchanged; only its placement moves.

### Charts and keyboard (addresses F7)

- Night tracks: a keyboard cursor moved with the arrow keys, with the same readout as the pointer. This is the follow-up named in ADR-0008.
- Trend bar charts: arrow keys move between bars and Enter opens the night, matching the mouse click.

### Motion

- One entrance sequence on first load of the dashboard, under 300 ms, no per-card animation.
- Transitions only for actions that change state (opening a panel, switching a segment).
- Respect `prefers-reduced-motion` as now.

This relaxes the rule in [design-system.md](design-system.md) that forbids decorative animation. That change needs an explicit decision.

## Constraints

- **Additive changes.** The project's standing rule is to add information and never remove existing content or colours. Moving navigation, collapsing sections and moving explanations each change placement but not content. Each of these needs a confirmation before implementation.
- **Privacy.** No external fonts, scripts or analytics. Any new asset is served from the app's origin.
- **Data colour.** The eight series hues and their validation stay as documented. Any new surface or text token must pass the contrast checks in both themes.
- **Medical disclaimer** remains visible in the same places.
- **Translations.** New strings go into `en`, `ca` and `es` in the same change, with parity checked by `i18n.test.ts`.

## Decisions that need an ADR

1. Replacing the system font with a bundled font (supersedes the typography section of [design-system.md](design-system.md)).
2. Relaxing the rule against decorative motion.
3. Changing the primary navigation layout, which moves links between the bar and a "More" menu.
4. Changing how the night flow track is drawn (envelope instead of raw samples).

## Phased plan

Each phase is independent and can be reviewed alone.

### Phase A: low risk, no structural change

- Anchor the sparkline and add the 30-night range to the hero (F2). *Partly done: the 30-night AHI range line is added; the sparkline keeps its bottom anchor.*
- ~~Turn the night legend into toggle chips (F5).~~ Dropped: the row is the cursor readout, not a legend (see F5).
- Add the flow envelope as an option, with the raw line kept (F1).
- Add the keyboard cursor to the night tracks (F7, first part).

### Phase B: navigation and import

- Compact desktop header and phone bottom bar with a "More" menu (F3).
- Import page with one primary drop zone and collapsed secondary sections (F4).

### Phase C: visual system

- Bundled typeface, after its ADR is accepted (F9).
- Surface and radius pass (F8).
- Consolidated "How this is calculated" disclosures (F6).

### Phase D: validation

- Running-browser walkthrough at 390 px and 1200 px in both themes.
- Contrast check of every changed token.
- Timed tasks with two or three users: import a card, find last night's AHI, export a CSV.

## Success criteria

- Importing a card from the import page takes one step to start, with no need to read the other options.
- The flow track of a night shows breath shape without zooming.
- On a 390 px screen, the first content is visible without scrolling past navigation.
- Every existing axe check still passes in both themes.
- No existing text, colour or data element is removed.

## Next steps

1. Confirm the additive-change constraint for Phase B (navigation and import placement).
2. Decide on the bundled typeface and the motion rule, then write the ADRs.
3. Run the browser walkthrough (Phase D first step) on the current build to confirm F1–F10.
4. Implement Phase A.

## Open questions

- Is a bundled font acceptable for the privacy statement in [privacy-and-security.md](privacy-and-security.md)? *Unverified: the statement was not read for this review.*
- Do the touch tap behaviours of the charts work as expected? *Unverified (F10).*
- Is the current demo dataset representative of a typical user's data volume, which affects F1? *Unverified.*
