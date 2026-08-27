# API

When `CASTELLAN_API_ENABLED=true` (the default), Castellan exposes an internal HTTP API on port `3003`. Prefer the [Castellan CLI](./cli.md) for CI and common ops; use the API when building custom tooling.

- `GET /v1/health` — liveness (no auth).
- `POST /v1/<method>` — typed RPC (requires API auth when enabled). Request body is the method input (use `{}` when there are no parameters):
  - `status` — service states and current digests.
  - `forceCheck` — check registries immediately.
  - `pause` / `resume` — pause/resume polling.
  - `deploy` — deploy a specific digest (`{"service":"api","digest":"sha256:…"}`).
  - `reject` — mark a digest rejected and roll back if it is running.
  - `setPollEnabled` — enable or disable automatic updates for one service.
  - `history` — recent events (all services).
  - `deployments` — per-service deployment history (`{"service":"api"}`).
  - `dockerContainers`, `dockerImages`, `dockerNetworks`, `dockerVolumes` — Docker inspection.
  - `dockerLogs`, `dockerStats`, `dockerInfo`, `dockerEvents` — logs and stats.

Example:

```bash
curl -sS -X POST "$CASTELLAN_URL/v1/status" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CASTELLAN_AUTH_TOKEN" \
  -d '{}'
```

See [Security](./security.md) for auth. For headless or API-only deployments, see [Operating modes](./operating-modes.md).
