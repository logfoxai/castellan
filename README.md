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

# Crash course

Castellan is a **single-container sidecar** for docker-compose. It watches container images in a registry, redeploys when something new is published, and optionally gives you a dashboard and HTTP API. No database — just a config file (optional) and a state directory.

## Watchtower compatible

Migrating from [Watchtower](https://containrrr.dev/watchtower/)? Castellan supports **opt-in label discovery** — the same model as Watchtower with `--label-enable`. Label the compose services you want updated; unlabeled containers are ignored. Use **`ai.logfox.castellan.autoupdate`** (recommended) or keep the legacy **`com.centurylinklabs.watchtower.enable=true`**. This is **not** Watchtower’s default “update every running container” mode. Details: [Label discovery](#label-discovery-watchtower-compatible).

## What it does

1. **Polls** a registry **tag** on an interval (or on demand via API).
2. Compares the tag’s current **digest** (`sha256:…`) to what is running.
3. **Deploys** when the digest changed — usually CI pushed a new build to the same tag — via `docker compose pull` / rolling restarts.
4. **Verifies** health (Docker healthchecks and/or HTTP URLs you configure).
5. **Rolls back** to the last known-good digest if a deploy fails.
6. **Observes** everything from an optional dashboard and RPC API — or run **headless** with no HTTP at all.

See [How it works](#how-it-works) for the runtime loop and [Tags and versions](#tags-and-versions) for the tag/digest model.

## Two ways to set it up

Castellan supports **config file** mode and **label discovery** mode. You pick one at startup — not both layered together.

| | **[Label discovery](#label-discovery-watchtower-compatible)** | **[Config file](#config-file-recommended)** |
|---|---|---|
| **Config file** | Not required | JSON or YAML (`config.json`, etc.) |
| **How services are chosen** | Containers with `ai.logfox.castellan.autoupdate` or legacy Watchtower `enable=true` | Explicit `managedServices` list |
| **Which tag is watched** | Parsed from each container’s **running** image (e.g. `:latest` → watches `latest`) | Tag you set in config (e.g. `staging`) |
| **Rolling restarts** | Auto-groups containers sharing the same image ref | Auto-discovers compose services from running containers |
| **HTTP health URLs** | Docker healthchecks only | `healthUrl` per service |
| **Private registry creds** | Not available without config | `registries` block |
| **Best for** | Watchtower opt-in migration | Production rollouts with safety features |

If no config file is found at the default paths, Castellan **automatically falls back** to label discovery. Mount a config file when you want the full feature set.

## Tags in one minute

Castellan watches **one tag per managed service** and redeploys when the **digest behind that tag** changes — not when you rename a tag string.

- **Config mode:** you choose the tag (`staging`, `production`, `v1.2.3`, …).
- **Label mode:** the tag is whatever is on the running image (`myorg/api:staging` → watches `staging`).

Typical CI flow: push `myorg/api-service:staging` on every merge; Castellan sees a new digest at `staging` and rolls out. Details: [Tags and versions](#tags-and-versions).

## HTTP surface

Castellan always runs polling and rollouts. HTTP is optional:

| Mode | Config | What you get |
|---|---|---|
| **Full** (default) | `api.enabled: true`, `api.dashboard: true` | Dashboard at `/` + RPC on `/v1` |
| **API-only** | `api.dashboard: false` | RPC on `/v1` only |
| **Headless** | `api.enabled: false` | No HTTP, no auth token |

Details: [Operating modes](#operating-modes).

## Registries

Amazon **ECR**, **Docker Hub**, **GHCR**, and other **OCI Distribution v2** hosts. Public images on Docker Hub and GHCR need no credentials; private repos use a `registries` block in config. Details: [Supported registries](#supported-registries).

## Try it

**Image:** `ghcr.io/logfoxai/castellan:latest` — [GHCR package](https://github.com/logfoxai/castellan/pkgs/container/castellan). No npm package.

**Label discovery** — Watchtower-style opt-in, no config file:

```yaml
services:
  castellan:
    image: ghcr.io/logfoxai/castellan:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./castellan-state:/app/state
    networks: [backend]

  my-service:
    image: myorg/my-service:staging
    labels:
      - ai.logfox.castellan.autoupdate
```

**Config file** — rolling restarts, health URLs, private registries:

```yaml
services:
  castellan:
    image: ghcr.io/logfoxai/castellan:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./castellan-config.json:/app/config.json:ro
      - ./castellan-state:/app/state
    networks: [backend]
```

```json
{
  "managedServices": [{
    "name": "api",
    "registry": "ghcr.io",
    "repository": "myorg/api-service",
    "tag": "staging",
    "healthUrl": "http://{{service}}:3000/health"
  }]
}
```

Full examples: [Setup paths](#setup-paths) · [Configuration reference](#configuration-reference)

## Go deeper

| Topic | Section |
|---|---|
| Config vs label discovery | [Setup paths](#setup-paths) |
| Watchtower opt-in labels | [Label discovery](#label-discovery-watchtower-compatible) |
| Tags, digests, CI `forceCheck` | [Tags and versions](#tags-and-versions) |
| Headless / API-only | [Operating modes](#operating-modes) |
| All config keys | [Configuration reference](#configuration-reference) |
| RPC methods | [API](#api) |
| Dashboard UI | [Dashboard](#dashboard) |
| Auth & network security | [Security](#security) |
| vs Watchtower, WatchWarden, … | [docs/comparisons.md](docs/comparisons.md) |

# Setup paths

## Label discovery (Watchtower compatible)

If Castellan starts **without** a config file, it scans running containers for an **opt-in autoupdate label**:

| Label | Match rule |
|---|---|
| **`ai.logfox.castellan.autoupdate`** | Label present (any value, or none). Set to `false` to opt out. |
| **`com.centurylinklabs.watchtower.enable=true`** | Legacy Watchtower opt-in — value must be `true`. |

```yaml
labels:
  - ai.logfox.castellan.autoupdate
```

Watchtower users: this matches **`watchtower --label-enable`** — only labeled services are updated. Castellan does **not** mirror Watchtower’s default mode (update all containers except those labeled `enable=false`). If you relied on default-all Watchtower, add an autoupdate label to each service you want managed (or use a [config file](#config-file-recommended)).

For each labeled container Castellan builds a managed service from:

- **Compose service name** — `com.docker.compose.service` label
- **Registry / repository / tag** — parsed from the container’s current `Image` ref

Discovery runs **at startup and on every registry check**. New labeled containers are picked up automatically with auto updates enabled. One labeled container → one compose service restarted at a time. Docker healthchecks apply; there is no `healthUrl` or `registries` block without a config file.

Remove Watchtower, add Castellan, keep legacy labels or switch to `ai.logfox.castellan.autoupdate` — one line per service.

When you outgrow label-only mode — grouped rolling restarts, explicit tags, HTTP health probes, private registry auth — add a config file. Mounting `config.json` (or setting `CASTELLAN_CONFIG`) **takes precedence**; label discovery is skipped.

## Config file (recommended)

Mount JSON or YAML at `/app/config.json` (or `/app/config.yaml`), or set `CASTELLAN_CONFIG`. Castellan loads `managedServices` explicitly instead of scanning labels.

Full docker-compose example:

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

  api-1:
    image: ghcr.io/myorg/api-service:staging
    # ...

  api-2:
    image: ghcr.io/myorg/api-service:staging
    # ...
```

Example config:

```json
{
  "managedServices": [
    {
      "name": "api",
      "registry": "ghcr.io",
      "repository": "myorg/api-service",
      "tag": "staging",
      "healthUrl": "http://{{service}}:3000/health",
      "healthIntervalMs": 5000,
      "healthRetries": 10
    },
    {
      "name": "worker",
      "registry": "docker.io",
      "repository": "myorg/worker",
      "tag": "staging",
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

Mount a **state volume** (`./castellan-state:/app/state`). On first start, if you omit `api.authToken`, Castellan writes a random API secret to `auth-token` in that directory — use it for curl/scripts; the dashboard sets a session cookie automatically (no login form).

Open the dashboard at `http://castellan:3003/` (or map a host port). YAML configs work too — use `config.yaml` or `config.yml`.

# Tags and versions

Each managed service watches **exactly one registry tag**. Deployments fire when the **digest** at that tag changes, not when the tag string changes.

| Concept | Meaning |
|---|---|
| **Tag** | Registry label to poll — e.g. `staging`, `production`, `latest`, `v1.2.3` |
| **Digest** | Immutable `sha256:…` content hash of the image currently at that tag |
| **Deploy trigger** | Tag now points at a different digest (CI pushed a new build to the same tag) |

**Config mode:** set `tag` in `managedServices`. You can watch a tag independently of what happens to be running locally (unusual, but supported).

**Label mode:** `tag` is inferred from each container’s image ref at startup — e.g. `ghcr.io/myorg/api:staging` watches `staging` on `ghcr.io/myorg/api`.

The dashboard shows **`repository:tag`** at a glance (e.g. `api-service:staging`); expand **Image details** for full registry path and digests.

### CI and rolling tags

Many teams publish environment tags from CI — push `myorg/api-service:staging` on every merge to main. Castellan watches that tag and redeploys when the digest changes.

To deploy immediately after CI pushes, call **`forceCheck`** instead of waiting for the next poll:

```yaml
- run: |
    curl -sf -X POST "$CASTELLAN_URL/v1/forceCheck" \
      -H "Authorization: Bearer $CASTELLAN_AUTH_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{}'
```

Set `poll.enabled: false` if you only want CI-triggered deploys.

### Choosing tags

- **Environment tags** (`staging`, `production`) — one rolling tag per environment; CI retags on each deploy.
- **Version tags** (`v1.2.3`) — pin a host to a release; change the config tag to promote.
- **`latest`** — fine for dev; risky in production unless you accept surprise updates.

Each `managedServices` entry watches **one tag**. To track multiple tags for the same repository, add separate entries with different `name` values.

# Operating modes

Castellan always runs registry polling and compose rollouts. HTTP is optional:

| Mode | Config | HTTP | Use when |
|---|---|---|---|
| **Full** (default) | `api.enabled: true`, `api.dashboard: true` | Dashboard at `/` + RPC on `/v1` | Day-to-day ops with browser UI and automation |
| **API-only** | `api.enabled: true`, `api.dashboard: false` | RPC on `/v1` only | Scripts, curl, or a future CLI — no browser UI |
| **Headless** | `api.enabled: false` | None | Zero HTTP surface; polling and rollouts only |

`api.dashboard` is ignored when `api.enabled` is `false`. In headless mode no port is bound, no auth token is generated, and state is still persisted to disk.

```json
{ "api": { "enabled": false } }
```

```json
{ "api": { "enabled": true, "dashboard": false, "authToken": "your-secret" } }
```

More context under [Headless & API-only setup](#headless--api-only-setup) in Security.

# Supported registries

| Registry | Config `registry` value | Authentication |
|---|---|---|
| **Amazon ECR** | `{account}.dkr.ecr.{region}.amazonaws.com` | AWS credential chain (IAM role, env vars) |
| **Docker Hub** | `docker.io` | Public images work without credentials; add `registries` for private repos |
| **GitHub Container Registry** | `ghcr.io` | Public images work without credentials; PAT in `registries` for private repos |
| **Other OCI Distribution v2** | any host | Standard Bearer token flow; optional `registries` credentials |

Need another registry? [Open a PR](https://github.com/logfoxai/castellan/pulls) — most v2-compatible hosts work via the HTTP backend.

# Configuration reference

```json
{
  "managedServices": [
    {
      "name": "<service-name>",
      "registry": "<registry host>",
      "repository": "<repo name>",
      "tag": "<rolling tag>",
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
}
```

### `api`

| Key | Default | Description |
|---|---|---|
| `enabled` | `true` | When `false`, **headless** — no HTTP, no auth token. See [Operating modes](#operating-modes). |
| `dashboard` | `true` | When `false`, RPC on `/v1` only; no web UI. Ignored when `enabled` is `false`. |
| `port` | `3003` | HTTP listen port when `enabled` is `true`. |
| `authToken` | *(auto)* | API secret — see [Access & API auth](#access--api-auth). |

### `poll`

| Key | Default | Description |
|---|---|---|
| `enabled` | `true` | When `false` (or `intervalMs` is `0`), periodic polling is off — use **`forceCheck`**. |
| `intervalMs` | `60000` | Milliseconds between registry checks. |
| `jitterMs` | `5000` | Random extra delay per tick to avoid synchronized polls. |

### `managedServices` entries

| Field | Description |
|---|---|
| `name` | Short id for dashboard/API (e.g. `api`, `worker`) |
| `registry` | Registry host (ECR, `ghcr.io`, `docker.io`, …) |
| `repository` | Image name without tag |
| `tag` | Registry tag to poll — see [Tags and versions](#tags-and-versions) |
| `composeServices` | *(optional)* Override compose service names to restart. When omitted, Castellan discovers running containers that use `registry/repository:tag` and restarts them one at a time. |

- `healthUrl` may use `{{service}}` as a placeholder for the current compose service name.
- When multiple compose services share the same image ref, Castellan restarts them one at a time, waiting for health before proceeding.
- `registries` maps registry hostnames to username/password for private Docker Hub, GHCR, or other HTTP v2 registries. ECR uses the AWS credential chain.

Environment overrides: `CASTELLAN_CONFIG`, `CASTELLAN_STATE`, `CASTELLAN_COMPOSE_FILE`, `CASTELLAN_COMPOSE_ENV_FILE`, `CASTELLAN_AUTH_TOKEN`, `DOCKER_SOCKET`.

# API

When `api.enabled` is `true` (the default), Castellan exposes an internal HTTP API on port `3003`:

- `GET /v1/health` — liveness (no auth).
- `POST /v1/<method>` — typed RPC (requires API auth when enabled). Request body is the method input (use `{}` when there are no parameters):
  - `status` — service states and current digests.
  - `forceCheck` — check registries immediately.
  - `pause` / `resume` — pause/resume polling.
  - `deploy` — deploy a specific digest (`{"service":"api","digest":"sha256:…"}`). Disables polling for that service until re-enabled.
  - `reject` — mark a digest rejected and roll back if it is running (`{"service":"api","digest":"sha256:…"}`).
  - `setPollEnabled` — enable or disable automatic updates for one service (`{"service":"api","enabled":true}`).
  - `history` — recent events (all services).
  - `deployments` — per-service deployment history (`{"service":"api"}`).
  - `dockerContainers`, `dockerImages`, `dockerNetworks`, `dockerVolumes` — Docker inspection.
  - `dockerLogs` (`{"containerId":"…","tail":100}`), `dockerStats` (`{"containerId":"…"}`), `dockerInfo`, `dockerEvents` (`{"since":300}`) — logs and stats.

See [Access & API auth](#access--api-auth). For headless or API-only deployments, see [Operating modes](#operating-modes).

# Dashboard

Served at `/` when `api.enabled` and `api.dashboard` are both `true` (the default).

- Live service status with watched **tag** and `repository:tag`; digests and **past deployments** in expandable details.
- **Deploy** and **Reject** actions per deployment digest (in the service manage dialog); per-service **Auto / Manual** badges.
- **Check now** and **Pause all / Resume all** controls.
- Docker container table with live CPU, memory, disk usage, state, and one-click log viewing.
- Deployment / rollback / failure history timeline.
- **No login screen** — open the URL on your private network (see [Security](#security)).
- Light and dark mode with system preference detection.

# How it works

1. Castellan loads a config file **or** discovers opt-in autoupdate labels (see [Setup paths](#setup-paths)).
2. On every poll interval it fetches the manifest for each managed image, with per-image TTL and global jitter.
3. When a digest changes, it pulls the image and performs a rolling restart of the associated compose services.
4. It waits for Docker and/or HTTP health checks to pass.
5. If health checks fail, it rolls back to the previous successful deployment and marks the failing digest as **rejected** (blocked from auto-deploy).
6. State is persisted atomically to disk (`deployments` history + event log) so restarts are safe.

# Roadmap

Active plan: **[docs/roadmap.md](docs/roadmap.md)** — observability + MCP (read track) and minimal deploy mutations (write track): digest history, pin deploy, registry catalog, managed logs, stdio MCP.

Backlog (not scheduled): notifications, Prometheus metrics, CLI companion, minimum update age, crash-loop detection, image diff preview, multi-host.

Have an idea? Open an issue or discussion.

# Security

Castellan controls the Docker socket and can restart any container it manages. **Treat it as highly privileged infrastructure** — never expose it on the public internet.

## Access & API auth

**Castellan is not user login.** No passwords, no per-user accounts, no secret pasted into the dashboard UI.

| Layer | What it controls | How |
|---|---|---|
| **Network access** | Who can open the dashboard at all | VPN / Tailscale / internal DNS / not publishing port 3003 publicly |
| **API secret** | Who can call `POST /v1/*` (including the dashboard’s background requests) | A single shared key — not per-user identity |

### Dashboard (browser)

1. Open Castellan over your private network (e.g. `http://castellan.internal.example:8443/` on VPN).
2. Castellan serves the page and sets an **httpOnly session cookie** with the API secret.
3. The dashboard’s fetch calls send that cookie automatically.

### curl, scripts, and future CLI

```bash
curl -sS -X POST http://127.0.0.1:3003/v1/status \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_SECRET' \
  -d '{}'
```

### Where the API secret comes from

1. **`api.authToken` in config** — recommended for production.
2. **`CASTELLAN_AUTH_TOKEN` env var**
3. **`auth-token` file in the state directory**
4. **Auto-generated on first start** — written to `<state-dir>/auth-token` if nothing else is set.

**Production:** set a stable `api.authToken` (or inject via your secrets manager) so restarts do not rotate the key.

```json
{
  "api": {
    "port": 3003,
    "authToken": "long-random-secret-from-secrets-manager"
  }
}
```

### What this is not

- **Not OAuth / SSO** — no sign-in, no audit trail per human user.
- **Not a substitute for network security** — the API secret is defense in depth on top of VPN-only access.

If you need per-user identity, put your IdP in front of Castellan at a reverse proxy. Castellan stays a single shared-secret ops tool.

### Headless & API-only setup

See [Operating modes](#operating-modes). Headless (`api.enabled: false`) skips HTTP entirely — check state via Docker logs and the on-disk state file.

## Keep it internal (recommended)

1. **Do not publish port 3003** to your public NIC.
2. **Reverse-proxy through an internal edge** (Caddy, nginx, Traefik) on your VPN interface.
3. **Use private DNS** — e.g. `http://castellan.internal.example:8443/` resolves only on your private network.

```caddyfile
{
    auto_https off
}

http://castellan.internal.example:8443 {
    bind {$TAILSCALE_IP}
    reverse_proxy 127.0.0.1:3003
}
```

## Other hardening

- Mount the Docker socket read-only if your runtime supports it.
- Run Castellan on an isolated Docker network.
- Rotate the API secret if leaked — update config or delete `<state-dir>/auth-token` and restart.

# Built by the team behind [Logfox](https://logfox.ai)

We build observability and deployment tools we actually want to use. If you like Castellan, star the repo and tell your friends.

# More open-source tools from Logfox

Castellan is part of a family of MIT-licensed tools from [Logfox](https://logfox.ai). Same vibe: sharp CLIs, great TUIs, built for real ops work.

| Tool | What it does |
|---|---|
| **[open-prs](https://github.com/logfoxai/open-prs)** | Live TUI + CLI dashboard for every open PR in a GitHub org — CI status, deploy tracking, clickable links. |
| **[ecswatch](https://github.com/logfoxai/ecswatch)** | ECS service watcher with CI streaming, interactive TUI, and one-shot `inspect` snapshots. |
| **[composewatch](https://github.com/logfoxai/composewatch)** | Docker Compose stacks over Tailscale SSH — watch rollouts, health, and digests. |
| **[runtyp](https://github.com/logfoxai/runtyp)** | Zero-dependency runtime type validation for TypeScript and JavaScript. |

Most ship to npm; Castellan ships as a container image. All are released with [AutoRel](https://github.com/mhweiner/autorel).

# License

MIT — see [LICENSE](LICENSE).
