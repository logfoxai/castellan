# Castellan

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/castellan-logo-dark.png" />
    <img src="assets/castellan-logo-light.png" alt="Castellan logo" width="120" />
  </picture>
</p>

<p align="center">
  <a href="https://github.com/logfoxai/castellan/actions/workflows/ci.yml"><img src="https://github.com/logfoxai/castellan/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/logfoxai/castellan/actions/workflows/release.yml"><img src="https://github.com/logfoxai/castellan/actions/workflows/release.yml/badge.svg" alt="Release" /></a>
  <a href="https://www.npmjs.com/package/castellan"><img src="https://img.shields.io/npm/v/castellan.svg" alt="npm" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="https://github.com/logfoxai/castellan"><img src="https://img.shields.io/badge/SemVer-2.0.0-blue" alt="SemVer" /></a>
  <a href="https://github.com/mhweiner/autorel"><img src="https://img.shields.io/badge/%F0%9F%9A%80%20AutoRel-2D4DDE" alt="AutoRel" /></a>
</p>

<h3 align="center">The drop-in replacement for deprecated Watchtower.</h3>

<p align="center">
  Registry-aware deployments for docker-compose — with zero-downtime rollouts, automatic rollback, and a built-in observability dashboard.
</p>

<p align="center">
  <img src="assets/screenshot.png" alt="Castellan dashboard" width="100%" />
</p>

## Why Castellan?

