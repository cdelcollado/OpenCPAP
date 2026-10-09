# Analytics definitions

Single reference for every number the UI shows. Code: `packages/core/src/stats.ts` and `nights.ts` (pure functions, unit-tested).

## Sessions and nights
- A **session** is what the device records between mask-on and equipment-off (it can contain several mask-on periods).
- A **night** groups sessions by `nightOf(start)` = calendar date of `start − 12 h` (noon-to-noon, like OSCAR). A session starting 23:00 on the 5th and one starting 03:00 on the 6th both belong to night 5. Dates are read from the device clock as wall-clock time (`Session.clock = 'device-local'`).

## Use
`usageHours` = total of the `mask-on` slices of all sessions of the night (mask-off gaps excluded). `0` use gives no AHI.

## AHI and indices
- `AHI = (obstructive + central + hypopnea + unclassified apnea) / usageHours`. **RERA are excluded**, shown separately as `reraIndex = RERA / usageHours`.
- On DS2, hypopneas stored under record `0x0B` are included (as OSCAR does) although the device's own statistics do not count them; they are tagged `detail: 'alt-hypopnea'` ([formats/ds2.md](formats/ds2.md)).
- `snoreIndex` = sum of the device's per-interval snore counts / usageHours.
- Colour hints on the AHI figure (green < 5, amber < 15, red ≥ 15) are a visual aid, **not a diagnosis**; the explainer text tells users that targets are for their clinician.

## Leak
Total leak (L/min) from the device's per-interval statistics (one value about every 2 minutes). `average`, `median`, `p95` and `max` are **time-weighted**: each value counts for the seconds its interval covers (from the previous sample, or from the session start for the first), so a partial last interval weighs less. This is exactly what OSCAR does and reproduces its `Leak_Avg`/`Leak_95th` ([oscar-comparison.md](oscar-comparison.md)). `weightedPercentile` is nearest rank on the cumulative weight.

It is **total** leak: it includes the deliberate vent leak, so a steady non-zero value is normal (about 40 L/min on the sample device). OSCAR shows the same total-leak figure for this device.

