<div align="center">
  <picture>
    <source srcset="assets/castellan-lockup-light.svg" media="(prefers-color-scheme: light)" />
    <source srcset="assets/castellan-lockup-dark.svg" media="(prefers-color-scheme: dark)" />
    <img src="assets/castellan-lockup-dark.svg" alt="Castellan" />
  </picture>

  <p><strong>Lightweight deployment control &amp; monitoring for docker-compose</strong></p>

  <p>
    <img src="https://img.shields.io/badge/SemVer-2.0.0-blue" alt="SemVer" />
    <img src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg" alt="Conventional Commits" />
    <a href="https://github.com/mhweiner/autorel"><img src="https://img.shields.io/badge/%F0%9F%9A%80%20AutoRel-2D4DDE" alt="AutoRel" /></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
    <img src="https://img.shields.io/badge/status-beta-orange.svg" alt="Beta" />
  </p>

  <p>
    Polls your registry, rolls out updates safely, verifies health, rolls back on failure — with an optional built-in dashboard, API, or fully headless operation.
  </p>

  <p>
    <img src="assets/screenshot.png" alt="Castellan dashboard" width="100%" />
  </p>
</div>

> **Beta.** APIs and config may change before v1.0. Test in staging before trusting it in production.

# What is Castellan?

Castellan is a **lightweight, single-container sidecar** that sits beside your docker-compose stack. It:

1. **Polls** a configured registry **tag** (e.g. `staging`, `latest`, `v1.2.3`) and compares the **digest** behind it.
2. **Deploys** when the digest changes — CI pushed a new build to the same tag — via `docker compose` rolling restarts.
3. **Verifies** health with HTTP checks and Docker health status before continuing.
4. **Rolls back** automatically if a new digest fails — reverting to the last known-good image.
5. **Observes** deployments from an optional built-in dashboard (status, history, container metrics, logs) — or run **headless** with polling and rollouts only.

One image. No database. Config file in JSON/YAML. Dashboard and API are optional — disable either or both via `api.enabled` / `api.dashboard`.

