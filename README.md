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

> **Beta.** APIs and setup may change before v1.0. Test in staging before trusting it in production.

# Crash course

Castellan is a **single-container sidecar** for docker-compose — a practical **Watchtower replacement** with health verification, rollback, and an optional dashboard. [Watchtower is archived](https://github.com/containrrr/watchtower); Castellan is compose-native and safety-first.

Setup is **compose-only**: label the services you want managed, set `CASTELLAN_*` env vars on the sidecar, mount your compose file and state directory. No Castellan config file.

## What it does

1. **Polls** a registry **tag** on an interval (or on demand via API).
2. Compares the tag’s current **digest** (`sha256:…`) to what is running.
3. **Deploys** when the digest changed — usually CI pushed a new build to the same tag — via `docker compose pull` / rolling restarts.
4. **Verifies** health via Docker compose healthchecks.
5. **Rolls back** to the last known-good digest if a deploy fails.
6. **Observes** everything from an optional dashboard and RPC API — or run **headless** with no HTTP at all.

See [How it works](#how-it-works) for the runtime loop and [Tags and versions](#tags-and-versions) for the tag/digest model.

## Tags in one minute

Castellan watches **one tag per managed service** and redeploys when the **digest behind that tag** changes — not when you rename a tag string.

The tag is whatever is on each labeled container’s running image (`myorg/api:staging` → watches `staging`).

Typical CI flow: push `myorg/api-service:staging` on every merge; Castellan sees a new digest at `staging` and rolls out. Details: [Tags and versions](#tags-and-versions).

## HTTP surface

Castellan always runs polling and rollouts. HTTP is optional:

| Mode | Env | What you get |
|---|---|---|
| **Full** (default) | `CASTELLAN_API_ENABLED=true`, `CASTELLAN_DASHBOARD_ENABLED=true` | Dashboard at `/` + RPC on `/v1` |
| **API-only** | `CASTELLAN_DASHBOARD_ENABLED=false` | RPC on `/v1` only |
| **Headless** | `CASTELLAN_API_ENABLED=false` | No HTTP, no auth token |

Details: [Operating modes](#operating-modes).

## Registries

Amazon **ECR**, **Docker Hub**, **GHCR**, and other **OCI Distribution v2** hosts. Castellan uses the **host Docker daemon** for registry auth — run `docker login` (or ECR login) on the host before polling private images. Details: [Supported registries](#supported-registries).

## Try it

**Image:** `ghcr.io/logfoxai/castellan:latest` — [GHCR package](https://github.com/logfoxai/castellan/pkgs/container/castellan). No npm package.

Replacing Watchtower? See [Migrating from Watchtower](#migrating-from-watchtower).

```yaml
services:
  castellan:
    image: ghcr.io/logfoxai/castellan:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /root/.docker:/root/.docker:ro
      - ./docker-compose.yml:/app/docker-compose.yml:ro
      - ./castellan-state:/app/state
    environment:
      CASTELLAN_COMPOSE_FILE: /app/docker-compose.yml
      CASTELLAN_COMPOSE_PROJECT: mystack
    networks: [backend]

  my-service:
    image: myorg/my-service:staging
    labels:
      ai.logfox.castellan.autoupdate: "true"
    healthcheck: ...
    networks: [backend]
```

Full example: [examples/docker-compose.yml](examples/docker-compose.yml)

## Go deeper

| Topic | Section |
|---|---|
| Label discovery | [Label discovery](#label-discovery) |
| Env vars | [Configuration reference](#configuration-reference) |
| Migrating from Watchtower | [Migrating from Watchtower](#migrating-from-watchtower) |
| Tags, digests, CI `forceCheck` | [Tags and versions](#tags-and-versions) |
| Headless / API-only | [Operating modes](#operating-modes) |
| RPC methods | [API](#api) |
| Dashboard UI | [Dashboard](#dashboard) |
| Auth & network security | [Security](#security) |
| vs Watchtower, WatchWarden, … | [docs/comparisons.md](docs/comparisons.md) |

# Label discovery

Castellan scans running containers for an **opt-in autoupdate label**:

| Label | Match rule |
|---|---|
| **`ai.logfox.castellan.autoupdate`** | Label present (any value). Set to `false` to opt out. |

```yaml
labels:
  ai.logfox.castellan.autoupdate: "true"
```

For each labeled container Castellan builds a managed service from:

- **Compose service name** — `com.docker.compose.service` label
- **Registry / repository / tag** — parsed from the container’s current `Image` ref
- **Optional group name** — `ai.logfox.castellan.group` when multiple replicas share one logical name (see below)

Discovery runs **at startup and on every registry check**. New labeled containers are picked up automatically; unlabeled or removed containers drop off the managed set.

### Rolling replicas

When multiple compose services share the same image ref, Castellan restarts them one at a time. By default the logical service name is the **repository** (e.g. `api-1` + `api-2` → `myorg/api-service`). Set the same **`ai.logfox.castellan.group`** on each replica to override (e.g. `group: api`).

This matches Watchtower’s **`--label-enable`** model — only labeled services are updated. Castellan does **not** mirror Watchtower’s default watch-all mode.

# Migrating from Watchtower

[Watchtower](https://github.com/containrrr/watchtower) is **archived** upstream. Community forks exist, but Castellan targets compose hosts that want a safety net (health wait, rollback, deployment history) in one lightweight sidecar.

## Compose swap

Remove the `watchtower` service and add `castellan`:

```yaml
services:
  castellan:
    image: ghcr.io/logfoxai/castellan:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./docker-compose.yml:/app/docker-compose.yml:ro
      - ./castellan-state:/app/state
    environment:
      CASTELLAN_COMPOSE_FILE: /app/docker-compose.yml
```

## Label change (required)

Replace on each service you want managed:

```yaml
# Before (Watchtower)
labels:
  com.centurylinklabs.watchtower.enable: "true"

# After (Castellan)
labels:
  ai.logfox.castellan.autoupdate: "true"
```

Legacy Watchtower labels are **not** supported.

## Behavioral differences

- **Opt-in labels only** — same idea as `watchtower --label-enable`; not default watch-all / `enable=false` opt-out mode.
- **Safety net** — health wait before proceeding, automatic rollback, per-digest reject, deployments history.
- **Private registry creds** — `docker login` on the host (same creds used for `compose pull` and registry polling). For ECR, refresh login periodically (e.g. cron with `aws ecr get-login-password`).
- **Optional `ai.logfox.castellan.group`** — keep a short logical name when rolling replicas share one image.

Feature matrix vs WatchWarden and others: [docs/comparisons.md](docs/comparisons.md).

# Tags and versions

Each managed service watches **exactly one registry tag**. Deployments fire when the **digest** at that tag changes, not when the tag string changes.

| Concept | Meaning |
|---|---|
| **Tag** | Registry label to poll — e.g. `staging`, `production`, `latest`, `v1.2.3` |
| **Digest** | Immutable `sha256:…` content hash of the image currently at that tag |
| **Deploy trigger** | Tag now points at a different digest (CI pushed a new build to the same tag) |

The tag is inferred from each labeled container’s image ref — e.g. `ghcr.io/myorg/api:staging` watches `staging` on `ghcr.io/myorg/api`.

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

Set `CASTELLAN_POLL_ENABLED=false` if you only want CI-triggered deploys.

### Choosing tags

- **Environment tags** (`staging`, `production`) — one rolling tag per environment; CI retags on each deploy.
- **Version tags** (`v1.2.3`) — pin a host to a release; change the running image tag on the compose service to promote.
- **`latest`** — fine for dev; risky in production unless you accept surprise updates.

Each labeled service watches **one tag** (from its running image). To track multiple tags for the same repository, run separate compose services with different image tags.

# Operating modes

Castellan always runs registry polling and compose rollouts. HTTP is optional:

| Mode | Env | HTTP | Use when |
|---|---|---|---|
| **Full** (default) | `CASTELLAN_API_ENABLED=true`, `CASTELLAN_DASHBOARD_ENABLED=true` | Dashboard at `/` + RPC on `/v1` | Day-to-day ops with browser UI and automation |
| **API-only** | `CASTELLAN_API_ENABLED=true`, `CASTELLAN_DASHBOARD_ENABLED=false` | RPC on `/v1` only | Scripts, curl, or a future CLI — no browser UI |
| **Headless** | `CASTELLAN_API_ENABLED=false` | None | Zero HTTP surface; polling and rollouts only |

`CASTELLAN_DASHBOARD_ENABLED` is ignored when `CASTELLAN_API_ENABLED=false`. In headless mode no port is bound, no auth token is generated, and state is still persisted to disk.

```yaml
environment:
  CASTELLAN_API_ENABLED: "false"
```

```yaml
environment:
  CASTELLAN_API_ENABLED: "true"
  CASTELLAN_DASHBOARD_ENABLED: "false"
  CASTELLAN_AUTH_TOKEN: your-secret
```

More context under [Headless & API-only setup](#headless--api-only-setup) in Security.

# Supported registries

Castellan polls registries through the **host Docker daemon** (`docker manifest inspect`) and deploys with **`docker compose pull`**. Both paths use the same host credentials.

| Registry | Host in image ref | Authentication on the host |
|---|---|---|
| **Amazon ECR** | `{account}.dkr.ecr.{region}.amazonaws.com` | `aws ecr get-login-password \| docker login …` (refresh before token expiry, ~12h) |
| **Docker Hub** | `docker.io` | `docker login` for private repos; public images need no login |
| **GitHub Container Registry** | `ghcr.io` | `docker login ghcr.io` for private repos |
| **Other OCI Distribution v2** | any host | `docker login <registry>` |

### Private registry credentials

Run **`docker login`** on the host (or your platform’s ECR login script). Castellan needs the Docker socket plus a **read-only mount of the host Docker config directory** so `docker manifest inspect` uses the same credentials as `docker compose pull`:

```yaml
castellan:
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
    - /root/.docker:/root/.docker:ro
```

On non-root hosts, mount `${HOME}/.docker` instead of `/root/.docker`.

For **ECR**, tokens expire. Schedule periodic login on the host, for example:

```bash
aws ecr get-login-password --region us-east-2 \
  | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-2.amazonaws.com
```

Public images on Docker Hub or GHCR work without login.

# Configuration reference

Castellan has **no application config file**. Global settings come from environment variables; managed services come from compose labels.

Mount a **state volume** (`./castellan-state:/app/state`). On first start, if you omit `CASTELLAN_AUTH_TOKEN`, Castellan writes a random API secret to `auth-token` in that directory — use it for curl/scripts; the dashboard sets a session cookie automatically (no login form).

Open the dashboard at `http://castellan:3003/` (or map a host port).

### Environment variables

| Env var | Default | Purpose |
|---|---|---|
| `CASTELLAN_COMPOSE_FILE` | `/app/docker-compose.yml` | Compose file for pull/up |
| `CASTELLAN_COMPOSE_PROJECT` | infer from compose `name:` | Project label filter |
| `CASTELLAN_COMPOSE_ENV_FILE` | — | Optional env file for compose |
| `CASTELLAN_POLL_ENABLED` | `true` | Periodic polling |
| `CASTELLAN_POLL_INTERVAL_MS` | `60000` | Poll interval |
| `CASTELLAN_POLL_JITTER_MS` | `5000` | Jitter |
| `CASTELLAN_ROLLBACK_HEALTH_TIMEOUT_MS` | `120000` | Health wait on deploy |
| `CASTELLAN_ROLLBACK_MAX_ATTEMPTS` | `1` | Auto-rollback retries |
| `CASTELLAN_API_ENABLED` | `true` | HTTP API |
| `CASTELLAN_DASHBOARD_ENABLED` | `true` | Dashboard at `/` |
| `CASTELLAN_API_PORT` | `3003` | Listen port |
| `CASTELLAN_AUTH_TOKEN` | *(auto)* | API auth secret |
| `CASTELLAN_STATE` | `/app/state/state.json` | State file path |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket |

### Labels

| Label | Purpose |
|---|---|
| `ai.logfox.castellan.autoupdate` | Opt in to automatic updates (any value except `false`) |
| `ai.logfox.castellan.group` | Optional logical name when merging rolling replicas |

# API

When `CASTELLAN_API_ENABLED=true` (the default), Castellan exposes an internal HTTP API on port `3003`:

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

Served at `/` when `CASTELLAN_API_ENABLED` and `CASTELLAN_DASHBOARD_ENABLED` are both `true` (the default).

- Live service status with watched **tag** and `repository:tag`; digests and **past deployments** in expandable details.
- **Deploy** and **Reject** actions per deployment digest (in the service manage dialog); per-service **Auto / Manual** badges.
- **Check now** and **Pause all / Resume all** controls.
- Docker container table with live CPU, memory, disk usage, state, and one-click log viewing.
- Deployment / rollback / failure history timeline.
- **No login screen** — open the URL on your private network (see [Security](#security)).
- Light and dark mode with system preference detection.

# How it works

1. Castellan loads **env settings** and discovers **opt-in autoupdate labels** (see [Label discovery](#label-discovery)).
2. On every poll interval it fetches the manifest for each managed image, with per-image TTL and global jitter.
3. When a digest changes, it pulls the image and performs a rolling restart of the associated compose services.
4. It waits for Docker healthchecks to pass.
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

1. **`CASTELLAN_AUTH_TOKEN` env var** (or value passed from compose env)
2. **`auth-token` file in the state directory**
3. **Auto-generated on first start** — written to `<state-dir>/auth-token` if nothing else is set.

**Production:** set a stable `CASTELLAN_AUTH_TOKEN` (or inject via your secrets manager) so restarts do not rotate the key.

```yaml
environment:
  CASTELLAN_AUTH_TOKEN: long-random-secret-from-secrets-manager
```

### What this is not

- **Not OAuth / SSO** — no sign-in, no audit trail per human user.
- **Not a substitute for network security** — the API secret is defense in depth on top of VPN-only access.

If you need per-user identity, put your IdP in front of Castellan at a reverse proxy. Castellan stays a single shared-secret ops tool.

### Headless & API-only setup

See [Operating modes](#operating-modes). Headless (`CASTELLAN_API_ENABLED=false`) skips HTTP entirely — check state via Docker logs and the on-disk state file.

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
- Rotate the API secret if leaked — update `CASTELLAN_AUTH_TOKEN` or delete `<state-dir>/auth-token` and restart.

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
