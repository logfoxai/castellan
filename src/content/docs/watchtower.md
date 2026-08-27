# Migrating from Watchtower

[Watchtower](https://github.com/containrrr/watchtower) is **archived and no longer in development** upstream. Castellan targets compose hosts that want a safety net (health wait, rollback, deployment history) in one lightweight sidecar.

## Compose swap

Remove the `watchtower` service and add `castellan`:

```yaml
name: mystack

services:
  castellan:
    image: ghcr.io/logfoxai/castellan:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /root/.docker:/root/.docker:ro
      - ./docker-compose.yml:/app/docker-compose.yml:ro
      - ./castellan-state:/app/state
    environment:
      CASTELLAN_COMPOSE_FILE: /app/docker-compose.yml
      CASTELLAN_COMPOSE_PROJECT: mystack
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

- **Opt-in labels only** — same idea as `watchtower --label-enable`; not default watch-all mode.
- **Safety net** — health wait before proceeding, automatic rollback, per-digest reject, deployments history.
- **Private registry creds** — `docker login` on the host (same creds used for image pull and `docker manifest inspect`).
- **Optional `ai.logfox.castellan.group`** — keep a short logical name when rolling replicas share one image.

Feature matrix vs WatchWarden and others: [Comparisons](./comparisons.md).
