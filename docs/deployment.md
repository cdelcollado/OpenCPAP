# Deployment

OpenCPAP is a static web app. Serving it means serving files: there is no database, no API and no server-side processing, so any static web server works. This guide describes the setup used by the maintainer: a Debian LXC on Proxmox, with nginx, updated from a development machine over SSH. The decision and its alternatives are in [ADR-0014](decisions/0014-static-hosting-with-nginx.md).

**Privacy note.** The server only sends the application files. SD card data is read and stored in the visitor's browser and never reaches the server. Keep it that way: any change that uploads health data requires a new decision ([privacy-and-security.md](privacy-and-security.md)).

## What is in the repository

| File | Runs on | Purpose |
|---|---|---|
| [`deploy/provision.sh`](../deploy/provision.sh) | your machine (over SSH) | Installs nginx and rsync on the host, installs the site configuration, enables it. Idempotent. |
| [`deploy/nginx-opencpap.conf`](../deploy/nginx-opencpap.conf) | copied to the host | The nginx site: web root, SPA fallback, gzip, MIME type for the manifest, no-cache for `sw.js`. |
| [`deploy/deploy.sh`](../deploy/deploy.sh) | your machine (over SSH) | Builds `apps/web`, syncs `apps/web/dist` to the web root, checks the site from the host. |

Both scripts use `/var/www/opencpap` as the web root. If you change it, change it in `deploy.sh`, `provision.sh` and the nginx configuration.

## Requirements

On the **development machine**:
- Node.js 20+ and npm (the same as for development, see [development.md](development.md)).
- `ssh`, `scp` and `rsync`.
- An SSH key that the target host accepts (see below).

On the **target host**:
- Debian 12 or 13 (tested on Debian 13 "trixie" in a Proxmox LXC, nginx 1.26).
- Network access from your machine on port 22 (SSH) and port 80 (HTTP).
- Nothing else: the scripts install nginx, rsync and curl. Node.js is not needed on the host.

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

## 3. Provision the host (once)

From the repository root:

```bash
deploy/provision.sh root@192.168.1.50
```

This installs nginx, rsync and curl, creates `/var/www/opencpap`, installs the site as `/etc/nginx/sites-available/opencpap`, enables it, removes the default site, validates the configuration and reloads nginx. It can be run again at any time.

## 4. Deploy

```bash
deploy/deploy.sh root@192.168.1.50
```

The script:
1. Builds the web app (`npm run build -w @opencpap/web`), unless `SKIP_BUILD=1` is set.
2. Syncs `apps/web/dist/` to the web root with `rsync --delete`. The remote directory is replaced by the new build, so old hashed assets are removed.
3. Requests `/`, `/manifest.webmanifest` and `/sw.js` from inside the host and prints the HTTP status and content type.

Then open `http://192.168.1.50/` in a browser on the local network.

To publish a build that is already in `apps/web/dist` without rebuilding:

```bash
SKIP_BUILD=1 deploy/deploy.sh root@192.168.1.50
```

## What the nginx configuration does

- **SPA fallback**: `try_files $uri $uri/ /index.html`. The app uses hash routes (`#/night/…`), so this only matters for direct paths.
- **Manifest MIME type**: `/manifest.webmanifest` is sent as `application/manifest+json`. This is set in its own `location`, because a server-wide `types {}` block would replace nginx's defaults and break `text/html`.
- **No-cache for `sw.js`**: the service worker is revalidated on every visit, so a new deploy reaches users without a manual cache clear.
- **gzip** for text assets.

## HTTPS and the service worker

The app is a PWA. Its service worker (offline use, "install as app") only registers in a **secure context**: HTTPS, or `localhost`. Over plain HTTP on the local network the app works normally, but it cannot be installed or used offline.

If you want HTTPS, the options are:
- **Reverse proxy** in front of the container, for example Caddy with a certificate from your own CA or a public domain. Point it to `http://192.168.1.50:80`.
- **Tailscale** (or another VPN) with `tailscale serve` or MagicDNS. Traffic stays inside your network and gets a valid HTTPS certificate.
- **Self-signed certificate** in nginx. Browsers warn about it, so only use it if you install the certificate on each device.

These are not configured by the scripts. Adding HTTPS to `deploy/nginx-opencpap.conf` is a reasonable next step; if you do it, update this document.

## Troubleshooting

| Symptom | Check |
|---|---|
| `Could not resolve hostname` | You passed the placeholder text, not the real address. |
| `Permission denied` or `Host key verification failed` | Run `ssh root@HOST` once interactively to accept the host key, then re-run `ssh-copy-id`. Check that `ssh -o BatchMode=yes root@HOST true` succeeds. |
| Site returns 404 for `/` | The web root is empty: run `deploy/deploy.sh`. Check `ls /var/www/opencpap` on the host. |
| `nginx -t` fails | Run `nginx -t` on the host and read the error; the configuration is in `/etc/nginx/sites-available/opencpap`. |
| Changes do not appear in the browser | Hard-reload (Ctrl+Shift+R). If the app was installed as a PWA, close and reopen it so the new service worker takes over. |

## Updating

```bash
git pull
deploy/deploy.sh root@192.168.1.50
```

Nothing is restarted: nginx serves the new files directly.

## Limits and open points

- No backups or rollbacks: each deploy replaces the web root. To roll back, check out the earlier commit and deploy again.
- The scripts assume Debian with `apt`, `systemd` and nginx. Other distributions need the package names and paths changed.
- `provision.sh` runs as root and writes to `/etc/nginx`. Use it only on hosts you control.
- Tested by the maintainer on one Proxmox LXC (Debian 13). The scripts have not been run on other hosts.
