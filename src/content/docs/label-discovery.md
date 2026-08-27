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
- **Registry / repository / tag** — parsed from the container's current `Image` ref
- **Optional group name** — `ai.logfox.castellan.group` when multiple replicas share one logical name

Discovery runs **at startup and on every registry check**. New labeled containers are picked up automatically; unlabeled or removed containers drop off the managed set.

## Rolling replicas

When multiple compose services share the same image ref, Castellan restarts them one at a time. By default the logical service name is the **repository** (e.g. `api-1` + `api-2` → `myorg/api-service`). Set the same **`ai.logfox.castellan.group`** on each replica to override (e.g. `group: api`).

The logical name is identity. Changing or adding `group` registers a new managed unit (deployment history and poll settings under the old name are not migrated). Prefer setting `group` before the first deploy.

This matches Watchtower's **`--label-enable`** model — only labeled services are updated. Castellan does **not** mirror Watchtower's default watch-all mode.
