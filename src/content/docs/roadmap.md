# Castellan roadmap

Castellan stays a **single-host, single-container sidecar**: docker-compose deploy control with optional dashboard and API. No database server — persisted state remains a **file on disk** (`state.json`), with structured fields added as needed.

This roadmap splits work into two parallel tracks:

| Track | Goal |
|-------|------|
| **Read** | Rich observability — registry catalog, managed logs, MCP read tools, dashboard polish |
| **Write** | Small, explicit mutation surface — already shipped; optional pin semantics remain |

Tracks can ship independently. Read features should not require new write paths; write features reuse the same deploy pipeline.

---

## Principles

1. **Observability is the product growth area.** Read-only UI and MCP tools are first-class, not afterthoughts.
2. **Mutations stay minimal.** Few RPC/MCP actions, one deploy pipeline underneath.
3. **Lightweight persistence.** Extend `state.json` with versioned schema and caps; defer SQLite until there is a concrete need (time-series metrics, log indexing, very large retention).
4. **Managed services first.** Logs, history, and deploy actions are scoped to labeled compose services — not a generic Docker control plane.
5. **Dashboard and MCP share handlers.** One backend; UI and MCP are thin clients.

---

## Current state (baseline)

**Write**

- `forceCheck` — poll registries now; deploy when rolling tag digest changed
- `deploy(service, digest)` — roll out a specific digest (disables auto-updates for that service until re-enabled)
- `reject(service, digest)` — mark a digest rejected; roll back if it is running
- `setPollEnabled(service, enabled)` — per-service auto vs manual mode
- `pause` / `resume` — global polling control
- Rollback to a prior digest is internal (`rollbackManagedService`), used on deploy failure and by `reject`
- Deploy pipeline: pull `@digest` → retag rolling tag → compose rolling restart → health verify → rollback on failure

**Read**

- `status` — per-service state, current vs desired digest, poll mode, last error
- `deployments` — per-service deployment history with digest, timestamp, outcome, reject flag
- `history` — last 500 deployment events (unstructured messages)
- Dashboard: Service Status (Auto/Manual badges, manage dialog), Past deployments with Deploy/Reject actions, History, Containers (host-wide stats + log tail)
- Docker inspection RPCs: several endpoints with **no UI** (`dockerImages`, `dockerNetworks`, `dockerVolumes`, `dockerInfo`, `dockerEvents`, `dockerStats`)

**Automation**

