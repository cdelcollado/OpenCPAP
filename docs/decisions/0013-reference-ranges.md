# ADR-0013: Orientative reference ranges per device family

- Status: accepted (sources still to be cited)
- Date: 2026-10-10

## Context
Users see AHI, leak, usage and oximetry figures without knowing whether they are good, borderline or poor. The maintainer asked for reference ranges next to the metrics, in the web app and in the printable report, with the ranges depending on the device (a Philips DreamStation and a ResMed AirSense report different leak quantities). The research for this showed that:
- Published AHI bands are consistent across consumer sources (< 5, 5–15, 15–30, ≥ 30) but they are diagnostic bands, not targets.
- The 24 L/min leak line is a ResMed figure (95th percentile of unintentional leak). Philips reports total leak, including the intentional vent flow, and no verified Philips range was found.
- ODI4 bands exist for adults from polysomnography; no verified range was found for T90, T88 or pressure, and none exists for the flat-topped, periodic-breathing or RERA measures this app derives.
- The primary sources were not cited in this round; the values are therefore marked *unverified* everywhere they appear.

The maintainer also set two rules: information is only ever added (nothing that is shown today is removed or replaced), and state is never shown by colour alone.

## Decisions
1. **One registry in `@opencpap/core`** (`reference.ts`): constants (`REFERENCE`) and pure functions that return a three-state value (`good`, `warn`, `bad`) or `undefined` when there is no reference. The web app and the report call the same functions, so the numbers always agree. Rejected: putting thresholds in the React components, which would repeat them and drift.
2. **Device family from the stored manufacturer** (`NightSummary.manufacturer`, copied from the first session). `deviceFamily` maps `Philips Respironics` to `philips`, `ResMed` to `resmed`, and everything else to `other`. Leak has a status only for `resmed` and `philips` (see 4a). Rejected: inferring the family from `leakKind`, which is a leak-specific side effect and would hide the device in every other metric.
3. **Three states with an icon, a colour and a text label**, drawn from the existing status tokens. Icons come from `lucide-react` (ISC, compatible with GPL-3.0-or-later), chosen over the Unicode glyphs in use for the report. Rejected: changing the existing `Badge` icons, which would replace something that is already shown.
4. **Where no verified reference exists, show a note and no status** (`No verified reference for this metric`). A status without a source would look like a clinical judgement the app cannot back up.
4a. **Leak is judged on the 70th percentile of the night.** The ResMed guide sets its 24 L/min seal rule on the 70th percentile, so the app follows the primary source rather than secondary summaries that used the 95th. The 95th percentile stays on screen. Philips uses a working band on the same statistic, set by the maintainer's clinical experience and explicitly marked as not yet sourced: 30 to 50 L/min within range, 50 to 60 attention, above 60 out of range. Rejected: no status for Philips at all, because the maintainer's experience gives a usable band that the app can label honestly.
5. **Additive presentation.** The dashboard's existing AHI and usage badges stay. Their reference is added as a text line, not a second badge, so the same state is not shown twice. Leak and ODI4 gain a three-state badge because they had none.
6. **The reference is never presented as a target.** Each place that shows a reference says so, and the report footnote says the sources are being confirmed.

## Consequences
- The values are visible to users before they have been cited. The UI and the docs say this, and the roadmap keeps "cite every value" open. Removing the *unverified* wording is the step that closes it.
- Adding a device family means one line in `deviceFamily` and, if it has a range, one rule in `reference.ts`; the e2e and unit tests show where to add cases.
- The Philips band, its edges and the T90 / T88 status are open decisions, documented in [reference-ranges.md](../reference-ranges.md).
- The night view and the Compare page do not show reference badges yet; this is a deliberate scope limit.
