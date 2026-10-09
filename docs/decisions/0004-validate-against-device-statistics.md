# ADR-0004: Validate parsers against the device's own statistics

- Status: accepted
- Date: 2026-10-09

## Context
The DS2 format is undocumented, so a parser can be plausible yet wrong. Comparing with OSCAR requires running OSCAR (a Qt desktop app) and exporting its numbers by hand.

## Decision
Each summary record (`B01` code `0x08`) contains event counts that the device computed itself. The real-card integration test compares them with the counts we derive from the event files (`B02`) for every session. OSCAR comparison is still done, but as a second, manual layer.

## Consequences
- Found and fixed three bugs immediately (one record per mask-on period, wrong word for central apneas, hypopnea code `0x0B` not counted by the device).
- The check only runs when a real card is present in `fixtures/raw/`; CI relies on synthetic tests.
- It validates event parsing, not usage time, pressure or leak; those need the OSCAR comparison.
