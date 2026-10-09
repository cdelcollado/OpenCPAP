# Integrations: Home Assistant, MQTT, Wi-Fi SD adapters

**Status: not built.** A static, local-first web app cannot run in the background, read an SD card on its own, or keep a connection to a broker, so these integrations need a separate program (a "companion"). This page records what was decided, what exists today as a building block, and a design for later.

## What exists today: the JSON summary
The dashboard's **Export summary (JSON)** button downloads `opencpap-summary.json` (`summaryJson` in `apps/web/src/exports.ts`). It is a stable, figures-only document that other tools can read, for example a Home Assistant command-line or file sensor, a script, or a spreadsheet.

```json
{
  "schema": "opencpap-summary/1",
  "generated": "2026-05-01T20:15:00.000Z",
  "as_of": "2026-04-30",
  "last_night": {
    "date": "2026-04-30", "usage_hours": 7.42, "ahi": 1.3,
    "obstructive": 3, "central": 1, "hypopnea": 5,
    "leak_p95_lmin": 18.2, "leak_kind": "total",
    "pressure_min_cmh2o": 8, "pressure_max_cmh2o": 8, "mode": "cpap"
  },
  "last_7_days":  { "days": 7,  "nights_with_data": 7,  "usage_hours_mean": 7.1, "nights_over_4h": 7,  "compliance_pct": 100, "ahi": 1.6, "leak_p95_lmin": 17.9, "leak_median_lmin": 9.4 },
  "last_30_days": { "days": 30, "nights_with_data": 28, "usage_hours_mean": 6.8, "nights_over_4h": 26, "compliance_pct": 92.9, "ahi": 1.8, "leak_p95_lmin": 18.6, "leak_median_lmin": 9.9 }
}
```
Rules: dates are `YYYY-MM-DD` on the device's clock; numbers use a decimal point; missing values are `null`; `last_night` is absent when there are no nights; `leak_kind` is `total` (Philips) or `unintentional` (ResMed) and values of the two kinds must not be compared ([devices.md](devices.md)); new fields may be added within `/1`, a breaking change bumps the number. It contains no notes, names or serial numbers.

## Why there is no live integration in the web app
- A browser tab cannot run when it is closed, and the folder permission of the File System Access API is granted per session and needs a user gesture, so an unattended sync of a removable card is not something a page can promise (*unverified* for every browser; the app does not try).
- MQTT brokers speak TCP; browsers only speak MQTT over WebSockets if the broker enables it, and a page would need credentials stored in the browser.
- Posting to a Home Assistant webhook from the page needs CORS to be enabled on the HA side, and an always-open tab.

## Design for a future companion (not started)
- A small Node or Tauri program that reuses `@opencpap/core`, `@opencpap/loader-*` and the same `summaryJson`, watches a folder (a mounted card, or the folder a Wi-Fi SD adapter such as FYSETC SD WiFi PRO writes to), imports new sessions, and
  - publishes `opencpap-summary/1` to MQTT (`opencpap/<device>/summary`, retained) with Home Assistant **MQTT discovery** topics for AHI, hours, leak, compliance;
  - optionally pushes a webhook.
- It would run entirely on the user's machine and send nothing elsewhere. Credentials live in the OS keychain, not in a web page.
- Wi-Fi SD adapters expose the card over HTTP or sync to a folder; the companion treats either as "a folder that fills up", so no per-adapter code is needed beyond path handling.

## Contributing
If you want this, start with an ADR and a `packages/companion` that depends only on core and the loaders (no DOM). The ResMed loader and the DS2 loader already run in Node.