See [Tags and versions](#tags-and-versions) for how image tags work — that is the core mental model.

# Why Castellan?

- **Compose-native rollouts** — restarts grouped services one at a time via `docker compose pull/up`, not blind container recreation.
- **Automatic rollback** — failed health checks trigger revert to the last known-good digest; bad digests are remembered.
- **Built-in observability (optional)** — dashboard with service status, deployment history, container CPU/memory/disk, and logs; or run headless / API-only (see [Operating modes](#operating-modes)).
- **Multi-registry support** — Amazon ECR, Docker Hub, GitHub Container Registry (GHCR), and any OCI Distribution v2 registry.
- **Digest polling** — tunable intervals, jitter, and caching to stay within registry rate limits.
- **Lightweight** — one sidecar container, file-based state, no PostgreSQL or multi-service stack.
- **Watchtower label compat** — optional; reads `com.centurylinklabs.watchtower.enable=true` for drop-in migration.

See [docs/comparisons.md](docs/comparisons.md) for detailed comparisons with WatchWarden and other alternatives.

# Features

## Deployment safety

- **Registry polling** with tunable intervals, jitter, and caching.
- **Digest-based change detection** — only restarts when the image digest actually changes, eliminating false pulls.
- **Zero-downtime rolling restarts** for grouped compose services (`api-1`, `api-2`, etc.).
- **Automatic rollback** on health-check failure with a persisted known-good digest and a bad-digest list.
- **Manual controls** — check now, pause/resume polling, or trigger a rollback from the UI or API.

## Observability hub

Optional — requires `api.enabled: true` and `api.dashboard: true` (see [Operating modes](#operating-modes)).

- **Self-hosted React dashboard** — live status, controls, and Docker inspection in one dark, fast UI.
- **Service status cards** — watched tag and `repository:tag` at a glance; full digests in expandable details.
- **Container metrics table** — every container with live CPU, memory (usage + %), disk (writable layer size), state, and one-click log viewing.
- **Deployment history timeline** — check, deploy, rollback, and failure events with timestamps.
- **Health status** — green/yellow/red state badges and detailed HTTP/Docker health verification.
- **Mobile responsive** — check deployments, logs, and container status from your phone without pinching or zooming.

## Integration & compatibility

- **Flexible operating modes** — full stack (dashboard + API), API-only (`api.dashboard: false`), or fully headless (`api.enabled: false`); see [Operating modes](#operating-modes).
- **Internal HTTP API** — typed RPC for dashboard, CLI, or automation (when `api.enabled` is `true`).
- **Watchtower compatibility mode** — optional label-based discovery for migration; config file recommended for full features.
- **Supported registries** — Amazon ECR, Docker Hub, GHCR, and other OCI Distribution v2 hosts (see [Supported registries](#supported-registries)).
- **API secret auth** — shared API key for scripts/CLI; dashboard auth is automatic (see [Access & API auth](#access--api-auth)).
- **YAML and JSON config** — use whichever format you prefer.
- **Lightweight sidecar** — TypeScript, MIT licensed, published to [GHCR](https://github.com/logfoxai/castellan/pkgs/container/castellan); dashboard and API ship in the same image but can be turned off independently.

# Operating modes

Castellan always runs registry polling and compose rollouts. HTTP is optional — turn off the **dashboard**, the **API**, or **both**:

| Mode | Config | HTTP | Use when |
|---|---|---|---|
| **Full** (default) | `api.enabled: true`, `api.dashboard: true` | Dashboard at `/` + RPC on `/v1` | Day-to-day ops with browser UI and automation |
| **API-only** | `api.enabled: true`, `api.dashboard: false` | RPC on `/v1` only | Scripts, curl, or future CLI — no browser UI |
| **Headless** | `api.enabled: false` | None | Compliance / zero HTTP surface; polling and rollouts only |

`api.dashboard` is ignored when `api.enabled` is `false`. In headless mode no port is bound, no auth token is generated, and state is still persisted to disk.

Examples:

```json
{ "api": { "enabled": false } }
```

```json
{ "api": { "enabled": true, "dashboard": false, "authToken": "your-secret" } }
```

See [Headless & API-only setup](#headless--api-only-setup) for details.

# Supported registries

Castellan polls image digests from these registries today:

| Registry | Config `registry` value | Authentication |
|---|---|---|
| **Amazon ECR** | `{account}.dkr.ecr.{region}.amazonaws.com` | AWS credential chain (IAM role, env vars) |
| **Docker Hub** | `docker.io` | Public images work without credentials; add `registries` for private repos |
| **GitHub Container Registry** | `ghcr.io` | Public images work without credentials; PAT in `registries` for private repos |
| **Other OCI Distribution v2** | any host | Standard Bearer token flow; optional `registries` credentials |

Need another registry? [Open a PR](https://github.com/logfoxai/castellan/pulls) — most v2-compatible hosts work via the HTTP backend; dedicated backends are welcome for edge cases.

# Quick start

Castellan runs as a Docker sidecar — pull `ghcr.io/logfoxai/castellan:latest` (or a release tag from GitHub). There is no npm package; the container is the distribution.

Add Castellan to your `docker-compose.yml`:

```yaml
services:
  castellan:
    image: ghcr.io/logfoxai/castellan:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./castellan-config.json:/app/config.json:ro
      - ./castellan-state:/app/state
    environment:
      - AWS_REGION=us-east-2  # only needed for ECR-hosted images
    networks:
      - backend

  # your app services here
```

Create `castellan-config.json` (or `castellan-config.yaml`):

```json
{
  "managedServices": [
    {
      "name": "api",
      "registry": "ghcr.io",
      "repository": "myorg/api-service",
      "tag": "latest",
      "composeServices": ["api-1", "api-2"],
      "healthUrl": "http://{{service}}:3000/health",
      "healthIntervalMs": 5000,
      "healthRetries": 10
    },
    {
      "name": "worker",
      "registry": "docker.io",
      "repository": "myorg/worker",
      "tag": "latest",
      "composeServices": ["worker"],
      "healthIntervalMs": 5000,
      "healthRetries": 10
    }
  ],
  "registries": {
    "ghcr.io": {
      "username": "my-github-username",
      "password": "ghp_your_token"
    }
  },
  "poll": {
    "enabled": true,
    "intervalMs": 60000,
    "jitterMs": 5000
  }
}
```

Public images on Docker Hub and GHCR do not need the `registries` block. Use it for private repositories or when your registry requires authenticated token exchange.

Mount a **state volume** (as above). On first start, if you omit `api.authToken`, Castellan writes a random API secret to `./castellan-state/auth-token` — use that for curl/scripts; the dashboard still needs no login. (Skipped in **headless** mode when `api.enabled` is `false`.)

Open the dashboard at `http://castellan:3003/` (or map a port to your host). To run without the UI or without any HTTP listener, see [Operating modes](#operating-modes).

# Tags and versions

Castellan does **not** watch arbitrary tags on running containers. Each managed service has a **`tag` in config** — the registry tag Castellan polls. Deployments trigger when the **digest behind that tag changes**, not when the tag string changes.

### How it works

| Concept | Meaning |
|---|---|
| **`tag` in config** | The registry tag to watch — e.g. `staging`, `production`, `latest`, `v1.2.3` |
| **Digest** | The immutable `sha256:…` content hash of the image currently at that tag |
| **Deploy trigger** | Registry tag points at a new digest (usually CI pushed a fresh build to the same tag) |

The dashboard shows **`repository:tag`** prominently (e.g. `api-service:staging`). Expand **Image details** for the full registry path and digests.

### CI and rolling tags

Many teams publish **environment tags** from CI — e.g. push `myorg/api-service:staging` on every merge to main. Castellan watches that tag and redeploys when the digest changes:

```json
{
  "name": "api",
  "registry": "ghcr.io",
  "repository": "myorg/api-service",
  "tag": "staging",
  "composeServices": ["api-1", "api-2"]
}
```

To deploy immediately after CI pushes, call **`forceCheck`** on the RPC API instead of waiting for the next poll:

```yaml
- run: |
    curl -sf -X POST "$CASTELLAN_URL/v1" \
      -H "Authorization: Bearer $CASTELLAN_AUTH_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"method":"forceCheck"}'
```

Set `poll.enabled: false` if you only want CI-triggered deploys.

### Choosing tags

- **Environment tags** (`staging`, `production`) — one rolling tag per environment; CI retags on each deploy.
- **Version tags** (`v1.2.3`) — pin a host to a release; change the config tag to promote.
- **`latest`** — fine for dev; avoid in production unless you accept surprise updates.

Each `managedServices` entry watches **one tag**. To track multiple tags for the same repository, add separate entries with different `name` values.

# Migrating from Watchtower

Castellan can read the same `com.centurylinklabs.watchtower.enable=true` labels Watchtower used. Swap the sidecar and Castellan discovers labeled containers automatically.

For **rolling restarts, health verification, and rollback** — the features that make Castellan more than Watchtower — add a config file. Label-only mode works for basic auto-updates but skips the safety layer.

Remove your Watchtower service and add Castellan. No config file needed for basic label-based updates:

```yaml
services:
  castellan:
    image: ghcr.io/logfoxai/castellan:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./castellan-state:/app/state
    networks:
      - backend

  my-service:
    image: my-image:latest
    labels:
      - com.centurylinklabs.watchtower.enable=true
```

Castellan discovers every container carrying the Watchtower label and manages it — same starting point as Watchtower, plus optional health verification and rollback when configured.

For grouped services (e.g. multiple API replicas that need zero-downtime rolling restarts), add a config file — see [Configuration reference](#configuration-reference).

# Configuration reference

```json
{
  "managedServices": [
    {
      "name": "<service-name>",
      "registry": "<registry host>",
      "repository": "<repo name>",
      "tag": "<rolling tag>",
      "composeServices": ["<compose service 1>", "<compose service 2>"],
      "healthUrl": "http://{{service}}:3000/health",
      "healthIntervalMs": 5000,
      "healthRetries": 10
    }
  ],
  "compose": {
    "file": "/app/docker-compose.yml",
    "project": "myapp",
    "envFile": "/app/.env"
  },
  "poll": {
    "enabled": true,
    "intervalMs": 60000,
    "jitterMs": 5000
  },
  "rollback": {
    "healthTimeoutMs": 120000,
    "maxAttempts": 1
  },
  "api": {
    "port": 3003
  }
```

`api` options:

| Key | Default | Description |
|---|---|---|
| `enabled` | `true` | When `false`, Castellan runs **headless** — polling and rollouts only, no HTTP server, no auth token generated. See [Operating modes](#operating-modes). |
| `dashboard` | `true` | When `false`, the RPC API on `/v1` still runs but the web UI at `/` is not served. Ignored when `enabled` is `false`. |
| `port` | `3003` | HTTP listen port when `enabled` is `true`. |
| `authToken` | *(auto)* | Optional API secret — see [Access & API auth](#access--api-auth). |

`api.authToken` is optional — see [Access & API auth](#access--api-auth). If omitted, Castellan generates a secret on first start and saves it under your state directory (`auth-token`). Not used when `api.enabled` is `false`.

`poll` options:

| Key | Default | Description |
|---|---|---|
| `enabled` | `true` | When `false` (or `intervalMs` is `0`), periodic polling is off — use API **`forceCheck`** for deploys. |
| `intervalMs` | `60000` | Milliseconds between registry checks when `enabled` is true. |
| `jitterMs` | `5000` | Random extra delay per tick to avoid synchronized polls. |

Each `managedServices` entry:

| Field | Description |
|---|---|
| `name` | Short id for dashboard/API (e.g. `api`, `worker`) |
| `registry` | Registry host (ECR, `ghcr.io`, `docker.io`, …) |
| `repository` | Image name without tag (e.g. `api-service`) |
| `tag` | Registry tag to poll — see [Tags and versions](#tags-and-versions) |
| `composeServices` | Compose service names to restart, in order, when the digest changes |

- `healthUrl` may use `{{service}}` as a placeholder for the current compose service name.
- `composeServices` is a list; when more than one is present, Castellan restarts them one at a time, waiting for health before proceeding.
- `registries` is optional. Map registry hostnames to username/password credentials for private Docker Hub, GHCR, or other HTTP v2 registries. ECR uses the AWS credential chain instead.
- YAML configs are supported — just use `config.yaml` or `config.yml` instead of `config.json`.

# API

When `api.enabled` is `true` (the default), Castellan exposes an internal HTTP API on port `3003`:

- `GET /v1/health` — liveness (no auth).
- `POST /v1` — typed RPC (requires API auth when enabled):
  - `status()` — service states and known-good digests.
  - `forceCheck()` — check registries immediately.
  - `pause()` / `resume()` — pause/resume polling.
  - `rollback({ service })` — manually rollback a service.
  - `history()` — recent events.
  - `dockerContainers()`, `dockerImages()`, `dockerNetworks()`, `dockerVolumes()` — Docker inspection.
  - `dockerLogs({ containerId, tail })`, `dockerStats({ containerId })`, `dockerInfo()`, `dockerEvents({ since })` — logs and stats.

See [Access & API auth](#access--api-auth) for how authentication works.

For **headless** (`api.enabled: false`) or **API-only** (`api.dashboard: false`) deployments, see [Operating modes](#operating-modes).

# Dashboard

Optional — served at `/` when `api.enabled` and `api.dashboard` are both `true` (the default). When disabled, use the RPC API, Docker logs, or the on-disk state file instead.

When enabled, it gives you:

- Live service status with watched **tag** and `repository:tag`; digests in expandable details.
- **Check now** and **Pause/Resume polling** controls.
- Docker container table with live CPU, memory, disk usage, state, and one-click log viewing.
- Deployment / rollback / failure history timeline.
- **No login screen** — open the URL and it works (see [Access & API auth](#access--api-auth)).
- Fully responsive — works on phones, tablets, and desktops.
- Light and dark mode with system preference detection.

# How it works

1. Castellan loads your config (or discovers Watchtower-labeled containers).
2. On every poll interval it fetches the manifest for each configured image, respecting per-image TTL and global jitter.
3. When a digest changes, it pulls the image, tags it, and performs a rolling restart of the associated compose services.
4. It waits for Docker and/or HTTP health checks to pass.
5. If health checks fail, it rolls back to the last known-good digest and marks the failing digest as bad.
6. State is persisted atomically to a JSON file so restarts are safe.

HTTP (dashboard and/or API) is optional — set `api.enabled: false` for headless operation or `api.dashboard: false` for API-only. See [Operating modes](#operating-modes).

# Roadmap

Castellan is beta — these are planned next, informed by what heavier alternatives like WatchWarden already ship:

- **Notifications** — Slack/webhook on deploy, rollback, or failure.
- **Prometheus metrics** — poll latency, deploy outcomes, health results.
- **CLI companion** — `castellan status`, `castellan check`, `castellan rollback <service>`.
- **Minimum update age** — hold a new digest for N minutes before deploying.
- **Crash-loop detection** — rollback when a container restart-loops after update.
- **Image diff preview** — show env/port changes before restart.
- **Multi-host support** — manage several compose hosts from one place (maybe; today Castellan is single-host by design).

Have an idea? Open an issue or discussion.

# Security

Castellan controls the Docker socket and can restart any container it manages. **Treat it as highly privileged infrastructure** — never expose it on the public internet.

## Access & API auth

**Castellan is not user login.** There is no Clerk, no passwords, and no per-user accounts. You do not type a secret into the dashboard.

Instead, two layers work together:

| Layer | What it controls | How |
|---|---|---|
| **Network access** | Who can open the dashboard at all | VPN / Tailscale / internal DNS / not publishing port 3003 publicly |
| **API secret** | Who can call `POST /v1` (including the dashboard’s background requests) | A single shared key — not per-user identity |

### Dashboard (browser)

1. You open Castellan over your private network (e.g. `http://castellan.internal.example:8443/` on VPN).
2. Castellan serves the page and sets an **httpOnly session cookie** containing the API secret.
3. The dashboard’s fetch calls send that cookie automatically.

No login form. No token pasted in the UI. If someone cannot reach the URL on your network, they never see the dashboard.

### curl, scripts, and future CLI

These clients do not get the cookie. Send the shared secret as a header:

```bash
curl -sS -X POST http://127.0.0.1:3003/v1 \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_SECRET' \
  -d '{"method":"status"}'
```

### Where the API secret comes from

Castellan picks a secret in this order:

1. **`api.authToken` in config** — you set it explicitly (recommended for production).
2. **`CASTELLAN_AUTH_TOKEN` env var** — override without editing config.
3. **`auth-token` file in the state directory** — persisted from a previous run.
4. **Auto-generated on first start** — if none of the above exist, Castellan creates a random secret, writes it to `<state-dir>/auth-token`, and logs the file path once.

**Quick start / docker-compose:** mount a state volume (as in the example below). On first boot Castellan generates `auth-token` there — you only need that file if you want to call the API from curl or automation.

**Production:** set a stable `api.authToken` in config (or inject via your secrets manager) so restarts do not rotate the key unexpectedly.

```json
{
  "api": {
    "port": 3003,
    "authToken": "long-random-secret-from-secrets-manager"
  }
}
```

Rotate the secret by updating config (or the `auth-token` file) and restarting Castellan.

### What this is not

- **Not Clerk / Auth0 / OAuth** — no sign-in, no SSO, no audit trail per human user.
- **Not a substitute for network security** — the API secret is defense in depth on top of VPN-only access, not a public login wall.

If you need per-user identity, put Clerk (or similar) in front of Castellan at your reverse proxy. Castellan itself stays a single shared-secret ops tool.

### Headless & API-only setup

Castellan supports three operating modes — see [Operating modes](#operating-modes) for the full table.

**Headless** — no HTTP at all (`api.enabled: false`):

```json
{
  "api": {
    "enabled": false
  }
}
```

Castellan continues polling registries and performing rollouts. No port is bound, no dashboard, no RPC, and no `auth-token` file is created. Check deployment state via Docker logs and the persisted state file on disk.

**API-only** — automation without the browser UI (`api.dashboard: false`):

```json
{
  "api": {
    "enabled": true,
    "dashboard": false,
    "authToken": "your-secret"
  }
}
```

The RPC API on `/v1` stays available for curl, scripts, and a future CLI; the React dashboard at `/` is not served.

## Keep it internal (recommended)

The primary gate is **network reachability**:

1. **Do not publish port 3003** to your public NIC. Bind Castellan to `127.0.0.1:3003` inside the host.
2. **Reverse-proxy through an internal edge** (Caddy, nginx, Traefik) that listens only on your VPN interface — e.g. Tailscale IP or `127.0.0.1`.
3. **Use private DNS** so the dashboard is reachable only when connected to your VPN — e.g. `http://castellan.internal.example:8443/` resolves to your compose host's Tailscale or private-network IP.

Example Caddy internal edge (binds to Tailscale IP, not the public NIC):

```caddyfile
{
    auto_https off
}

http://castellan.internal.example:8443 {
    bind {$TAILSCALE_IP}
    reverse_proxy 127.0.0.1:3003
}
```

Split DNS (Tailscale, CoreDNS, etc.) resolves internal hostnames to your compose host. Without VPN membership, the hostname does not resolve and the port is not reachable.

## Other hardening

- Mount the Docker socket read-only if your runtime supports it; Castellan only needs the API surface it uses.
- Run Castellan on an isolated Docker network; do not expose it alongside public-facing services without the internal edge pattern above.
- Rotate the API secret if it is ever leaked — update config or delete `<state-dir>/auth-token` and restart (a new one will be generated unless config provides a replacement).

# Built by the team behind [Logfox](https://logfox.ai)

We build observability and deployment tools we actually want to use. If you like Castellan, star the repo and tell your friends.

# More open-source tools from Logfox

Castellan is part of a family of MIT-licensed tools from [Logfox](https://logfox.ai). Same vibe: sharp CLIs, great TUIs, built for real ops work.


| Tool                                                         | What it does                                                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **[open-prs](https://github.com/logfoxai/open-prs)**         | Live TUI + CLI dashboard for every open PR in a GitHub org — CI status, deploy tracking, clickable links.                    |
| **[ecswatch](https://github.com/logfoxai/ecswatch)**         | ECS service watcher with CI streaming, interactive TUI, and one-shot `inspect` snapshots. Optional LLM root-cause analysis.  |
| **[composewatch](https://github.com/logfoxai/composewatch)** | Sibling of ecswatch for Docker Compose stacks over Tailscale SSH — watch Watchtower/Castellan rollouts, health, and digests. |
| **[runtyp](https://github.com/logfoxai/runtyp)**             | Lightning-fast, zero-dependency runtime type validation for TypeScript and JavaScript.                                       |


Most ship to npm; Castellan ships as a container image. All are released with [AutoRel](https://github.com/mhweiner/autorel).

# License

MIT — see [LICENSE](LICENSE).