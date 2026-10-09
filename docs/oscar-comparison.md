# Comparing OpenCPAP with OSCAR

OSCAR is the reference implementation for PRS1 data, so agreement with it is our strongest correctness signal. This guide explains how to run the comparison and how to read the result. Status: **tooling ready; first comparison pending an OSCAR export from the maintainer's card** (see [roadmap](roadmap.md)).

## What is compared
Per session, keyed by the session id (OSCAR shows the id in decimal; we use the same integer):

| Metric | Our value | OSCAR column |
|---|---|---|
| Total time | mask-on time or session span (whichever is closer; both are reported) | `Total Time` |
| AHI | (OA + CA + H) / mask-on hours | `AHI` |
| Obstructive / clear airway / hypopnea / RERA / flow-limitation counts | parsed events | `… Count` columns |
| Clock offset | OSCAR start − our start, in whole hours | `Start` |

The clock offset is informational: OSCAR formats the device's wall-clock seconds with the *exporting machine's* time zone, so a constant +1 h/+2 h shift is expected and also tells us whether the device clock is local or UTC (see [ds2.md §4](formats/ds2.md)). A non-constant shift would point to a DST handling difference.

Not compared yet: pressure and leak statistics (OSCAR derives "unintentional leak" with a mask-specific model that we do not implement).

## Steps
1. Install OSCAR (Linux): `flatpak install flathub com.sleepfiles.OSCAR` (or download from <https://www.sleepfiles.com/OSCAR/>).
2. Start OSCAR, create a profile, then import the card: *Import* → select the folder that contains `P-SERIES` (for the dev card: `fixtures/raw`). Wait for the import to finish.
3. Export: *File* → *Export* → *CSV…* (menu wording may vary slightly by version). In the dialog choose **Sessions** (not Summary), range **Everything**, pick a file name, press *Export*.
4. Run the comparison:
   ```bash
   npx tsx scripts/compare-oscar.ts path/to/oscar-sessions.csv            # card defaults to fixtures/raw
   npx tsx scripts/compare-oscar.ts path/to/oscar-sessions.csv /path/to/card
   ```
   (`npm run compare-oscar -- path/to/file.csv` is equivalent.)

## Reading the output
```
OSCAR sessions: 550, found in OpenCPAP: 550
OK   total time (s)                  550/550 match, max |diff| 0
DIFF AHI                              12/550 match, max |diff| 0.4
       session 377: ours 0.123 vs OSCAR 0.0
OSCAR start − device start (hours, histogram): {"1": 400, "2": 150}
```
- Tolerances: time ±2 s, AHI ±0.05, event counts exact.
- Known, expected difference: hypopneas stored under DS2 record `0x0B` are counted by OSCAR and by us (`detail: 'alt-hypopnea'`) but not by the device's own statistics.
- Sessions that OSCAR skips (no summary, or "summary only" short sessions) may be absent from its CSV; those are not errors.
- Sessions listed as "missing" are in OSCAR's CSV but not decoded by OpenCPAP — investigate those first.

## Recording results
After the first successful run, add a row to the verification log in [formats/ds2.md](formats/ds2.md#12-verification-log) with the date, OSCAR version, number of sessions compared and any residual differences, and tick the roadmap item.

## Implementation
`scripts/oscarCsv.ts` (parser + comparison, unit-tested in `scripts/oscarCsv.test.ts` with a synthetic CSV) and `scripts/compare-oscar.ts` (CLI). No OSCAR output is committed to the repository because it contains the user's health data.
