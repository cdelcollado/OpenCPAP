# Development guide

## Prerequisites
Node.js 20+ (developed on 24), npm 10+. (pnpm is not required.)

## Commands
```bash
npm install         # install all workspaces
npx tsc -b          # type-check with project references
npx vitest run      # run all tests
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
2. Implement `DeviceLoader` and register it in the loader list.
3. Write `docs/formats/<name>.md` before or with the code.
4. Add synthetic-fixture tests and an OSCAR cross-check script.
5. Update the supported-devices table in `README.md`.

## Commits
English messages, imperative mood, explain the why. Documentation updates ship in the same commit as the code they describe.
