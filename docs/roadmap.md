# Castellan roadmap

Castellan stays a **single-host, single-container sidecar**: docker-compose deploy control with optional dashboard and API. No database server — persisted state remains a **file on disk** (`state.json`), with structured fields added as needed.

This roadmap splits work into two parallel tracks:

| Track | Goal |
|-------|------|
| **Read** | Rich observability — history, registry catalog, logs, MCP read tools, dashboard |
| **Write** | Small, explicit mutation surface — deploy by digest, reject, CI `forceCheck` |

Tracks can ship independently. Read features should not require new write paths; write features should reuse the same deploy pipeline.

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
- `deploy(service, digest)` — roll out a specific digest
- `reject(service, digest)` — blacklist a digest; roll back if it is running
- `pause` / `resume` — polling control
- Rollback to a prior digest is internal (`rollbackManagedService`), used on deploy failure and by `reject`

**Read**

- `status` — per-service state, current vs desired digest, last error
- `history` — last 500 deployment events (unstructured messages)
- Dashboard: Service Status, History, Containers (host-wide stats + log tail)
- Docker inspection RPCs: several endpoints with **no UI** (`dockerImages`, `dockerNetworks`, `dockerVolumes`, `dockerInfo`, `dockerEvents`, `dockerStats`)

**Persistence**

- `knownGood`, `badDigests`, `events` in `state.json` (v1)
- No per-service deploy history; no registry image listing

---

## Write track

Deploy semantics converge on **one implementation**: pull `@digest` → retag rolling tag → compose rolling restart → health verify → rollback on failure.

### W1 — `deploy(service, digest)` (foundation)

**Goal:** Pin and roll out a specific digest; generalizes manual rollback and “deploy this version from history.”

| Item | Detail |
|------|--------|
| RPC | `deploy` — `{ "service": "api", "digest": "sha256:…" }` |
| Behavior | Same path as poll deploy: pull, tag, rolling restart, health, record success |
| Guards | Reject rejected digests; wait for deploy lock |
| Events | Record `deploy` with trigger `manual` |

**Out of scope for W1:** blocking auto-poll after manual deploy (see W3).

### W2 — Deploy history on success

**Goal:** Persist what actually ran on this host (source of truth for rollback UI).

| Item | Detail |
|------|--------|
| Schema | `state.json` v2 — `deployHistory[service][]`: `{ digest, at, trigger }` |
| Triggers | `poll`, `forceCheck`, `manual`, internal rollback |
| Caps | e.g. 30 entries per service (drop oldest) |
| Migration | Bump `version` in `StateManager.load()`; v1 → v2 preserves existing fields |

Append on every **successful** deploy/rollback. Failed attempts stay in `events` only.

### W3 — Pin semantics (optional)

**Goal:** Clarify interaction between manual deploy and automatic poll.

| Option | Behavior |
|--------|----------|
| **A (default v1)** | Poll always chases registry tag; manual deploy until next CI push |
| **B** | `pinnedDigest` per service; poll skips until `forceCheck` or explicit unpin |

Decision deferred to implementation; document chosen behavior in README.

### W4 — CI contract unchanged

**Goal:** Logfox and other consumers keep working.

- `forceCheck` — no breaking change
- `deploy-compose-service` continues to call `forceCheck` only

---

## Read track

Observability expands through RPC, dashboard, and MCP. Prefer **on-demand registry queries with TTL cache** over storing registry catalogs on disk.

### R1 — Structured deploy history API

**Goal:** UI/MCP can list past digests without parsing event strings.

| Item | Detail |
|------|--------|
| RPC | `imageHistory` — `{ service }` → deploy history + flags: `current`, `knownGood`, `bad` |
| Depends on | W2 (persisted history) |
| UI | Service card → digest timeline with metadata |

### R2 — Registry image catalog (on-demand)

**Goal:** See upstream images (tags, push time) even if never deployed on this host.

| Item | Detail |
|------|--------|
| RPC | `registryImages` — `{ service, limit? }` |
| Source | Host Docker daemon — same path as poll (`docker manifest inspect` / registry APIs the daemon uses) |
| Cache | In-memory TTL (e.g. 5–15 min); not persisted |
| UI | Lazy “Registry” section on service detail; **Deploy** wires to W1 |

Merge with R1 in UI as optional “show registry” toggle to avoid conflating “ran here” vs “exists upstream.”

### R3 — Managed-service logs

**Goal:** Logs without host-wide docker explorer noise.

| Item | Detail |
|------|--------|
| RPC | `serviceLogs` — `{ service, tail? }` — resolve compose service → container |
| UI | Log viewer on managed service card (replace or complement Containers click-through) |
| MCP | `castellan_logs` tool |