## Pressure
`pressure` is the **configured** therapy pressure, deliberately ignoring the ramp:
fixed CPAP → that value; auto-CPAP → min–max; bi-level → EPAP–IPAP; auto bi-level → EPAP min – IPAP max. Only when the settings are missing does it fall back to the pressure changes logged by the device, which include the ramp (visible in the night's pressure chart). `median` of a range is its midpoint.

## Percentiles
`percentile(values, p)` interpolates linearly between closest ranks and is for unweighted data. Leak statistics use the time-weighted nearest-rank variant described above (verified against OSCAR).

## Compliance
Over the last `days` calendar nights ending at the most recent night (default 30): a night is compliant if `usageHours ≥ 4`; nights without data count as 0 h. `ratio` = compliant / days. The common rule "≥ 4 h on ≥ 70 % of nights" is reported as met/not met. The window slides by calendar days, not by nights with data, so gaps lower compliance as they would for a payer.

## Demo data
`generateDemoSessions` (seeded PRNG) produces plausible but fictitious sessions; nothing is derived from real data.

## Tests
`nights.test.ts` (percentile, time-weighted statistics, night boundary at noon, merging sessions, pressure rules, compliance window, demo generator) and `stats.test.ts`.

## Phase 3 definitions

### Setting changes
`settingsChanges(nights)` (core `changes.ts`) compares the settings of each night with the previous night's. A setting is reported only when **both** nights report it and the values differ (devices only report what applies, so a missing key is not a change). Major settings (`isMajor`: mode, pressures, ramp, flex, EZ-Start) are listed first in the UI; minor ones (humidifier level, tube temperature…) are marked as such. The first night of the data cannot have a change.

### Period statistics and comparison
`periodStats(nights)` summarises a set of nights; `comparePeriods(a, b)` returns both plus `delta = b − a`.
- **AHI of a period** = all apneas and hypopneas / **total** hours (weighted by use, so a 2 h night counts for less than an 8 h one); the **median nightly AHI** is reported next to it. The two can differ when a few short nights are extreme.
- **Compliance** = nights with ≥ 4 h / nights **with data** in the period (the dashboard's 30-night compliance counts missing calendar nights as 0 h; this one does not, because the comparison is about the nights that exist).
- **Rates** = events per hour of use over the whole period, per type.
- **Leak** = median across nights of the nightly 95th percentile (and of the nightly median).
- Pairs: `recentVersusPrevious(end, days)` (the `days` calendar days ending at `end` against the `days` before) and `aroundChange(date, days)` (the `days` before a change against the `days` from the change night on).
- The UI never says a change *caused* a difference; it states the caution that sleep, illness, season and mask fit vary too.

### Equipment
`equipmentStatus(item, asOf)`: age in days since `startDate` (counted to `asOf`, the date of the latest data, so results do not depend on today's clock; a replaced item's clock stops at `endDate`). State: `ok`; `soon` when ≤ max(7, 10 % of the interval) days remain; `due` when 0 to 7 days overdue; `overdue` when more than 7 days past; `retired` once replaced. Default intervals (`DEFAULT_INTERVAL_DAYS`: mask 180, cushion 90, headgear 180, hose 90, filter 30, humidifier chamber 180, other 90) are editable starting points, not medical advice.

`leakByAge(nights, item)`: nightly 95 % leak against days of use of the item. With ≥ 6 nights it reports the median of the first and of the latest 7 nights; with ≥ 10 nights a least-squares slope in **L/min per 30 days** and a trend label: `rising` ≥ +2, `falling` ≤ −2, otherwise `flat`. An upward slope with age is a hint, not a diagnosis (fit, position, weight and season also change leak); the UI says so.

### Plain-language summary (`nightFindings`)
Deterministic rules, no machine-learning model, neutral wording, never advice on settings. Each rule yields `{id, level, params}`; the app translates it (`finding.*` strings in three languages).

| Rule | Condition | Level |
|---|---|---|
| use | < 2 h → *very short*; < 4 h → *short*; otherwise *ok* | warn / warn / good |
| AHI band | < 5, 5–15, ≥ 15 | good / warn / warn |
| AHI vs usual | night ≥ 4 h and AHI ≥ 1.5× the 30-night baseline and ≥ 1 above it → *above usual*; ≤ 0.67× and ≥ 1 below → *below usual* | info |
| leak | 95 % leak ≥ 1.25× baseline and ≥ 5 L/min above it | warn |
| large leak | ≥ 5 min of reported large leak | warn |
| mask off | any mask-off period: count and total minutes | info |
| periodic breathing | ≥ 5 min | info |
| RERA | index ≥ 5 per hour | info |
| settings changed | a setting differs from the previous night | info |

Thresholds are reading aids chosen to avoid noise on small differences; they are constants in `findings.ts` and covered by tests.

## Phase 4 definitions

### Rolling average
`rollingMean(values, 7, 3)`: the mean of the last 7 nights **that have a value** (a missing night does not count as zero), shown only once 3 values exist. It is computed over *all* stored nights and then cut to the visible range, so the line is already warmed up at the left edge of a short range. Used on the usage and AHI trend charts (checkbox *7-night average*, on by default).

### Distribution
`histogram(values, edges)`: values below the first edge fall in the first bin and values at or above the last edge in the last bin, so nothing is dropped. Bins: hours of use 0–2, 2–4, 4–5, 5–6, 6–7, 7–8, 8–9, 9+; AHI 0–0.5, 0.5–1, 1–2, 2–3, 3–5, 5–10, 10–15, 15+. Each bar has a title with its range and count and the figure has an accessible name listing them.

### Alerts ("Worth a look")
`detectAnomalies(nights)` looks only at the most recent nights, relative to the user's own history and anchored on the latest night (not today's clock). It needs at least 10 nights.

| Alert | Condition |
|---|---|
| `missedNights` | 3 or more of the last 7 calendar nights have no data **and** the 30 nights before them have at least 14 nights of data (use was regular) |
| `shortRun` | the last 3 nights with data were all under 4 h |
| `leakRise` | median 95 % leak of the last 3 nights ≥ 1.4× the median of the previous 30 nights **and** ≥ 8 L/min above it (needs ≥ 10 previous nights) |
| `ahiRise` | mean AHI of the last 7 nights (nights ≥ 2 h only) ≥ 2× the mean of the previous 30 **and** ≥ 2 higher |

They are prompts to look at the data, worded neutrally with a note that they are not a diagnosis. They are in-app only (no notifications). Thresholds are constants in `anomalies.ts`, covered by tests that check both the trigger and the "almost but not quite" cases.

### Breathing and oxygen
See [breathing-analysis.md](breathing-analysis.md) and [oximetry.md](oximetry.md). The plain-language summary gained three rules: `flatHigh` (flat-topped share ≥ 1.5× the usual and ≥ 20 % and ≥ 5 points above it, on ≥ 30 min of flow), `periodicPattern` (≥ 15 % of the night), and oximeter rules (`desatFrequent` ODI3 ≥ 5/h, `lowOxygenTime` T90 ≥ 5 %, otherwise `oxygenSteady`; only with ≥ 1 h of valid data).
