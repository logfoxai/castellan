# Tags and versions

Each managed service watches **exactly one registry tag**. Deployments fire when the **digest** at that tag changes, not when the tag string changes.

| Concept | Meaning |
|---|---|
| **Tag** | Registry label to poll — e.g. `staging`, `production`, `latest`, `v1.2.3` |
| **Digest** | Immutable `sha256:…` content hash of the image currently at that tag |
| **Deploy trigger** | Tag now points at a different digest (CI pushed a new build to the same tag) |

The tag is inferred from each labeled container's image ref — e.g. `ghcr.io/myorg/api:staging` watches `staging` on `ghcr.io/myorg/api`.

## CI and rolling tags

Many teams publish environment tags from CI — push `myorg/api-service:staging` on every merge to main. Castellan watches that tag and redeploys when the digest changes.

After CI pushes the image, use the **[Castellan CLI](./cli.md)** so the job asks Castellan to check now **and** waits until the rollout settles:

```yaml
- run: |
    npm install -g castellan-cli
    castellan watch api-service
  env:
    CASTELLAN_URL: http://castellan.example:8443
    CASTELLAN_AUTH_TOKEN: ${{ secrets.CASTELLAN_AUTH_TOKEN }}
```

Set `CASTELLAN_POLL_ENABLED=false` if you only want CI-triggered deploys (no periodic polling).

## Choosing tags

- **Environment tags** (`staging`, `production`) — one rolling tag per environment; CI retags on each deploy.
- **Version tags** (`v1.2.3`) — pin a host to a release; change the running image tag on the compose service to promote.
- **`latest`** — fine for dev; risky in production unless you accept surprise updates.

Each labeled service watches **one tag** (from its running image). To track multiple tags for the same repository, run separate compose services with different image tags.
