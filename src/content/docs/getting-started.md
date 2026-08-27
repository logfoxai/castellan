# Getting started

> **Beta.** APIs and setup may change before v1.0. Test in staging before trusting it in production.

Castellan is a **single-container sidecar** for docker-compose — a practical **Watchtower replacement** with health verification, rollback, and an optional dashboard.

**Image:** `ghcr.io/logfoxai/castellan:latest` — [GHCR package](https://github.com/logfoxai/castellan/pkgs/container/castellan).

## Quick start

```yaml title="docker-compose.yml"
name: mystack

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
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
      timeout: 3s
      retries: 3
    networks: [backend]

networks:
  backend:
```

Mount a **state volume** (`./castellan-state:/app/state`). On first start, if you omit `CASTELLAN_AUTH_TOKEN`, Castellan writes a random API secret to `auth-token` in that directory.

Open the dashboard at `http://castellan:3003/` (or map a host port). See [Dashboard](./dashboard.md) and [Security](./security.md) for access patterns.

## What happens next

1. Castellan discovers labeled containers at startup and on every poll.
2. It compares the digest behind each service's rolling tag to what is running.
3. When the digest changes, it pulls, retags, and rolling-restarts compose services.
4. It waits for healthchecks; on failure it rolls back and rejects the bad digest.

Full example: [examples/docker-compose.yml](https://github.com/logfoxai/castellan/blob/main/examples/docker-compose.yml) in the repo.

## Next steps

- [Label discovery](./label-discovery.md) — opt-in labels and rolling replicas
- [Configuration](./configuration.md) — `CASTELLAN_*` environment variables
- [Migrating from Watchtower](./watchtower.md) — swap the sidecar and change labels
- [Castellan CLI](./cli.md) — CI settle gates with `castellan watch`
