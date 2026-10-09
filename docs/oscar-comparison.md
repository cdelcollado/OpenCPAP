# Comparing OpenCPAP with OSCAR

OSCAR is the reference implementation for PRS1 data, so agreement with it is our strongest correctness signal. This guide explains how to reproduce the comparison and records the result.

**Result (2026-10-09, OSCAR 2.1.0 vs OpenCPAP, DreamStation 2 Advanced CPAP card with 550 sessions): every session matches on every compared metric** — see [Results](#results).

## What OSCAR exports
OSCAR's CSV export has **one row per session** with these columns:

`Date, Start, AHI, RDI, OAHI, CAHI, OA, UA, A, H, OH, CH, CA, RERA, Pressure_Avg, Pressure_Min, Pressure_Max, Pressure_95th, Leak_Avg, Leak_Max, Leak_95th, SpO2_Avg, SpO2_Min, Pulse_Avg, Hours, Hours_Used, Machine`

- `Date` is OSCAR's noon-to-noon day; `Start` is the session start in the **local time zone of the machine that exported** (OSCAR treats the device's wall-clock seconds as UTC and then converts them).
- There is **no session id**, so rows are matched by start time.
- Empty columns on this device: `Pressure_*` (fixed-pressure CPAP), `SpO2_*`, `Pulse_Avg`, `OAHI/CAHI/UA/A/OH/CH`. `Leak_*` is only present for sessions that have event data (333 of 550 here).
- (Older OSCAR versions may export different columns; the parser fails with "Not a recognised OSCAR CSV export" if required ones are missing.)

## Steps
1. Install OSCAR (<https://www.sleepfiles.com/OSCAR/>, `.deb` or Flatpak) and create a profile.
2. *Import* the card: select the folder that contains `P-SERIES` (for the dev card: `fixtures/raw`).
3. Export the CSV from OSCAR's export dialog (sessions/daily rows, whole date range) and save it in the project folder as `oscar-<anything>.csv`. Such files are git-ignored because they contain health data.
4. Run:
   ```bash
   npx tsx scripts/compare-oscar.ts oscar-sessions.csv            # card defaults to fixtures/raw
   npx tsx scripts/compare-oscar.ts oscar-sessions.csv /path/to/card
   OSCAR_TZ=Europe/Madrid npx tsx scripts/compare-oscar.ts oscar-sessions.csv   # override the matching time zone
   ```
   By default the time zone of this machine is used; it must be the zone OSCAR used when exporting.

## How rows are matched
`oscarKey(row)` rebuilds the local timestamp from `Date` + `Start` (a start before 12:00 belongs to the *next* calendar date, because OSCAR's day starts at noon). Each of our sessions is indexed by `localKey(start, tz)`: the device wall-clock value is interpreted as UTC and shown in the time zone, which reproduces OSCAR's display (including daylight-saving time). Our start is looked up at −1 s, 0 s and +1 s because **OSCAR's start is often one second earlier** than ours (91 of 550 sessions).

## Compared metrics and tolerances
| Metric | Ours | OSCAR | Tolerance |
|---|---|---|---|
| hours with mask on | total of `mask-on` slices | `Hours` | 0.006 h (OSCAR rounds to 2 decimals) |
| hours incl. short gaps | session end − start | `Hours_Used` | 0.006 h |
| AHI | (OA+CA+H+UA)/hours | `AHI` | 0.011 |
| RDI | AHI events + RERA per hour | `RDI` | 0.011 |
| OA / CA / H / RERA counts | parsed events | `OA`, `CA`, `H`, `RERA` | exact |
| leak average | **time-weighted** mean of total leak | `Leak_Avg` | 0.5 L/min |
| leak maximum | max of total leak | `Leak_Max` | exact |
| leak 95th percentile | **time-weighted** nearest-rank percentile | `Leak_95th` | 1 L/min |

Pressure is not compared on this device because OSCAR leaves the columns empty for fixed-pressure CPAP.

## Results
Run on 2026-10-09 with OSCAR 2.1.0 (Ubuntu package `oscar20 2.1.0-Ubuntu26`), time zone Europe/Madrid:

```
OSCAR rows: 550; matched by start time (Europe/Madrid): 550
OK   hours with mask on              550/550  within tolerance, max |diff| 0.005
OK   hours incl. short gaps          550/550  within tolerance, max |diff| 0.005
OK   AHI (events/h)                  550/550  within tolerance, max |diff| 0.005
OK   RDI (incl. RERA)                550/550  within tolerance, max |diff| 0.005
OK   obstructive apnea count         550/550  within tolerance, max |diff| 0
OK   central apnea count             550/550  within tolerance, max |diff| 0
OK   hypopnea count                  550/550  within tolerance, max |diff| 0
OK   RERA count                      550/550  within tolerance, max |diff| 0
OK   leak average (L/min)            333/333  within tolerance, max |diff| 0.05
OK   leak maximum (L/min)            333/333  within tolerance, max |diff| 0
OK   leak 95th percentile (L/min)    333/333  within tolerance, max |diff| 1
```

### What the comparison taught us
1. **Counts, AHI, RDI and durations were right the first time** — the DS2 decoder and the event parser agree with OSCAR on all 550 sessions (including the alternate hypopnea record `0x0B`, which OSCAR counts as we do).
2. **Leak statistics are time-weighted.** The first run differed on a few short sessions: OSCAR weights each statistics interval by the time it covers, and the last interval is usually partial (e.g. 24 L/min for 120 s then 46 L/min for the remaining 31 s gives an average of 28.52, not 35). `weightedMean`, `weightedPercentile` and `intervalSeconds` in `@opencpap/core` implement this and the app now uses them for the night summaries. The weighted mean matched OSCAR in 333/333 sessions.
3. **Percentile definition.** The time-weighted nearest-rank percentile equals OSCAR's 95th percentile within 0.5 L/min in 331 of 333 sessions and within 1 L/min in all 333 (two sessions differ by exactly 1, probably because OSCAR bins values). Linear interpolation (321/333) and unweighted percentiles (319/333) fit worse.
4. **`Hours` vs `Hours_Used`.** `Hours` is the time with the mask on (what the AHI divides by); `Hours_Used` also includes short mask-off gaps inside a session (20 sessions differ). OpenCPAP's "use" is the mask-on time.
5. **Leak is *total* leak** (it includes the vent flow); OSCAR's `Leak_*` columns equal ours, so no unintentional-leak model is involved for this device.
6. **Clock.** OSCAR's local start times equal our device wall-clock values shifted by the machine's zone offset (+1 h in winter, +2 h in summer), confirming the device clock has no zone information and OSCAR shows it as if it were UTC.

## Re-running after changes
Run the script after any change to parsing or analytics and keep the table above in step. A mismatch should be investigated before releasing. Each OSCAR major version may alter statistics, so record the version with the result.

## Implementation
`scripts/oscarCsv.ts` (parser, matching, comparison; unit-tested in `scripts/oscarCsv.test.ts` with a synthetic CSV) and `scripts/compare-oscar.ts` (CLI). No OSCAR output is committed.