Keep Containers panel for host-wide ops; managed logs are the primary path for deploy debugging.

### R4 — Dashboard: service-centric observability

**Goal:** Deploy story visible in one place.

- Digest timeline (R1) with deploy actions (W1)
- Current / desired / bad digest badges
- Optional registry browser (R2)
- Managed logs panel (R3)
- Keep History panel; enrich messages where useful

### R5 — Trim dead read API surface

**Goal:** Reduce backend weight without losing useful UI.

| Remove (no UI today) | Keep |
|----------------------|------|
| `dockerImages`, `dockerNetworks`, `dockerVolumes`, `dockerInfo`, `dockerEvents`, `dockerStats` | `dockerContainers`, `dockerStatsAll`, `dockerLogs` for Containers panel — or fold into scoped helpers later |

### R6 — MCP server (stdio)

**Goal:** Agents and IDE get deploy observability without SSH or a fat HTTP API.

| Tool | Type | Maps to |
|------|------|---------|
| `castellan_status` | read | `status` |
| `castellan_history` | read | `history` |
| `castellan_image_history` | read | `imageHistory` |
| `castellan_registry_images` | read | `registryImages` |
| `castellan_logs` | read | `serviceLogs` |
| `castellan_force_check` | write | `forceCheck` |
| `castellan_deploy` | write | `deploy` |
| `castellan_reject` | write | `reject` |

- **Transport:** stdio MCP (separate entrypoint or subcommand), same auth token as `/v1`
- **Scope:** managed services only for writes; reads may include Containers summary if useful

Ship after R1 + W1 so MCP exposes real history and pin deploy.

### R7 — Local image hint (optional)

**Goal:** Show digests still present on disk for a repository.

- Read-only merge into `imageHistory` or separate `localImages(service)`
- No persistence; docker `listImages` filtered by repo

---

## Persistence: JSON vs SQLite

**v1 of this roadmap: extend `state.json` only.**

| Need | JSON + caps | SQLite |
|------|-------------|--------|
| Deploy history (~30 × N services) | ✅ | Overkill |
| Event log (500 entries) | ✅ already | Overkill |
| Registry catalog | ❌ don’t store; query + cache | ❌ |
| Container metrics time series | ❌ awkward | ✅ future |
| Searchable log retention | ❌ awkward | ✅ future |

Revisit SQLite if we add retained metrics, log indexing, or retention beyond ~100 entries per service.

### Proposed `state.json` v2 (sketch)

```json
{
  "version": 2,
  "knownGood": { "api": "sha256:…" },
  "badDigests": { "api": ["sha256:…"] },
  "deployHistory": {
    "api": [
      { "digest": "sha256:…", "at": "2026-07-22T…", "trigger": "forceCheck" }
    ]
  },
  "events": []
}
```

---

## Suggested delivery order

Work can proceed on both tracks in parallel once W2 schema lands.

```text
Phase 1 — Write foundation + read history
  W2  deployHistory in state (v2 migration)
  W1  deploy(service, digest)
  R1  imageHistory RPC + UI timeline

Phase 2 — Registry + logs
  R2  registryImages (ECR first)
  R3  serviceLogs
  R4  dashboard service detail polish

Phase 3 — MCP + cleanup
  R6  MCP stdio server
  R5  remove unused docker* RPCs
  R7  local images hint (if wanted)

Phase 4 — Optional
  W3  pin semantics
  R8  notifications / metrics (see backlog below)
```

---

## Backlog (not scheduled)

Items from the earlier README roadmap — still valid, lower priority than observability + MCP:

- Notifications (Slack/webhook on deploy, rollback, failure)
- Prometheus metrics (poll latency, deploy outcomes)
- CLI companion (`castellan status`, `check`, `reject`)
- Minimum update age before deploy
- Crash-loop detection
- Image diff preview (env/port changes)
- Multi-host (explicit non-goal for now)

---

## Success criteria

**Write track**

- Operator or CI can deploy a **specific digest** without SSH
- Bad digests are rejected via `reject`; internal rollback reuses one deploy pipeline
- `forceCheck` remains stable for Logfox CI

**Read track**

- Operator can answer: *what ran here, what’s in the registry, what’s running now, show me logs* — from dashboard or MCP
- No new database process; state file stays portable
- Dead docker inspection RPCs removed without losing Containers panel utility

---

## References

- [README — HTTP surface](../README.md#http-surface)
- [README — Dashboard](../README.md#dashboard)
- Logfox deploy path: `infra/docs/cicd.md` (`forceCheck` after ECR push)

Have a suggestion? Open an issue or discussion on [github.com/logfoxai/castellan](https://github.com/logfoxai/castellan).
