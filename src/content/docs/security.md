# Security

Castellan controls the Docker socket and can restart any container it manages. **Treat it as highly privileged infrastructure** — never expose it on the public internet.

## Access and API auth

**Castellan is not user login.** No passwords, no per-user accounts, no secret pasted into the dashboard UI.

| Layer | What it controls | How |
|---|---|---|
| **Network access** | Who can open the dashboard at all | VPN / Tailscale / internal DNS / not publishing port 3003 publicly |
| **API secret** | Who can call `POST /v1/*` | A single shared key — not per-user identity |

### Dashboard (browser)

1. Open Castellan over your private network (e.g. `http://castellan.internal.example:8443/` on VPN).
2. Castellan serves the page and sets an **httpOnly session cookie** with the API secret.
3. The dashboard's fetch calls send that cookie automatically.

### CLI and API clients

The **[Castellan CLI](./cli.md)** reads `CASTELLAN_URL` and `CASTELLAN_AUTH_TOKEN`. Same secret the dashboard's session cookie carries.

### Where the API secret comes from

1. **`CASTELLAN_AUTH_TOKEN` env var**
2. **`auth-token` file in the state directory**
3. **Auto-generated on first start** — written to `<state-dir>/auth-token` if nothing else is set.

**Production:** set a stable `CASTELLAN_AUTH_TOKEN` (or inject via your secrets manager) so restarts do not rotate the key.

```yaml
environment:
  CASTELLAN_AUTH_TOKEN: long-random-secret-from-secrets-manager
```

## Keep it internal (recommended)

1. **Do not publish port 3003** to your public NIC.
2. **Reverse-proxy through an internal edge** (Caddy, nginx, Traefik) on your VPN interface.
3. **Use private DNS** — e.g. `http://castellan.internal.example:8443/` resolves only on your private network.

```text title="Caddyfile"
{
    auto_https off
}

http://castellan.internal.example:8443 {
    bind {$TAILSCALE_IP}
    reverse_proxy 127.0.0.1:3003
}
```

## Other hardening

- Castellan needs a **read-write** Docker socket. Never expose that socket or Castellan's port on the public internet.
- Run Castellan on an isolated Docker network.
- Rotate the API secret if leaked — update `CASTELLAN_AUTH_TOKEN` or delete `<state-dir>/auth-token` and restart.

Headless mode (`CASTELLAN_API_ENABLED=false`) skips HTTP entirely — check state via Docker logs and the on-disk state file.
