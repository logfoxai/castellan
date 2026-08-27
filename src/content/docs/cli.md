# Castellan CLI

For automation, prefer the official **[Castellan CLI](https://github.com/logfoxai/castellan-cli)** over raw HTTP. Day-to-day ops stay in the [dashboard](./dashboard.md); use the CLI when a script or CI job needs a hard gate.

```bash
npm install -g castellan-cli

export CASTELLAN_URL=http://castellan.example:8443
export CASTELLAN_AUTH_TOKEN=…

castellan watch api-service          # check registry + wait until settle (CI gate)
castellan status                     # one-shot snapshot
castellan check                      # kick a registry check; do not wait
```

`watch` asks Castellan to check now (unless `--no-force-check`), streams progress, and exits **0** only when watched services land on a new digest healthy — **1** on failure, rollback, or timeout.

## CI example

```yaml
- run: |
    npm install -g castellan-cli
    castellan watch api-service
  env:
    CASTELLAN_URL: http://castellan.internal:8443
    CASTELLAN_AUTH_TOKEN: ${{ secrets.CASTELLAN_AUTH_TOKEN }}
```

Full reference: [logfoxai/castellan-cli](https://github.com/logfoxai/castellan-cli).
