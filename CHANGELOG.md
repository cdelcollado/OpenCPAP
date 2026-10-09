# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/) once a first release exists.

## [Unreleased]
### Added
- `@opencpap/browser`: `FileListFS`, `DirectoryHandleFS` (File System Access API) and `ZipFS` card sources with marker-folder re-rooting and size limits; import worker, message protocol and `importCard` client with progress, error propagation and cancellation.
- `@opencpap/core`: `detectLoader`, `loadCard`, `UnsupportedCardError`.
- `docs/browser-import.md`, ADR-0005.
- DS2 chunk framing reader with header checksum and CRC-32/CRC-16 validation.
- DS2 summary, event and waveform parsers; `philipsDs2Loader.load()` yields canonical sessions (settings, mask slices, events, flow waveform, statistics).
- Canonical model extensions: `Session.id`, `clock`, `slices`, `statistics`, `TimeSeries`, `TherapyEvent.detail`, `variable-breathing`.
- `summarizeSession()` in `@opencpap/core` (usage, event counts, AHI).
- Test suite: synthetic builders for containers/chunks, parser tests, end-to-end loader test, and a real-card integration test that cross-checks parsed counts against the device's own statistics.
- Monorepo scaffold (npm workspaces, TypeScript strict, Vitest).
- Canonical data model, `VirtualFS`, `DeviceLoader` interface in `@opencpap/core`.
- Philips DreamStation 2 loader: detection and encrypted-container decryption (AES-256-GCM, PBKDF2), verified on a real card.
- Documentation set: architecture, data model, DS2 format, roadmap, feature catalog, privacy, development guide.
- GPL-3.0-or-later license.
