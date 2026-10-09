# OpenCPAP — instructions for Claude

## Language and documentation (standing rule, all phases)
- **All documentation is written in English**: every `.md` file, code comments, commit messages, PR descriptions, JSDoc/TSDoc, and issue text. Conversation with the maintainer happens in Catalan; that does not change the language of project artifacts.
- **Be exhaustive.** Each phase must leave behind complete Markdown documentation, not just code. At minimum, update or create as relevant:
  - `README.md` (overview, status, quick start, supported devices matrix)
  - `docs/roadmap.md` (phase status, checklists)
  - `docs/architecture.md` (packages, data flow, design decisions and their rationale)
  - `docs/data-model.md` (canonical model reference: every field, unit, timezone/epoch convention)
  - `docs/formats/<device>.md` (file formats; every field, offset, enum and open question)
  - `docs/privacy-and-security.md`, `docs/development.md`, `CONTRIBUTING.md`, `CHANGELOG.md`
  - `docs/decisions/NNNN-title.md` (ADRs) whenever a non-obvious choice is made
  - `docs/features.md` (feature catalog with origin of each idea)
- Documentation is part of the definition of done: a phase is not complete until its docs are written and accurate. Cite sources (OSCAR file/class names, URLs) and mark unverified claims explicitly as *unverified*.

## Project facts
- Local-first web app that reads CPAP SD card data in the browser. First device: Philips DreamStation 2. Others later (ResMed, etc.) via the `DeviceLoader` plugin interface in `packages/core`.
- License: GPL-3.0-or-later (logic is adapted from OSCAR's PRS1 loader, which is GPLv3).
- Monorepo with npm workspaces (pnpm is not installed). Checks: `npx tsc -b` and `npx vitest run`.
- `fixtures/raw/` holds real patient SD data and is git-ignored. **Never commit, upload, or paste real health data or serial numbers.** Tests committed to git must use synthetic data.
- The OSCAR source (reference only) is cloned outside the repo; do not vendor it.
- Medical disclaimer: informational tool, not a medical device.
- Plan: `~/.claude/plans/vull-que-planifiques-el-adaptive-cloud.md`.
