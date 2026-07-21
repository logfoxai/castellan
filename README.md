# Castellan

<p align="center">
  <img src="assets/castellan-logo.png" alt="Castellan logo" width="120" />
</p>

<p align="center">
  <a href="https://github.com/logfoxai/castellan/actions/workflows/ci.yml"><img src="https://github.com/logfoxai/castellan/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/logfoxai/castellan/actions/workflows/release.yml"><img src="https://github.com/logfoxai/castellan/actions/workflows/release.yml/badge.svg" alt="Release" /></a>
  <a href="https://www.npmjs.com/package/castellan"><img src="https://img.shields.io/npm/v/castellan.svg" alt="npm" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="https://github.com/logfoxai/castellan"><img src="https://img.shields.io/badge/SemVer-2.0.0-blue" alt="SemVer" /></a>
  <a href="https://github.com/mhweiner/autorel"><img src="https://img.shields.io/badge/%F0%9F%9A%80%20AutoRel-2D4DDE" alt="AutoRel" /></a>
</p>

<h3 align="center">The deployment watchdog that never sleeps.</h3>

<p align="center">
  <strong>Open-source, registry-aware, zero-downtime deployments for docker-compose.</strong><br />
  Drop it in as a sidecar. Watch it poll your registry, roll your services, verify health, and rollback if anything breaks.
</p>

<p align="center">
  <img src="assets/screenshot.png" alt="Castellan dashboard showing service status, containers, and deployment history" width="100%" />
</p>

## Why Castellan?

[Watchtower](https://containrrr.dev/watchtower/) is deprecated. Other tools either pull blindly or restart everything at once. **Castellan** gives you the same hands-off experience, but with the safety and visibility you actually need:

- **No-downtime rolling restarts** — restart one compose service at a time and wait for health before moving to the next.
- **Automatic rollback** — if a new image fails health checks, Castellan reverts to the last known-good digest like an ECS circuit breaker.
- **Registry-aware polling** — tunable intervals, ECR rate-limit protection, and digest-based change detection (no false restarts).
- **Self-hosted dashboard + API** — see status, inspect containers, view logs, and force a check from a beautiful dark UI or from your CLI.
- **Watchtower compatibility** — label your containers and Castellan can manage them with zero config.

## Features

- **Registry polling** with tunable intervals, jitter, and ECR rate-limit protection.
- **Zero-downtime rolling restarts** for grouped compose services (`api-1`, `api-2`, etc.).
- **Automatic rollback** on health-check failure with a persisted known-good digest.
- **Self-hosted React dashboard** — live status, Docker inspection, log viewer, and deployment history.
- **Internal HTTP API** — dashboard/CLI integration, forced checks, pause/resume, and manual rollback.
- **Watchtower compatibility mode** for simple drop-in migration.
- **Registry-agnostic** — ECR first, Docker Hub and GHCR ready.
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
- Docker container list with live logs and stats.
- Deployment / rollback / failure history timeline.

## Watchtower compatibility

If no config is provided, Castellan discovers containers labeled `com.centurylinklabs.watchtower.enable=true` and manages them as single services. This is a simple drop-in replacement for basic Watchtower setups; grouped services still need explicit config for true rolling restart.

## How it works

1. Castellan loads your config (or discovers Watchtower-labeled containers).
2. On every poll interval it fetches the manifest for each configured image, respecting per-image TTL and global jitter.
3. When a digest changes, it pulls the image, tags it, and performs a rolling restart of the associated compose services.
4. It waits for Docker and/or HTTP health checks to pass.
5. If health checks fail, it rolls back to the last known-good digest and marks the failing digest as bad.
6. State is persisted atomically to a JSON file so restarts are safe.

## Security

- Run the API behind your internal network or reverse proxy.
- Set `api.authToken` to require a Bearer token.
- Mount the Docker socket read-only if your runtime supports it; Castellan only needs the API surface it uses.

## Built by the team behind [Logfox](https://logfox.ai)

We build observability and deployment tools we actually want to use. If you like Castellan, star the repo and tell your friends.

## License

MIT — see [LICENSE](LICENSE).
