# ADR-0011: Multi-device support (Phase 5)

- Status: accepted
- Date: 2026-10-09

## Context
Phase 5 adds the first loader after Philips: ResMed (EDF+). The maintainer owns no ResMed device, so nothing can be validated against a real card. The canonical model was shaped by the DreamStation 2.

## Decisions
1. **A generic EDF/EDF+ reader in `core`** (`readEdf`), not inside the ResMed package. Other manufacturers and the existing oximeter/export code use the same container; the reader is unit-tested independently with an EDF+ builder (`buildEdfPlus`) that also creates the synthetic cards.
2. **ResMed support is labelled "Synthetic", not "Verified".** The matrix in [devices.md](../devices.md) separates *what has been tested on real data* from *what follows the documentation*, and every unconfirmed statement in [formats/resmed.md](../formats/resmed.md) is marked *unverified*. Rejected: claiming support without real-card validation.
3. **Leak is two channels.** ResMed reports unintentional leak, Philips total leak. A new `leak-unintentional` series and `NightSummary.leakKind` keep the difference visible; the UI explanation says they must not be compared. Rejected: converting one into the other (needs the mask's vent characteristics) or silently mixing them.
4. **Loaders map settings onto the shared keys** (`mode: 'cpap' | 'auto-cpap'`, `pressureMin/Max`, `flexMode: 'epr'`, …) so the night view, setting-change detection and reports work for every device without device-specific code in the app.
5. **A shared conformance suite** (`checkSessions` in `core`) encodes the invariants the app relies on (epoch ms, L/min, cmH2O, sorted events, containment, unique ids). Every loader's tests call it, and a new loader's author learns the rules from its messages.
6. **Card sources keep root files** (`ROOT_FILES`): ResMed's `STR.edf` and `Identification.tgt` live beside `DATALOG`, and path re-rooting used to discard them. They are kept only when they share a folder with a marker folder, so unrelated files on the card are still ignored. Found by an end-to-end test that imported a ZIP: the loader unit tests alone had passed.
7. **Sessions are anchored on the flow file and files are attached by start time** (±60 s) rather than parsing `STR.edf` mask times. It is simpler and works without `STR.edf`, at the cost of splitting a mask-on period that the device wrote as several BRP files (night totals stay right). Deriving sessions from the mask times is a follow-up for when a real card is available.
8. **Breath analysis block-averages faster flow to 5 Hz** instead of retuning the detector, so it runs under the conditions it was validated for. Whether this is adequate for ResMed's calibrated flow is an open question.
9. **No per-device filter yet.** Stored sessions of different devices share one timeline; a user who switches machines sees both, with the leak explanation and setting-change markers making the switch visible. Revisit when a second real device exists.

## Consequences
- The ResMed loader may need adjustments when run on real cards (label names, file alignment, modes). The synthetic tests prove internal consistency, not agreement with ResMed's files.
- The importer's memory use rises: a 25 Hz flow for one night is about 3 MB per session before IndexedDB.
- Leak trends across a device change are not meaningful.
