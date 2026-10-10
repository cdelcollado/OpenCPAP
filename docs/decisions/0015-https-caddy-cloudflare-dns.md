# ADR-0015: HTTPS with Caddy and a Cloudflare DNS challenge, LAN only

Status: accepted (October 2026). Amends [ADR-0014](0014-static-hosting-with-nginx.md), which used plain HTTP on nginx.

## Context
The web app is static files ([ADR-0014](0014-static-hosting-with-nginx.md)). Its service worker (offline use, install as an app) only registers in a secure context, so the app needs HTTPS to be fully usable. The host is a Debian LXC on a home Proxmox server. The maintainer's domain (`aptimait.com`) is managed by Cloudflare DNS.

Options considered for HTTPS:
- **Cloudflare Tunnel**: makes the service reachable from the internet. Not acceptable for an app whose users are health-related, when nothing needs external access.
- **Tailscale** (`tailscale serve` / `tailscale cert`): gives valid HTTPS and private access, including from outside the home. Good, but it ties access to a Tailscale account and client.
- **Self-signed certificate**: browsers warn, and the certificate must be installed on each device.
- **Local CA** (for example, an internal certificate authority installed on every device): valid on the network, but a private root to maintain and trust on each device.
- **Caddy with a Let's Encrypt certificate obtained by the DNS-01 challenge through the Cloudflare API**: valid public certificate, no inbound port needed, the host can keep a private address, and it reuses the existing Cloudflare account.

## Decision
- Serve the static build with **Caddy**, replacing nginx ([deploy/Caddyfile.template](../../deploy/Caddyfile.template), [deploy/caddy.service](../../deploy/caddy.service)).
- Obtain the certificate with the **DNS-01 challenge** through the Cloudflare API, using the `caddy-dns/cloudflare` plugin. The token is stored only on the host, in `/etc/caddy/cloudflare.env`, readable by root.
- Point a subdomain (`cpap.aptimait.com`) at the host's **private address** with the Cloudflare proxy disabled. The service is reachable only from the local network (and from anything the operator adds later, such as Tailscale).
- Keep the scripts and the guide in the repository. `provision.sh` installs Caddy and the configuration; `deploy.sh` keeps publishing the same web root.

## Consequences
- **No internet exposure.** The certificate is issued through DNS, so no port has to be open to the internet. Nothing is published except the DNS record, which points to a private address.
- **Certificate Transparency** logs show the subdomain name when the certificate is issued. The name is not secret, but it is public; the health data is not involved, and the server never receives it.
- **A powerful token on the host.** A Cloudflare token with DNS edit rights for the zone is stored on the host. Mitigation: the token is scoped to one zone, the file is `chmod 600`, and it must be rotated if the host is compromised.
- **Dependency on an external plugin build.** `provision.sh` downloads Caddy with the plugin from `caddyserver.com`. The download is not pinned to a checksum yet, so reproducibility depends on the service; this is an open point in [deployment.md](../deployment.md).
- **Dependency on Let's Encrypt and Cloudflare APIs** for the first certificate and its renewals. Caddy renews automatically.
- If the operator later wants access from outside the home, the preferred route is Tailscale, not a public tunnel; a change to that effect needs its own ADR.
