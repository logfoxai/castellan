# Dashboard

Served at `/` when `CASTELLAN_API_ENABLED` and `CASTELLAN_DASHBOARD_ENABLED` are both `true` (the default). Use this for day-to-day ops; use the [Castellan CLI](./cli.md) when CI or scripts need a settle gate.

- Live service status with watched **tag** and `repository:tag`; digests and **past deployments** in expandable details.
- **Deploy** and **Reject** actions per deployment digest (in the service manage dialog); per-service **Auto / Manual** badges.
- **Check now** and **Pause all / Resume all** controls.
- Docker container table with live CPU, memory, disk usage, state, and one-click log viewing.
- Deployment / rollback / failure history timeline.
- **No login screen** — open the URL on your private network (see [Security](./security.md)).
- Light and dark mode with system preference detection.

![Castellan dashboard](/screenshot.png)

Disable the dashboard for API-only or headless modes — see [Operating modes](./operating-modes.md).
