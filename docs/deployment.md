# Deployment

OpenCPAP is a static web app. Serving it means serving files: there is no database, no API and no server-side processing, so any static web server works. This guide describes the setup used by the maintainer: a Debian LXC on Proxmox, reachable only on the home network over HTTPS with a certificate from Let's Encrypt, updated from a development machine over SSH. The decisions and their alternatives are in [ADR-0014](decisions/0014-static-hosting-with-nginx.md) (static files, built on the workstation, published with rsync) and [ADR-0015](decisions/0015-https-caddy-cloudflare-dns.md) (HTTPS with Caddy and a Cloudflare DNS challenge).

**Privacy note.** The server only sends the application files. SD card data is read and stored in the visitor's browser and never reaches the server. Keep it that way: any change that uploads health data requires a new decision ([privacy-and-security.md](privacy-and-security.md)).

## What is in the repository

| File | Runs on | Purpose |
|---|---|---|
| [`deploy/provision.sh`](../deploy/provision.sh) | your machine (over SSH) | Installs Caddy with the Cloudflare DNS plugin, the Caddyfile and the systemd service on the host. Idempotent. |
| [`deploy/Caddyfile.template`](../deploy/Caddyfile.template) | copied to the host (domain filled in) | The site: HTTPS through the Cloudflare DNS challenge, SPA fallback, gzip, no-cache for `sw.js`, HSTS. |
| [`deploy/caddy.service`](../deploy/caddy.service) | copied to the host | systemd unit; reads the Cloudflare token from `/etc/caddy/cloudflare.env`. |
| [`deploy/deploy.sh`](../deploy/deploy.sh) | your machine (over SSH) | Builds `apps/web`, syncs `apps/web/dist` to the web root, checks the site over HTTPS from the host. |

The web root is `/var/www/opencpap` in both scripts. If you change it, change it in `deploy.sh`, `provision.sh` and `Caddyfile.template`.

## Requirements

On the **development machine**:
- Node.js 20+ and npm (the same as for development, see [development.md](development.md)).
- `ssh`, `scp` and `rsync`.
- An SSH key that the target host accepts (see below).

