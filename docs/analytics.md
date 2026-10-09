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
