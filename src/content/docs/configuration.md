# Configuration reference

Castellan has **no application config file** and the sidecar itself takes **no process flags**. Global settings are read from **`process.env`** at startup (`CASTELLAN_*` variables). Managed services are discovered from **compose labels** on running containers.

## How to set environment variables

Castellan does not load a `.env` file itself. Use any standard way to populate the container environment:

| Method | When |
|---|---|
| Compose `environment:` | Typical — inline vars on the `castellan` service |
| Compose [`env_file:`](https://docs.docker.com/compose/compose-file/#env_file) | Many vars — Docker injects the file before Castellan starts |
| `docker run --env-file …` | Bare container, no compose wrapper |
| Shell exports | Local dev — `CASTELLAN_COMPOSE_FILE=./compose.yml npm run dev` |

### Compose project (`CASTELLAN_COMPOSE_PROJECT`)

Castellan manages **one** compose project on the Docker host. `CASTELLAN_COMPOSE_PROJECT` is required if this host has more than one compose project. Set it to the project's name — the same string as compose `name:`, `docker compose -p`, and the container label `com.docker.compose.project`.

Find the name on the host:

```bash
docker compose ls
# or
docker inspect <container> --format '{{index .Config.Labels "com.docker.compose.project"}}'
```

### `CASTELLAN_COMPOSE_ENV_FILE`

Points at an env file passed to **`docker compose --env-file`** when Castellan runs `compose up`. Use it when your compose YAML uses variable substitution (e.g. `image: ${API_IMAGE}`) and those values live in a separate file. That file configures **Compose rendering**, not Castellan's own settings.

## Environment variables

| Env var | Default | Purpose |
|---|---|---|
| `CASTELLAN_COMPOSE_FILE` | `/app/docker-compose.yml` | Compose file for `compose up` |
| `CASTELLAN_COMPOSE_PROJECT` | *(see above)* | Compose project (`-p`) + container filter |
| `CASTELLAN_COMPOSE_ENV_FILE` | — | Optional `--env-file` for `docker compose up` |
| `CASTELLAN_POLL_ENABLED` | `true` | Periodic polling |
| `CASTELLAN_POLL_INTERVAL_MS` | `60000` | Poll interval |
| `CASTELLAN_POLL_JITTER_MS` | `5000` | Jitter |
| `CASTELLAN_ROLLBACK_HEALTH_TIMEOUT_MS` | `120000` | Health wait on deploy |
| `CASTELLAN_ROLLBACK_MAX_ATTEMPTS` | `1` | Auto-rollback retries |
| `CASTELLAN_API_ENABLED` | `true` | HTTP API |
| `CASTELLAN_DASHBOARD_ENABLED` | `true` | Dashboard at `/` |
| `CASTELLAN_API_PORT` | `3003` | Listen port (overridden by `PORT` when set) |
| `CASTELLAN_AUTH_TOKEN` | *(auto)* | API auth secret |
| `CASTELLAN_STATE` | `/app/state/state.json` | State file path |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket |

### Labels

| Label | Purpose |
|---|---|
| `ai.logfox.castellan.autoupdate` | Opt in to automatic updates (any value except `false`) |
| `ai.logfox.castellan.group` | Optional logical name when merging rolling replicas |

See [Label discovery](./label-discovery.md).