On the **target host**:
- Debian 12 or 13 (tested on Debian 13 "trixie" in a Proxmox LXC).
- Outbound internet access (to download Caddy and to reach the Let's Encrypt and Cloudflare APIs).
- Inbound access from your network on port 22 (SSH), port 80 (redirect to HTTPS) and port 443 (HTTPS). **Nothing needs to be reachable from the internet.**
- Node.js is not needed on the host.

Also needed:
- A domain managed by Cloudflare DNS (the examples below use `opencpap.aptimait.com`, and `cpap.example.com` where the name is a placeholder).
- A Cloudflare API token that can edit the DNS of that zone.

## 1. Create the container

In Proxmox, create an unprivileged LXC from a Debian template:

- 1 vCPU, 512 MB to 1 GB RAM, 4 GB disk is enough (the app is about 4 MB).
- A fixed IP on the local network, or a DHCP reservation.
- Set a root password when you create it; you need it once for the first key installation.

## 2. Allow SSH key login

OpenSSH is not always installed in Debian templates. Inside the container (Proxmox console, or `pct enter <VMID>` from the Proxmox host):

```bash
apt update && apt install -y openssh-server
systemctl enable --now ssh
```

Debian's default `PermitRootLogin prohibit-password` allows key login for root and rejects passwords. From your machine, install your public key:

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@192.168.1.50
```

Replace `192.168.1.50` with the container's address. The first connection asks you to confirm the host key. Check that the fingerprint matches the one on the host, inside the container:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Then check that login works without a password:

```bash
ssh -o BatchMode=yes root@192.168.1.50 hostname
```

If `ssh-copy-id` fails, the public key can be added by hand: put its line in `/root/.ssh/authorized_keys` on the container, with `chmod 700 /root/.ssh` and `chmod 600 /root/.ssh/authorized_keys`.

## 3. Create a Cloudflare API token

In the Cloudflare dashboard: **My Profile → API Tokens → Create Token → Create Custom Token**.

- Permissions: **Zone → DNS → Edit**.
- Zone resources: **Include → Specific zone → your domain** (only that zone).

Copy the token once. Do not paste it into chats, commits, issues or shell history.

## 4. Create the DNS record

In Cloudflare, for your domain, add an **A** record:

- Name: `cpap` (gives `cpap.example.com`).
- IPv4 address: the container's LAN address, for example `192.168.1.50`.
- Proxy status: **DNS only** (grey cloud). The proxy must stay off, because the address is private.

The record is public, but it points to a private address, so nothing outside your network can reach the service. Certificate Transparency logs will show the subdomain name (not the address) when the certificate is issued.

## 5. Store the token on the host

On the container (Proxmox console or `pct enter`), create the file with the token. Use an editor so the token is not in your shell history:

```bash
mkdir -p /etc/caddy
(umask 077; echo 'CF_API_TOKEN=' > /etc/caddy/cloudflare.env)
nano /etc/caddy/cloudflare.env   # add the token after the '=' and save
chmod 600 /etc/caddy/cloudflare.env
```

The file must contain `CF_API_TOKEN=` followed by the token, with no spaces or quotes. `provision.sh` refuses to run without it.

## 6. Provision the host (once)

From the repository root:

```bash
deploy/provision.sh root@192.168.1.50 cpap.example.com
```

The script:
1. Checks the SSH connection and that the token file exists.
2. Installs `rsync`, `curl` and CA certificates, and creates `/var/www/opencpap`.
3. Downloads Caddy with the `caddy-dns/cloudflare` plugin from the official build service, unless it is already installed.
4. Stops and disables nginx if it was installed earlier.
5. Writes `/etc/caddy/Caddyfile` with your domain, validates it, and installs and starts the `caddy` service.

It can be run again at any time. The first start can take a few seconds while Caddy obtains the certificate; check it with `journalctl -u caddy -n 50` if the site does not answer.

## 7. Deploy

```bash
deploy/deploy.sh root@192.168.1.50 cpap.example.com
```

The script:
1. Builds the web app (`npm run build -w @opencpap/web`), unless `SKIP_BUILD=1` is set.
2. Syncs `apps/web/dist/` to the web root with `rsync --delete`. The remote directory is replaced by the new build, so old hashed assets are removed.
3. Requests `/`, `/manifest.webmanifest` and `/sw.js` over HTTPS from inside the host (`curl --resolve`, so the certificate for the domain is used) and prints the HTTP status and content type.

Then open `https://cpap.example.com/` in a browser on your network. The certificate is valid, so the browser shows no warning, and the app can be installed and used offline.

To publish a build that is already in `apps/web/dist` without rebuilding:

```bash
SKIP_BUILD=1 deploy/deploy.sh root@192.168.1.50 cpap.example.com
```

## Caddy configuration

- **HTTPS by DNS challenge**: Let's Encrypt checks the domain by a TXT record that Caddy creates through the Cloudflare API. The host does not need to be reachable from the internet, and it does not need port 443 open to the internet.
- **HTTP to HTTPS**: Caddy redirects port 80 to 443 automatically.
- **SPA fallback**: `try_files {path} /index.html`. The app uses hash routes (`#/night/…`), so this only matters for direct paths.
- **No-cache for `sw.js`**: the service worker is revalidated on every visit, so a new deploy reaches users without a manual cache clear.
- **HSTS** (`max-age=31536000`): browsers only use HTTPS for the domain once they have seen the header.
- **gzip** for text assets.
- The manifest is served as `application/manifest+json` by Caddy; `deploy.sh` checks this.

## Updating

```bash
git pull
deploy/deploy.sh root@192.168.1.50 cpap.example.com
```

Nothing is restarted: Caddy serves the new files directly. Re-run `provision.sh` only when the Caddyfile template, the service or the Caddy version changes.

## Troubleshooting

| Symptom | Check |
|---|---|
| `missing /etc/caddy/cloudflare.env` | Create the file as in step 5, then run `provision.sh` again. |
| `Could not resolve hostname` | You passed the placeholder text, not the real address. |
| `Permission denied` or `Host key verification failed` | Run `ssh root@HOST` once interactively to accept the host key, then re-run `ssh-copy-id`. Check that `ssh -o BatchMode=yes root@HOST true` succeeds. |
| Certificate not issued | `journalctl -u caddy -n 100`. Usual causes: the token lacks *Zone → DNS → Edit* for the zone, the domain is not in the Cloudflare account, or the token has a typo. |
| `caddy validate` fails | Run `/usr/bin/caddy validate --config /etc/caddy/Caddyfile` on the host and read the error. |
| Site returns 404 for `/` | The web root is empty: run `deploy/deploy.sh`. Check `ls /var/www/opencpap` on the host. |
| Browser shows a certificate warning | The DNS record must be the one you use, and the certificate must have been issued. Check `journalctl -u caddy`. |
| Changes do not appear in the browser | Hard-reload (Ctrl+Shift+R). If the app was installed as a PWA, close and reopen it so the new service worker takes over. |

## Limits and open points

- No backups or rollbacks: each deploy replaces the web root. To roll back, check out the earlier commit and deploy again.
- The Cloudflare token is stored on the host in plain text, readable only by root. Give it the narrowest permission (DNS edit on one zone) and rotate it if the host is compromised.
- Caddy runs as root with `CAP_NET_BIND_SERVICE` in the unit; it is not sandboxed further. Acceptable for a single-purpose LXC on a home network.
- The scripts assume Debian with `apt`, `systemd` and an `amd64` host. Other architectures need the download URL in `provision.sh` changed.
- Access logs are Caddy's default (requests for files, not imported content).
- Tested by the maintainer on one Proxmox LXC (Debian 13). The scripts have not been run on other hosts.
- The download of Caddy with the plugin comes from `caddyserver.com`. It is not pinned to a checksum; pin a version if you need reproducibility.
