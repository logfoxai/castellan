# Supported registries

Castellan polls registries with **`docker manifest inspect`** and deploys by **pulling `@digest`**, retagging the rolling tag, then **`docker compose up`**. Registry auth comes from the host Docker config.

| Registry | Host in image ref | Authentication on the host |
|---|---|---|
| **Amazon ECR** | `{account}.dkr.ecr.{region}.amazonaws.com` | `aws ecr get-login-password \| docker login …` (refresh before token expiry, ~12h) |
| **Docker Hub** | `docker.io` | `docker login` for private repos; public images need no login |
| **GitHub Container Registry** | `ghcr.io` | `docker login ghcr.io` for private repos |
| **Other OCI Distribution v2** | any host | `docker login <registry>` |

## Private registry credentials

Run **`docker login`** on the host. Castellan needs the Docker socket plus a **read-only mount of the host Docker config directory**:

```yaml
castellan:
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
    - /root/.docker:/root/.docker:ro
```

On non-root hosts, mount `${HOME}/.docker` instead of `/root/.docker`.

For **ECR**, tokens expire. Schedule periodic login on the host:

```bash
aws ecr get-login-password --region us-east-2 \
  | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-2.amazonaws.com
```

Public images on Docker Hub or GHCR work without login.
