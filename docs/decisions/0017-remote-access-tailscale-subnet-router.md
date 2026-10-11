# ADR-0017: Remote access through Tailscale, with the host as a subnet router

Status: accepted (October 2026). Builds on [ADR-0015](0015-https-caddy-cloudflare-dns.md), which chose Tailscale as the preferred route for access from outside the home network.

## Context
The web app is served from a Debian LXC on the home network, over HTTPS with a certificate issued for a public domain whose DNS record points to the host's **private** address ([ADR-0015](0015-https-caddy-cloudflare-dns.md)). Nothing is exposed to the internet, so the site is reachable only from inside the home network.

The maintainer wants to open the app from outside the home (for example, from a phone on mobile data) without opening a port on the router and without a public tunnel. The app's privacy model is unchanged: the server only delivers static files, and health data stays in the browser ([privacy-and-security.md](../privacy-and-security.md)).

Constraints that shaped the choice:
- The public name must keep working in the browser, so the certificate and the name must stay the same. A device outside the home has to reach the **private** address of the host.
- The maintainer already runs Tailscale on several machines. One of them is already an online subnet router for the home subnet and also offers an exit node. This was discovered during the work, not planned.
- The LXC is unprivileged, so Tailscale needs the TUN device passed through from Proxmox ([deployment.md](../deployment.md#1-give-the-container-access-to-the-tun-device)).

Options considered:
- **Cloudflare Tunnel or port forwarding**: rejected by [ADR-0015](0015-https-caddy-cloudflare-dns.md). Makes the service reachable from the internet.
- **`tailscale serve` on the LXC**: gives a tailnet name with its own certificate. It would be a second address with a second certificate, so the installed app and the offline cache would be tied to a different origin. Rejected.
- **Tailscale on every client with split DNS only**: works only if the client can reach the private address, which requires routing anyway. Not enough on its own.
- **Subnet router on the LXC**: the host advertises the home subnet to the tailnet. Clients reach the private address of the host and the public name resolves unchanged. Chosen.
- **Self-hosted WireGuard or OpenVPN**: same routing result, but the maintainer would operate key distribution, NAT and renewal by hand. Tailscale already does this.

## Decision
- The LXC runs Tailscale as a **subnet router** for the home subnet. Setup is in [deployment.md](../deployment.md#remote-access-with-tailscale-optional).
- IP forwarding (IPv4 and IPv6) is enabled persistently in `/etc/sysctl.d/99-tailscale.conf`.
- The subnet is advertised by the LXC with `tailscale set --advertise-routes=<LAN subnet>`. The route is active only after manual approval in the Tailscale admin console.
- **Redundancy:** when two subnet routers advertise the same subnet, Tailscale uses one as primary and keeps the other as standby. On 2026-10-11 the maintainer chose the existing router as primary and the host is not an approved router. The LXC keeps the advertisement configured, so it can be approved again later as standby. Verified with `tailscale status --json` (`PrimaryRoutes`).
- Access is limited by the tailnet's access rules (ACLs) and by the authentication of the identity provider. The site itself has no login.

## Consequences
- **The whole home subnet becomes reachable to every tailnet device allowed by the ACLs, not just the app.** This is the most important consequence. A subnet router exposes every host on the advertised subnet, so the ACLs must allow only the devices that need the site, and the identity provider should use two-factor authentication. The default tailnet policy (all devices reach each other) must be restricted before sharing the tailnet with anyone else.
- **Dependency on Tailscale and on the router.** If the primary router is offline, Tailscale fails over only if a standby is approved. With only one approved router, remote access stops when that node is offline. The LXC is kept configured for this reason.
- **Route approval is manual** unless an auto-approver is configured. A change of the advertised routes is a change in the admin console, not only on the host.
- **Client configuration:** Linux clients must accept routes with `tailscale set --accept-routes`. This is a per-device setting and is not automatic.
- **Trust in a third party.** Tailscale's coordination server sees node metadata (names, addresses, times of connection), not the content of the traffic, which is end-to-end encrypted between nodes. Health data does not pass through the coordination server. This is the documented design of Tailscale; the claim is *unverified* against its current security documentation and should be checked when the account is set up.
- **The host's private address is reachable from the tailnet**, which is what makes the public name work outside the home. Nothing is opened on the internet.

## Open points
- Whether to approve the LXC as a standby router (redundancy) once the maintainer decides.
- The ACL policy for the tailnet is not written down yet; it should be documented in [privacy-and-security.md](../privacy-and-security.md) once it is fixed.
- Whether the other router's exit-node role affects the site's traffic: not checked.
- Testing from a device outside the home network has not been recorded yet.
