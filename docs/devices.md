# Supported devices (compatibility matrix)

Support levels, from weakest to strongest:

| Level | Meaning |
|---|---|
| **Planned** | not started |
| **Synthetic** | a loader exists and passes the shared conformance checks and its own tests on **synthetic** cards built from documentation; never run on a real card |
| **Verified** | run on a real card of that device and the per-night results (usage, AHI, event counts, leak) match OSCAR |

A "Verified" entry names the model and firmware that were actually tested; other models of the same family are expected to work but are untested.

| Manufacturer | Device family | Loader | Level | Notes |
|---|---|---|---|---|
| Philips Respironics | DreamStation 2 (`P-SERIES`, encrypted `.B0n`) | `philips-ds2` | **Verified** — 420X150C, firmware V1.0.6: 550 / 550 sessions match OSCAR 2.1.0 on usage, AHI, RDI, event counts and leak | [formats/ds2.md](formats/ds2.md), [oscar-comparison.md](oscar-comparison.md). Other DS2 models untested. |
| ResMed | AirSense 10 / AirCurve 10 / S9 (`DATALOG`, `STR.edf`, EDF+) | `resmed` | **Synthetic** | [formats/resmed.md](formats/resmed.md). Bi-level/ASV modes are not named; device oximeter, tidal volume, respiratory rate and snore are not imported yet. |
| ResMed | AirSense 11 / AirCurve 11 | `resmed` | **Synthetic**, best effort | Same loader; `Identification.json` is read tolerantly, the rest is *unverified*. |
| Philips Respironics | DreamStation 1, System One (unencrypted `.00n`) | — | Planned | OSCAR's PRS1 loader covers them; the DS2 loader refuses these cards. |
| Fisher & Paykel | SleepStyle, Icon | — | Planned | |
| BMC / Luna / Löwenstein | — | — | Planned | |

## What differs between manufacturers (read before comparing numbers)

- **Leak:** Philips reports total leak (includes the mask vent); ResMed reports unintentional leak. Do not compare absolute values between them. See [formats/resmed.md](formats/resmed.md#7-leak-is-not-the-same-quantity-as-on-philips-devices).
- **Events:** each device scores apneas and hypopneas with its own algorithm, so AHI from different manufacturers is not strictly comparable.
- **Flow:** DS2 stores a 5 Hz signal of unverified scale; ResMed stores calibrated flow at 25 Hz. The breath analysis ([breathing-analysis.md](breathing-analysis.md)) only uses shape and timing, and reduces faster signals to 5 Hz.
- **Changing machine:** the app shows one timeline for all stored sessions. If you switch devices, the nights of both are shown together; the leak explanation and the setting-change markers (mode, pressure) make the switch visible, but a per-device filter is on the roadmap.

## How to help

Run the app on your own card and compare with OSCAR; open an issue with the model, firmware and which nights differ, **without attaching the card** (it contains health data and the serial number). To add a manufacturer see [adding-a-device.md](adding-a-device.md).
