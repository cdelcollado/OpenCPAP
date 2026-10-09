# Development guide

## Prerequisites
Node.js 20+ (developed on 24), npm 10+. (pnpm is not required.)

## Packages
`core` (model, interfaces, stats, night analytics, demo data) · `loaders/*` (one per device family) · `browser` (card sources, worker) · `apps/web` (the React app) · `e2e` (Playwright) · `scripts` (developer tools). Test helpers for synthetic DS2 data are exported as `@opencpap/loader-philips-ds2/testing`.

## Commands
```bash
npm install         # install all workspaces
npx tsc -b          # type-check with project references
npx vitest run      # run all unit/integration tests
npm run dev         # web app with hot reload
npm run build       # production build of the web app
npm run e2e         # build + Playwright E2E and accessibility tests (needs Google Chrome and poppler-utils for the PDF test)
```

## Layout and conventions
- TypeScript strict, `noUncheckedIndexedAccess` on: index access yields `T | undefined`, handle it.
- Packages export TS sources directly (`main: src/index.ts`); bundlers consume them.
- Tests sit next to sources as `*.test.ts`. Use `MemoryFS` for loader tests.
- Dependencies of note: `@noble/ciphers`, `@noble/hashes` v2 (import paths end in `.js`, e.g. `@noble/ciphers/aes.js`).

## Working with real SD data
1. Copy the card's `P-SERIES` folder to `fixtures/raw/` (git-ignored).
2. Use throwaway scripts/tests to explore; never commit outputs that contain serials, GUIDs or raw data.
3. Reference implementation: OSCAR's `oscar/SleepLib/loader_plugins/prs1_*.cpp` (GitLab `CrimsonNape/OSCAR-code`). Clone it outside this repository.

## Adding a device loader
1. Create `packages/loaders/<name>/` with `package.json`, `tsconfig.json`, `src/index.ts`.
2. Implement `DeviceLoader` (with a specific `detect` that returns `null` for other families) and register it in `packages/browser/src/worker.ts` (`LOADERS`).
   Add the family's root folder (e.g. `DATALOG`) to `ROOT_MARKERS` in `packages/browser/src/paths.ts` if it is not there yet.
3. Write `docs/formats/<name>.md` before or with the code.
4. Add synthetic-fixture tests and an OSCAR cross-check script.
5. Update the supported-devices table in `README.md`.

The complete checklist (conformance checks, root files, settings keys, units, validation against OSCAR) is in [adding-a-device.md](adding-a-device.md).

## Commits
English messages, imperative mood, explain the why. Documentation updates ship in the same commit as the code they describe.

## Working on the web app
- Start with `npm run dev`; use **Import → Load demo data** for data without a card, or import `fixtures/raw` through the folder input.
- Pure logic belongs in `@opencpap/core` (unit-tested); React components stay thin. Database access only through `db/repository.ts`.
- User-visible strings go in `apps/web/src/i18n/locales/*.json` (all three languages; the parity test fails otherwise). Never hard-code text in components.
- Colours come from the CSS variables in `styles.css`; charts read them via `readColors()`. Check both themes.
- Add or change a screen → update [web-app.md](web-app.md), the E2E tests, and run the axe checks.
- E2E details and conventions: [testing.md](testing.md).