- **[castellan-cli](https://github.com/logfoxai/castellan-cli)** — `watch` (CI settle gate), `status`, `check`; calls the same HTTP RPC surface

**Persistence**

- `state.json` v3 — `deployments[service][]`, `pollEnabled`, `events`
- Each deployment record: `{ digest, at, outcome, reject? }` — up to 100 per service
- Rejected digests and rollback targets are derived from deployment history (v1 `knownGood` / `badDigests` migrated away)
- No registry image catalog on disk

---

## Write track (remaining)

Write mutations are shipped. Optional follow-up:

### W1 — Pin semantics (optional)

**Goal:** Explicit “pinned digest” state vs today’s manual mode.

| Today | Behavior |
|-------|----------|
| Manual deploy | Sets `pollEnabled: false` for the service until operator re-enables auto |
| Auto mode | Poll chases the rolling registry tag |

Optional future: dedicated `pinnedDigest` field and clearer unpin UX. Not required for CI — `forceCheck` and castellan-cli `watch` remain the contract.

---

## Read track

Observability expands through RPC, dashboard, and MCP. Prefer **on-demand registry queries with TTL cache** over storing registry catalogs on disk.

### R1 — Registry image catalog (on-demand)

**Goal:** See upstream images (tags, push time) even if never deployed on this host.

| Item | Detail |
|------|--------|
| RPC | `registryImages` — `{ service, limit? }` |
| Source | Host Docker daemon — same path as poll (`docker manifest inspect` / registry APIs the daemon uses) |
| Cache | In-memory TTL (e.g. 5–15 min); not persisted |
| UI | Lazy “Registry” section on service detail; **Deploy** uses existing `deploy` RPC |

Keep separate from `deployments` so “ran here” vs “exists upstream” stay distinct.

### R2 — Managed-service logs

**Goal:** Logs without host-wide docker explorer noise.

| Item | Detail |
|------|--------|
| RPC | `serviceLogs` — `{ service, tail? }` — resolve compose service → container |
| UI | Log viewer on managed service card (replace or complement Containers click-through) |
| MCP | `castellan_logs` tool |

Keep Containers panel for host-wide ops; managed logs are the primary path for deploy debugging.

### R3 — Dashboard polish

**Goal:** Finish the service-centric observability story.

- Registry browser (R1) on service detail
- Managed logs panel (R2)
- Keep History panel; enrich messages where useful
- Deployment list already covers digest timeline + deploy/reject actions

### R4 — Trim dead read API surface

**Goal:** Reduce backend weight without losing useful UI.

| Remove (no UI today) | Keep |
|----------------------|------|
| `dockerImages`, `dockerNetworks`, `dockerVolumes`, `dockerInfo`, `dockerEvents`, `dockerStats` | `dockerContainers`, `dockerStatsAll`, `dockerLogs` for Containers panel — or fold into scoped helpers later |

### R5 — MCP server (stdio)

**Goal:** Agents and IDE get deploy observability without SSH or a fat HTTP API.

| Tool | Type | Maps to |
|------|------|---------|
| `castellan_status` | read | `status` |
| `castellan_history` | read | `history` |
| `castellan_deployments` | read | `deployments` |
| `castellan_registry_images` | read | `registryImages` |
| `castellan_logs` | read | `serviceLogs` |
| `castellan_force_check` | write | `forceCheck` |
| `castellan_deploy` | write | `deploy` |
| `castellan_reject` | write | `reject` |

- **Transport:** stdio MCP (separate entrypoint or subcommand), same auth token as `/v1`
- **Scope:** managed services only for writes; reads may include Containers summary if useful

Ship after R1–R2 so MCP exposes registry catalog and managed logs.

### R6 — Local image hint (optional)

**Goal:** Show digests still present on disk for a repository.

- Read-only merge into `deployments` response or separate `localImages(service)`
- No persistence; docker `listImages` filtered by repo

---

## Persistence: JSON vs SQLite

**Current approach: extend `state.json` only.**

| Need | JSON + caps | SQLite |
|------|-------------|--------|
| Deploy history (~100 × N services) | ✅ | Overkill |
| Event log (500 entries) | ✅ | Overkill |
| Registry catalog | ❌ don’t store; query + cache | ❌ |
| Container metrics time series | ❌ awkward | ✅ future |
| Searchable log retention | ❌ awkward | ✅ future |

Revisit SQLite if we add retained metrics, log indexing, or retention beyond ~100 entries per service.

### `state.json` v3 (reference)

```json
{
  "version": 3,
  "deployments": {
    "api": [
      { "digest": "sha256:…", "at": "2026-07-22T…", "outcome": "success" },
      { "digest": "sha256:…", "at": "2026-07-21T…", "outcome": "failed", "reject": true }
    ]
  },
  "pollEnabled": { "api": true },
  "events": []
}
```

---

## Suggested delivery order

```text
Phase 1 — Registry + managed logs
  R1  registryImages (ECR first)
  R2  serviceLogs
  R3  dashboard service detail polish

Phase 2 — MCP + cleanup
  R5  MCP stdio server
  R4  remove unused docker* RPCs
  R6  local images hint (if wanted)

Phase 3 — Optional
  W1  explicit pin semantics
  R8  notifications / metrics (see backlog below)
```

---

## Backlog (not scheduled)

Lower priority than observability + MCP:

- Notifications (Slack/webhook on deploy, rollback, failure)
- Prometheus metrics (poll latency, deploy outcomes)
- Minimum update age before deploy
- Crash-loop detection
- Image diff preview (env/port changes)
- Multi-host (explicit non-goal for now)

---

## Success criteria

**Write track** — met

- Operator or CI can deploy a **specific digest** without SSH
- Bad digests are rejected via `reject`; internal rollback reuses one deploy pipeline
- `forceCheck` and castellan-cli `watch` remain stable for CI

**Read track** — remaining

- Operator can answer: *what ran here, what’s in the registry, what’s running now, show me logs* — from dashboard or MCP
- No new database process; state file stays portable
- Dead docker inspection RPCs removed without losing Containers panel utility

---

## References

- [README — HTTP surface](../README.md#http-surface)
- [README — Dashboard](../README.md#dashboard)
- [castellan-cli](https://github.com/logfoxai/castellan-cli)
- Logfox deploy path: `infra/docs/cicd.md` (`forceCheck` after ECR push)

Have a suggestion? Open an issue or discussion on [github.com/logfoxai/castellan](https://github.com/logfoxai/castellan).
