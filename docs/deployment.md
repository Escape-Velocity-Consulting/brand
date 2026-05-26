# Deployment

The brand MCP server is containerized via `Dockerfile` and deployed by `.github/workflows/deploy-mcp.yml` to the production VM at `mcp.escapevelocity.consulting`. The Brand Site distribution is published separately as a git submodule that the website repo consumes.

This doc covers the MCP container side and the storage tiers that gate persistence.

## Storage tiers

The deployment platform runs **three storage tiers**. Knowing which is which avoids the disconnect we hit in May 2026 (sessions + refresh tokens were on tmpfs → every redeploy wiped them → clients forced to re-OAuth).

| Tier | Example paths | Survives restart? | Survives redeploy? | Use for |
|---|---|---|---|---|
| **In-container** | anywhere not mounted, e.g. `/app/cache` | ✅ | ❌ | nothing we care about across deploys |
| **tmpfs `/tmp`** | `/tmp/brand-mcp` (artifacts) | ❌ | ❌ | scratch within one request; short-TTL artifacts that are designed to expire |
| **Host-mounted volume** | `/app/published`, `/app/state` | ✅ | ✅ | anything we must hand off across deploys |

The `VOLUME` directive in `Dockerfile` is **not** sufficient — it creates an anonymous Docker volume that disappears on container recreation. Persistence only works when the sysadmin wires a host bind mount in `deploy-service brand-mcp` (or wherever the container is launched).

### What lives where in prod

| Env var | Container path | Tier | What's inside |
|---|---|---|---|
| `MCP_TMP_DIR` | `/tmp/brand-mcp` | tmpfs | Artifact files (PNG/PDF outputs) + bundle manifests. 1h TTL by design — fine to lose on redeploy. |
| `MCP_STATE_DIR` | `/app/state` | host volume | `sessions.json` + `refresh-tokens.json`. **Must survive redeploys** so clients don't re-OAuth. |
| `MCP_PUBLISHED_DIR` | `/app/published` | host volume | Promoted bundles served at stable `/api/published/<id>` URLs. **Must survive redeploys** to keep the Brand Site populated. |

### Adding a new persistent path

Before writing any data, ask: must this survive a redeploy?

- **No** → use `MCP_TMP_DIR` (tmpfs) or anywhere in the container.
- **Yes** → request a new mount from the sysadmin with the in-container path and the env var you'll read. They wire the bind mount + chown to match the container UID. **Do not rely on `VOLUME` in the Dockerfile.**

Current host-side wiring (May 2026):

```
/mnt/pd/data/brand-mcp-published  →  /app/published       (chown 999:999)
/mnt/pd/data/brand-mcp-state      →  /app/state           (chown 999:999)
```

## Dockerfile

`Dockerfile` is multi-stage on `mcr.microsoft.com/playwright:v1.50.0-jammy`. Build context excludes everything in `.dockerignore` (tests, site, kit sources, etc.). Image runs as non-root user `appuser` (UID/GID 999), exposes 8080, includes a HEALTHCHECK on `/health`.

```
CMD ["node", "dist/src/mcp/server-http.js"]
```

The Dockerfile declares `VOLUME ["/app/published"]` — purely documentary. The actual bind mount is done by `deploy-service brand-mcp` at runtime.

## CI workflow

`.github/workflows/deploy-mcp.yml` triggers on `push` to `main` when MCP-relevant paths change:

```
src/, templates/, fonts/, components/, tokens.ts, tokens.css,
package.json, package-lock.json, tsconfig.mcp.json,
scripts/build-tokens.ts, Dockerfile, .dockerignore,
.github/workflows/deploy-mcp.yml
```

Pipeline:

