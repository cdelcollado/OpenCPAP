# ADR-0016: Application updates: versions, a banner and manual publishing

Status: accepted (October 2026).

## Context
The web app is static files served from the maintainer's own host ([ADR-0014](0014-static-hosting-with-nginx.md), [ADR-0015](0015-https-caddy-cloudflare-dns.md)). It is also installed as a PWA with a service worker (`vite-plugin-pwa`, Workbox) so it works offline. Before this decision:

- The version was `0.0.0` everywhere and there were no release tags.
- The service worker used `registerType: 'autoUpdate'`: a new build activated at once (`skipWaiting`, `clientsClaim`) and the page reloaded by itself. Nothing told the user, and a reload could discard text being typed in a note that was not saved yet.
- Publishing was manual (`deploy/deploy.sh`, from the maintainer's workstation).

Options considered:
- **Automatic reload when a new version arrives** (`registerType: 'autoUpdate'`, the previous setting). Simple, but a reload can discard text typed in a night note that has not been saved yet.
- **Banner that asks the user** (`registerType: 'prompt'` and `onNeedRefresh`): the new worker waits until the user presses the button. Chosen.
- **Server-side version check** (a `version.json` polled by the page). Not needed: the service worker already compares the installed build with the published one. It would add a file to keep in sync and an endpoint to trust.
- **Automatic deployment on the host** (cron running `git pull` and `npm run build` on the LXC, or a CI job publishing on each tag). Needs Node and the repository on the host, widens what the host can run for a single-user installation, and nothing currently needs it. Revisit when there is more than one maintainer or more than one instance.

## Decision
- **Semantic versions** in `apps/web/package.json` (and the root `package.json`), starting at **1.0.0**, the first release. Patch: fixes with no new behaviour. Minor: new features, backwards compatible. Major: changes that need a user action (for example a data format change that requires a backup first).
- **Changelog by release**: `CHANGELOG.md` keeps an `[Unreleased]` section; publishing a version moves it under the version heading and tags the commit `vX.Y.Z`.
- **The version is shown** in the footer of Settings (`__APP_VERSION__`, taken from the web app's `package.json` at build time).
- **The service worker waits** after a download (`registerType: 'prompt'` in `apps/web/vite.config.ts`). `registerSW` calls `onNeedRefresh`, which marks the update as ready (`apps/web/src/update.ts`). The end-to-end test in `e2e/app.e2e.ts` ('app updates') checks this against a changed `sw.js`. A banner at the bottom of the page offers *Update now*, which activates the new service worker and reloads the page. The new version is not activated without that click.
- **Checks for updates** when the app is open: once an hour and when the tab becomes visible again (`registration.update()`).
- **Publishing stays manual** (`deploy/deploy.sh`, see [deployment.md](../deployment.md#updating)).

## Consequences
- The user always decides when to reload, so a note that is being typed is not lost by a surprise reload. The reload does lose anything that was not yet saved in the page; the banner is shown, so the user can finish first.
- Local data does not change on update: notes, equipment and sessions are in IndexedDB in the browser. A future change to the database schema must migrate the data on open and, if it is not reversible, be announced as a major version with a backup prompt.
- Devices that never loaded the app from this domain do not receive the banner. Updates only reach installations that already have the app.
- The server itself (Caddy, the domain, the certificate) is not updated by this mechanism. Re-running `provision.sh` remains a manual step when the Caddy configuration changes.
- Browsers without service worker support never see the banner. They still get the newest deployed build on each visit, because `sw.js` is served with `no-cache` and the page is not cached by the browser.
