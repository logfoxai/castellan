# How alternatives compare

Most tools marketed as "Watchtower replacements" solve a different problem or require a heavier stack. This table is honest about trade-offs — not every checkmark means "better for everyone."

| Tool | Migration | Auto-update | Rollback | Zero-downtime | Dashboard | Notes |
|---|---|---|---|---|---|---|
| **Castellan** | Labels or config | ✅ | ✅ known-good | ✅ compose rolling | ✅ built-in (optional) | Lightweight single sidecar, MIT, compose-first; headless / API-only modes |
| [Watchtower](https://github.com/containrrr/watchtower) (archived) | — | ✅ | ❌ | ❌ | ❌ | Simple restarter; no safety net |
| [nickfedor/watchtower](https://github.com/nicholas-fedor/watchtower) | ✅ swap image | ✅ | ❌ | ❌ | ❌ | Community fork of archived Watchtower |
| [Lighthouse](https://github.com/grioghar/lighthouse) | ✅ `WATCHTOWER_*` + labels | ✅ | ❌ | ❌ | ❌ | Lightweight Watchtower fork |
| [WatchWarden](https://github.com/watchwarden-labs/watchwarden) | ✅ `WATCHTOWER_*` env vars | ✅ | ✅ any version | ⚠️ per-container blue-green | ✅ managed mode | Feature-rich; BSL license; dashboard needs controller + Postgres |
| [DockWarden](https://github.com/emon5122/dockwarden) | ⚠️ env remap | ✅ | ❌ | ❌ | optional | Watchtower-like with optional UI |
| [WUD](https://github.com/getwud/wud) | ❌ `wud.*` labels | optional | ❌ | ❌ | ✅ | Monitor-first; auto-update optional |
| [Diun](https://github.com/crazy-max/diun) | ❌ notify-only | ❌ | ❌ | ❌ | ❌ | Notifications only, no updates |
| [freshdock](https://github.com/Turbootzz/freshdock) | ❌ `freshdock.*` labels | ✅ | ✅ | ❌ | ❌ | Per-container updates |

**Reading the table:**
- **Migration** — what you can keep from Watchtower. Castellan supports centurylinklabs labels; WatchWarden supports `WATCHTOWER_*` env vars in solo mode.
- **Zero-downtime** varies: Castellan does compose-service rolling; WatchWarden does per-container blue-green (falls back to stop-first when ports conflict).
- **Dashboard** — Castellan's ships in the same container (optional — disable via `api.dashboard: false` or run fully headless with `api.enabled: false`). WatchWarden's dashboard requires the managed stack (controller + PostgreSQL + UI); solo agent mode has no UI.

# Castellan vs WatchWarden

[WatchWarden](https://github.com/watchwarden-labs/watchwarden) is the most feature-complete Watchtower successor — multi-host management, Trivy scanning, cosign verification, notifications, update groups, and a rich WebSocket dashboard. Worth evaluating if you need a fleet controller.

Castellan targets a different sweet spot:

| | Castellan | WatchWarden |
|---|---|---|
| **License** | MIT | BSL 1.1 |
| **Deploy** | 1 lightweight sidecar | Agent; dashboard needs controller + Postgres + UI |
| **HTTP surface** | Optional dashboard + API, API-only, or fully headless | Dashboard in managed stack; solo agent has no UI |
| **Update model** | Compose rolling (`api-1` → `api-2`) | Per-container blue-green |
| **Best for** | Single compose host, safety-first rollouts | Multi-host fleet, rich policies, notifications |
| **Maturity** | Beta (early) | Beta (more features, 462+ tests) |

We built Castellan because we wanted a **small, MIT-licensed, compose-native controller** we fully own — not a multi-service platform. If you need fleet management and don't mind BSL + Postgres, WatchWarden may be the better fit.

# What you get beyond Watchtower

| | Watchtower | Castellan |
|---|---|---|
| Compose rolling restarts | ❌ | ✅ |
| Automatic rollback on failure | ❌ | ✅ |
| Health-check verification | ❌ | ✅ |
| Self-hosted dashboard | ❌ | ✅ (optional) |
| Headless / API-only operation | ❌ | ✅ |
| Container metrics & logs | ❌ | ✅ (with dashboard) |
| HTTP API | ❌ | ✅ (optional) |
| Digest-based change detection | ❌ | ✅ |
| Registry polling with jitter & cache | ❌ | ✅ |
| Mobile-responsive dashboard | ❌ | ✅ |
