# Operating modes

Castellan always runs registry polling and compose rollouts. HTTP is optional:

| Mode | Env | HTTP | Use when |
|---|---|---|---|
| **Full** (default) | `CASTELLAN_API_ENABLED=true`, `CASTELLAN_DASHBOARD_ENABLED=true` | Dashboard at `/` + RPC on `/v1` | Day-to-day ops with browser UI and automation |
| **API-only** | `CASTELLAN_API_ENABLED=true`, `CASTELLAN_DASHBOARD_ENABLED=false` | RPC on `/v1` only | [Castellan CLI](./cli.md) / custom scripts — no browser UI |
| **Headless** | `CASTELLAN_API_ENABLED=false` | None | Zero HTTP surface; polling and rollouts only |

`CASTELLAN_DASHBOARD_ENABLED` is ignored when `CASTELLAN_API_ENABLED=false`. In headless mode no port is bound, no auth token is generated, and state is still persisted to disk.

```yaml title="Headless"
environment:
  CASTELLAN_API_ENABLED: "false"
```

```yaml title="API-only"
environment:
  CASTELLAN_API_ENABLED: "true"
  CASTELLAN_DASHBOARD_ENABLED: "false"
  CASTELLAN_AUTH_TOKEN: your-secret
```

See [Security](./security.md) for headless and API-only hardening notes.
