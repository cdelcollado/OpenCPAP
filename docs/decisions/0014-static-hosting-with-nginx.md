# ADR-0014: Host the web app as static files on nginx, deployed by rsync

Status: accepted (October 2026). Partly superseded by [ADR-0015](0015-https-caddy-cloudflare-dns.md): the static hosting and rsync publishing remain, but nginx is replaced by Caddy with HTTPS.

## Context
OpenCPAP has no backend. All parsing, storage (IndexedDB) and analysis run in the browser, and the server only delivers the built files ([architecture.md](../architecture.md), [privacy-and-security.md](../privacy-and-security.md)). The maintainer wants to serve it from a Debian LXC on Proxmox on the home network, and to be able to update it from the development machine.

## Decision
- **Serve the Vite build output (`apps/web/dist`) with nginx** in the LXC. nginx only needs a root directory, a fallback to `index.html`, and two file-specific rules (the PWA manifest MIME type and no-cache for `sw.js`). See [deploy/nginx-opencpap.conf](../../deploy/nginx-opencpap.conf).
- **Build on the development machine, not in the LXC.** The LXC then needs no Node.js, no npm and no build cache. Debian 13 ships an old Node.js, so building there would mean an extra repository.
- **Publish with `rsync --delete`** over SSH key authentication ([deploy/deploy.sh](../../deploy/deploy.sh)). The sync is a full replacement of the web root, so stale hashed assets never linger.
- **Provisioning is a separate, idempotent script** ([deploy/provision.sh](../../deploy/provision.sh)) that installs nginx and the site configuration.
- **Plain HTTP on the local network** by default. HTTPS is left to the operator (reverse proxy or a self-signed certificate), because it depends on the local DNS and certificate policy.

## Alternatives considered
- **Docker container.** Adds a runtime and an image to maintain for a directory of static files.
- **Build inside the LXC from git.** Requires Node.js 20+ in the container and a clean checkout on the host. More moving parts, same result.
- **Serve through Vite preview or a Node server.** Needs a long-running process. `vite preview` is for testing, not production.
- **CI-driven deployment.** Not needed for a single personal instance, and it would require the host to be reachable from the internet or from a runner.

## Consequences
- The site is only as private as the network it runs on. Nothing sent to the server contains health data, because the server never receives any; this must stay true (see [privacy-and-security.md](../privacy-and-security.md)).
- Without HTTPS the service worker does not register (outside `localhost`), so the offline mode and the PWA install are unavailable on plain HTTP. This is documented in [deployment.md](../deployment.md).
- Any change that adds a server-side endpoint would invalidate this decision and needs a new ADR.
