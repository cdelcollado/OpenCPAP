# ADR-0007: Noon-to-noon nights and configured pressure

- Status: accepted
- Date: 2026-10-09

## Context
Devices record *sessions*; users think in *nights*. Also, the first version of the dashboard showed the median of the logged pressure changes, which included the ramp (4 cmH₂O at the start) and displayed misleading values such as "4.0–9.5" and a table median of 4–5 for a fixed 9.5 prescription (found when viewing real data).

## Decision
1. A night is the calendar date of `start − 12 h`; all sessions with the same date are merged (OSCAR uses the same split).
2. The headline pressure is the **configured** pressure from the session settings (fixed value or the min–max of the mode). Logged pressure changes are only a fallback when settings are missing; the ramp stays visible in the pressure chart.

## Consequences
- Late-evening and after-midnight sessions of one night are one row; people who sleep during the day are not specially handled (a noon boundary can split them).
- Auto-titrating devices will show a range, and their actual pressure distribution (median/95 %) still needs to be added from the device's statistics when we have a device that provides it.
