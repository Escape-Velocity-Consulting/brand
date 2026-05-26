# Mount request: `/app/state` for brand-mcp

**Container:** `brand-mcp`
**In-container path:** `/app/state`
**Required env var:** `MCP_STATE_DIR=/app/state`

## What we'll write there

Two small JSON files:

| File | Purpose | Size budget |
|---|---|---|
| `sessions.json` | MCP session-ID registry. Lets clients reconnect after a redeploy without renegotiating a new session. | <100KB realistically — one record per active session, pruned by TTL. |
| `refresh-tokens.json` | OAuth refresh-token store (SHA-256 hashed at rest, never raw tokens). 30-day TTL per token, pruned on read. Single-tenant today. | <100KB realistically — one record per active client connection, pruned by TTL. |

**Total disk footprint:** tiny — <1MB even with very generous projections. No growth concerns.

## Why it needs to survive a redeploy

Without persistence, every `git push` to brand main wipes `refresh-tokens.json`. Claude Desktop's stored refresh token then 400s on the next refresh attempt, forcing a full re-OAuth dance (Google consent screen + DCR re-registration). That's the disconnect symptom we hit twice on 2026-05-26.

With persistence, redeploys are silent — the refresh token issued before the deploy still works after.

## Permissions

Container runs as `appuser:appgroup` (system user, UID auto-assigned by `useradd -r`). To get the exact UID:

```bash
docker exec brand-mcp id appuser
```

…then chown the host directory accordingly. Same pattern as `/app/published`.

## Code side (already shipped)

`src/mcp/server-http.ts` now reads `MCP_STATE_DIR`. Default falls back to `MCP_TMP_DIR` so dev/test stays unchanged. `mkdirSync(stateDir, { recursive: true })` runs at boot, so first-deploy-after-mount works regardless of whether the host dir is empty.

## What I need from you

1. Create a host directory (e.g. `/mnt/pd/data/brand-mcp-state/`).
2. `chown` it to the UID from `docker exec brand-mcp id appuser`.
3. Bind-mount it into the container at `/app/state`.
4. Set `MCP_STATE_DIR=/app/state` in the container's env.

After that, the next redeploy will silently preserve sessions and refresh tokens. I'll verify by watching the startup log line — it now includes `state_dir=...` and `state_persistent=true` when the env var is set.

Question if it helps you: should we also move `/tmp/brand-mcp` (artifacts, 1h TTL) onto a host volume? Probably not — they're designed to expire and tmpfs is appropriate. Just confirming you're happy with that staying ephemeral.