[Watchtower](https://containrrr.dev/watchtower/) was archived in December 2025. Most tools marketed as "alternatives" aren't drop-in replacements — they want new labels, new config, or a completely different workflow (notify-only, manual updates, GitOps PRs). Castellan is different:

- **True drop-in** — uses the same `com.centurylinklabs.watchtower.enable=true` labels. Remove Watchtower, add Castellan, keep everything else.
- **Safer updates** — rolling restarts and health verification, not blind restarts.
- **Automatic rollback** — if a new image fails health checks, Castellan reverts to the last known-good digest like an ECS circuit breaker.
- **Built-in observability** — live dashboard, deployment history, container logs, and health status in one place.
- **Works on your phone** — the dashboard is fully responsive, so you can check deployments from anywhere without pinching or zooming.
- **Extensible** — HTTP API, Bearer auth, YAML/JSON config, and ECR-first registry support.

### Drop-in compatibility: Castellan vs the field

Most Watchtower "successors" require migration work. Here's how they actually compare:

| Tool | Drop-in? | Auto-update | Rollback | Zero-downtime | Dashboard |
|---|---|---|---|---|---|
| **Castellan** | ✅ same labels | ✅ | ✅ | ✅ | ✅ |
| [Watchtower](https://github.com/containrrr/watchtower) (archived) | — | ✅ | ❌ | ❌ | ❌ |
| [nickfedor/watchtower](https://github.com/nicholas-fedor/watchtower) | ✅ swap image | ✅ | ❌ | ❌ | ❌ |
| [openserbia/watchtower](https://github.com/openserbia/watchtower) | ✅ swap image | ✅ | ❌ | ❌ | ❌ |
| [Lighthouse](https://github.com/grioghar/lighthouse) | ✅ `WATCHTOWER_*` + labels | ✅ | ❌ | ❌ | ❌ |
| [DockWarden](https://github.com/emon5122/dockwarden) | ⚠️ env var remap | ✅ | ❌ | ❌ | optional |
| [WatchWarden](https://github.com/watchwarden-labs/watchwarden) | ⚠️ env var remap | ✅ | ✅ | partial | ✅ |
| [WUD](https://github.com/getwud/wud) | ❌ new `wud.*` labels | optional | ❌ | ❌ | ✅ |
| [Diun](https://github.com/crazy-max/diun) | ❌ notify-only | ❌ | ❌ | ❌ | ❌ |
| [freshdock](https://github.com/Turbootzz/freshdock) | ❌ `freshdock.*` labels | ✅ | ✅ | ❌ | ❌ |

**Drop-in** means you can swap the container image and keep your existing Watchtower labels or environment variables with no config rewrite. Tools marked ⚠️ require remapping env vars. Tools marked ❌ need new labels, a new config model, or don't auto-update at all.

Castellan is the only option that is label-compatible **and** adds rollback, zero-downtime rolling restarts, and a mobile-friendly observability dashboard.

### What you get beyond Watchtower

| | Watchtower | Castellan |
|---|---|---|
| Drop-in label compatibility | ✅ | ✅ |
| Zero-downtime rolling restart | ❌ | ✅ |
| Automatic rollback on failure | ❌ | ✅ |
| Health-check verification | ❌ | ✅ |
| Self-hosted dashboard | ❌ | ✅ |
| Container logs & inspection | ❌ | ✅ |
| HTTP API + CLI integration | ❌ | ✅ |
| Digest-based change detection | ❌ | ✅ |
| ECR rate-limit protection | ❌ | ✅ |
| Mobile-responsive dashboard | ❌ | ✅ |

## Features

### Deployment safety

- **Registry polling** with tunable intervals, jitter, and ECR rate-limit protection.
- **Digest-based change detection** — only restarts when the image digest actually changes, eliminating false pulls.
- **Zero-downtime rolling restarts** for grouped compose services (`api-1`, `api-2`, etc.).
- **Automatic rollback** on health-check failure with a persisted known-good digest and a bad-digest list.
- **Manual controls** — force a check, pause/resume polling, or trigger a rollback from the UI or API.

### Observability hub

- **Self-hosted React dashboard** — live status, controls, and Docker inspection in one dark, fast UI.
- **Service status cards** — current vs desired image digests, last check time, and last error.
- **Container list** — see every container Castellan can see, with live state and one-click log viewing.
- **Deployment history timeline** — check, deploy, rollback, and failure events with timestamps.
- **Health status** — green/yellow/red state badges and detailed HTTP/Docker health verification.
- **Mobile responsive** — check deployments, logs, and container status from your phone without pinching or zooming.

### Integration & compatibility

- **Internal HTTP API** — typed RPC for dashboard, CLI, or automation.
- **Watchtower compatibility mode** — works with existing Watchtower labels, no config required.
- **Registry-agnostic** — ECR first, with Docker Hub and GHCR support ready.
- **Bearer token auth** — secure the API in shared environments.
- **YAML and JSON config** — use whichever format you prefer.
- **Small, fast sidecar** — TypeScript, MIT licensed, published to npm and GHCR.

## Quick start

Add Castellan as a sidecar in your `docker-compose.yml`:

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
      - AWS_REGION=us-east-2
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
      "registry": "123456789.dkr.ecr.us-east-2.amazonaws.com",
      "repository": "api-service",
      "tag": "latest",
      "composeServices": ["api-1", "api-2"],
      "healthUrl": "http://{{service}}:3000/health",
      "healthIntervalMs": 5000,
      "healthRetries": 10
    }
  ],
  "poll": {
    "intervalMs": 60000,
    "jitterMs": 5000
  }
}
```

Open the dashboard at `http://castellan:3003/` (or map a port to your host).

## Migrating from Watchtower

**Keep your existing `com.centurylinklabs.watchtower.enable=true` labels. Swap the sidecar. Done.**

[Watchtower](https://github.com/containrrr/watchtower) was archived in December 2025. Castellan reads the same labels, so migration is a one-line change: replace the Watchtower container with Castellan. No relabeling, no config rewrite.

Remove your Watchtower service and add Castellan. No config file is needed for basic label-based updates:

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

Castellan discovers every container carrying the Watchtower label and manages it immediately — same behavior you already rely on, plus health verification and rollback.

For grouped services (e.g. multiple API replicas that need zero-downtime rolling restarts), add a config file — see [Configuration reference](#configuration-reference).

## Configuration reference

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
    "intervalMs": 60000,
    "jitterMs": 5000
  },
  "rollback": {
    "healthTimeoutMs": 120000,
    "maxAttempts": 1
  },
  "api": {
    "port": 3003,
    "authToken": "optional-bearer-token"
  }
}
```

- `healthUrl` may use `{{service}}` as a placeholder for the current compose service name.
- `composeServices` is a list; when more than one is present, Castellan restarts them one at a time, waiting for health before proceeding.
- YAML configs are supported — just use `config.yaml` or `config.yml` instead of `config.json`.

## API

Castellan exposes an internal HTTP API on port `3003`:

- `GET /v1/health` — liveness.
- `POST /v1` — typed RPC:
  - `status()` — service states and known-good digests.
  - `forceCheck()` — check registries immediately.
  - `pause()` / `resume()` — pause/resume polling.
  - `rollback({ service })` — manually rollback a service.
  - `history()` — recent events.
  - `dockerContainers()`, `dockerImages()`, `dockerNetworks()`, `dockerVolumes()` — Docker inspection.
  - `dockerLogs({ containerId, tail })`, `dockerStats({ containerId })`, `dockerInfo()`, `dockerEvents({ since })` — logs and stats.

Set `api.authToken` in your config to require a `Bearer` token on every request.

## Dashboard

The dashboard is built into the image and served at `/`. It gives you:

- Live service status with current vs desired image digests.
- One-click **Force check**, **Pause**, and **Resume** controls.
- Docker container list with live state and one-click log viewing.
- Deployment / rollback / failure history timeline.
- Optional Bearer token input for authenticated APIs.
- Fully responsive — works on phones, tablets, and desktops.
- Light and dark mode with system preference detection.

## How it works

1. Castellan loads your config (or discovers Watchtower-labeled containers).
2. On every poll interval it fetches the manifest for each configured image, respecting per-image TTL and global jitter.
3. When a digest changes, it pulls the image, tags it, and performs a rolling restart of the associated compose services.
4. It waits for Docker and/or HTTP health checks to pass.
5. If health checks fail, it rolls back to the last known-good digest and marks the failing digest as bad.
6. State is persisted atomically to a JSON file so restarts are safe.

## Roadmap / ideas

Castellan is already useful, but the sky is the limit. Ideas we are excited about:

- **Container stats panel** — live CPU, memory, and network graphs for selected containers.
- **Images, networks, and volumes views** — browse all Docker resources from the dashboard.
- **Prometheus metrics export** — expose deployment counts, health results, and poll latency.
- **Webhook / Slack / Discord notifications** — ping your team on deploy, rollback, or failure.
- **CLI companion** — `castellan status`, `castellan force-check`, `castellan rollback <service>`.
- **OpenAPI / REST spec** — a formal public API for integrations.
- **Multi-host and Swarm support** — watch deployments across a fleet of nodes.
- **Dry-run mode** — preview what would change without touching containers.
- **Maintenance windows** — pause polling automatically during scheduled deploys.
- **Image promotion & retention policies** — prune old images and keep only the last N known-good digests.
- **Audit log** — immutable, exportable record of every deployment decision.
- **Dark / light mode** and mobile-friendly dashboard.
- **Alerting on health drift** — notify when a service has been unhealthy for too long.

Have an idea? Open an issue or discussion.

## Security

Castellan controls the Docker socket and can restart any container it manages. **Treat it as highly privileged infrastructure** — never expose it on the public internet.

### Keep it internal (recommended)

The safest deployment is **VPN-only access** with no public DNS or port mapping:

1. **Do not publish port 3003** to your public NIC. Bind Castellan to `127.0.0.1:3003` inside the host.
2. **Reverse-proxy through an internal edge** (Caddy, nginx, Traefik) that listens only on your VPN interface — e.g. Tailscale IP or `127.0.0.1`.
3. **Use private DNS** so the dashboard is reachable only when connected to your VPN:
   - Prod: `http://castellan.int.logfox.ai:8443/`
   - Local: `http://castellan.local.logfox.test:8443/`
   - Other envs: `http://castellan.<env>.logfox.ai:8443/`

Example Caddy internal edge (binds to Tailscale IP, not the public NIC):

```caddyfile
{
    auto_https off
}

http://castellan.int.logfox.ai:8443 {
    bind {$TAILSCALE_IP}
    reverse_proxy 127.0.0.1:3003
}
```

Split DNS (Tailscale, CoreDNS, etc.) resolves `*.int.logfox.ai` to your compose host's Tailscale IP. Without VPN membership, the hostname does not resolve and the port is not reachable.

### Require a Bearer token (defense in depth)

Even on a private network, set `api.authToken` so every API and dashboard request requires authentication:

```json
{
  "api": {
    "port": 3003,
    "authToken": "generate-a-long-random-secret"
  }
}
```

Clients send `Authorization: Bearer <token>`. The dashboard has a token input field that persists to `localStorage`.

In production, store the token in a secrets manager and inject it at deploy time (Logfox uses AWS Secrets Manager via `host-config.json`).

### Other hardening

- Mount the Docker socket read-only if your runtime supports it; Castellan only needs the API surface it uses.
- Run Castellan on an isolated Docker network; do not expose it alongside public-facing services without the internal edge pattern above.
- Rotate `authToken` if it is ever leaked — Castellan reads config at startup.

## Built by the team behind [Logfox](https://logfox.ai)

We build observability and deployment tools we actually want to use. If you like Castellan, star the repo and tell your friends.

## More open-source tools from Logfox

Castellan is part of a family of MIT-licensed tools we ship and dogfood. Same vibe: sharp CLIs, great TUIs, built for real ops work.

| Tool | What it does |
|------|--------------|
| [**open-prs**](https://github.com/logfoxai/open-prs) | Live TUI + CLI dashboard for every open PR in a GitHub org — CI status, deploy tracking, clickable links. |
| [**ecswatch**](https://github.com/logfoxai/ecswatch) | ECS service watcher with CI streaming, interactive TUI, and one-shot `inspect` snapshots. Optional LLM root-cause analysis. |
| [**composewatch**](https://github.com/logfoxai/composewatch) | Sibling of ecswatch for Docker Compose stacks over Tailscale SSH — watch Watchtower/Castellan rollouts, health, and digests. |
| [**runtyp**](https://github.com/logfoxai/runtyp) | Lightning-fast, zero-dependency runtime type validation for TypeScript and JavaScript. |

All published to npm, released with [AutoRel](https://github.com/mhweiner/autorel), and designed to be useful outside Logfox too.

## License

MIT — see [LICENSE](LICENSE).