1. **build & push** — Docker build, pushed to `ghcr.io/escape-velocity-consulting/brand-mcp` with tags `:main`, `:prod`, `:sha-<short>`.
2. **deploy** — gated by repo variable `MCP_DEPLOY_ENABLED == "true"`. SSHes via IAP to the GCP VM and runs `sudo /usr/local/bin/deploy-service brand-mcp` (admin's script). Needs `GCP_SA_KEY` secret.

CVE scanning is **client-side only** (pre-push hook — see § Local Trivy check below). The workflow no longer runs Trivy.

To enable deploy: set repo variable `MCP_DEPLOY_ENABLED` = `true` (Settings → Variables → Actions) once the admin has provisioned the service.

The [CI Monitoring Rule](rules.md#ci-monitoring-rule) requires watching every triggered run until it completes.

## Admin-coordinated tasks

The brand repo defines the *container* and the *code*. The admin owns the *deployment* — host paths, volume mounts, service config, reverse-proxy, DNS. Three things require admin coordination:

### 1. Host volume mounts (one-time per env var)

For each persistent path (`MCP_STATE_DIR`, `MCP_PUBLISHED_DIR`, and any future ones):

```bash
# Admin runs once on the host:
sudo mkdir -p /mnt/pd/data/brand-mcp-state
sudo chown 999:999 /mnt/pd/data/brand-mcp-state

# Edit /usr/local/bin/deploy-service (or systemd unit / compose file) to add:
docker run \
  -v /mnt/pd/data/brand-mcp-state:/app/state \
  -e MCP_STATE_DIR=/app/state \
  -v /mnt/pd/data/brand-mcp-published:/app/published \
  -e MCP_PUBLISHED_DIR=/app/published \
  ... ghcr.io/escape-velocity-consulting/brand-mcp:prod
```

### 2. Caddyfile CSP for the website

`/brand/decks/` on `escapevelocity.consulting` fetches from `mcp.escapevelocity.consulting/api/published`. The website's Caddy config must allow that origin in `connect-src` + `img-src`:

```caddyfile
header Content-Security-Policy "
  ...existing directives...
  connect-src 'self' ... https://mcp.escapevelocity.consulting;
  img-src 'self' data: ... https://mcp.escapevelocity.consulting;
  ...
"
```

Reload Caddy after the change: `sudo systemctl reload caddy`.

### 3. Reading prod logs

```bash
gcloud compute ssh web-server --zone=us-central1-a --tunnel-through-iap \
  --command="sudo /usr/local/bin/service-logs brand-mcp 500" \
  --configuration=brand-mcp
```

The gcloud configuration setup is in `business/CLAUDE.md` § Server Access — Brand MCP. The log format is documented in [troubleshooting.md § Diagnostic logging](troubleshooting.md#diagnostic-logging).

## Local Trivy check

CVE scanning runs **client-side** via a `pre-push` hook on the brand repo. CI no longer runs Trivy — if you can push, the scan has either passed or been explicitly skipped.

**Run manually:** `npm run scan:fs` — invokes `trivy fs` with the same severity (`HIGH,CRITICAL`), `--ignore-unfixed`, and `.trivyignore` settings the workflow used to use.

**Hook wiring:** `simple-git-hooks` (declared in `package.json`) installs `scripts/hooks/pre-push.sh` into `.git/hooks/` on `npm install` via the `prepare` script. The hook:

- Detects MCP-relevant changes in the pushed range (same path globs as `deploy-mcp.yml` triggers); skips silently otherwise.
- Calls `scripts/hooks/trivy-fs.sh` which exits 1 on findings.
- Honors `SKIP_TRIVY=1` env var as an escape hatch (prints a warning).
- Fails with an install hint if `trivy` is missing — `scoop install trivy` or `winget install AquaSecurity.Trivy`.

**Tradeoff:** `trivy fs` scans dependencies (`package-lock.json`), not the built image. Base-image CVEs from `mcr.microsoft.com/playwright:v1.50.0-jammy` are not covered. When bumping the Playwright base in `Dockerfile`, manually run `trivy image` against a local build (requires Docker) or accept the risk and rely on monitoring after deploy.

## See also

- [mcp-server.md](mcp-server.md) — what the container actually runs
- [publishing.md](publishing.md) — what `MCP_PUBLISHED_DIR` stores
- [troubleshooting.md](troubleshooting.md) — diagnosing deploy + runtime issues
- [rules.md § CI Monitoring Rule](rules.md#ci-monitoring-rule) — what to do after a push
