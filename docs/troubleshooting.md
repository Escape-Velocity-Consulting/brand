# Troubleshooting

Common failure modes mapped to log signatures + fixes. The MCP server emits structured `key=value` logs to stderr; this doc explains the vocabulary and walks the most common ways things go wrong.

## Reading prod logs

```bash
gcloud compute ssh web-server --zone=us-central1-a --tunnel-through-iap \
  --command="sudo /usr/local/bin/service-logs brand-mcp 500" \
  --configuration=brand-mcp
```

Replace `500` with the number of lines you want. The gcloud configuration setup is in `business/CLAUDE.md` § Server Access — Brand MCP.

## Diagnostic logging

All MCP-HTTP events are logged to **stderr** in a structured key=value format. The prefix is always `[escape-velocity-brand MCP/http]`; the rest is a sequence of `key=value` pairs. Strings containing whitespace or `=` are double-quoted. Designed for `grep`, not `jq`.

```
[escape-velocity-brand MCP/http] evt=oauth_token_issued sub=tommi.enenkel@gmail.com client_id=cli_abcd… expires_in_s=3600 refresh_token_issued=true
[escape-velocity-brand MCP/http] evt=auth_ok sub=tommi.enenkel@gmail.com legacy=false exp=1735678800 ttl_remaining_s=3559 path=/mcp
[escape-velocity-brand MCP/http] evt=jwt_reject reason=verify_failed err="\"exp\" claim timestamp check failed" sub_claimed=tommi.enenkel@gmail.com exp_claimed=1735675200 expired=true path=/mcp
```

### Event vocabulary

| Subsystem | `evt=` | Key fields | When |
|---|---|---|---|
| Startup | `startup` | `host`, `port`, `brand_dir`, `store_dir`, `published_dir`, `jwt`, `legacy_bearer`, `oauth`, `allowlist_emails`, `refresh_ttl_s`, `log_ip`, `artifact_files`, `artifact_bytes` | HTTP listener bound. |
| Startup | `shutdown` | `signal` | SIGINT / SIGTERM received. |
| Sessions | `session_create` | `sid`, `total_sessions` | New session initialized via `/mcp` POST init. |
| Sessions | `session_close` | `sid`, `total_sessions` | Transport closed (client DELETE or remote disconnect). |
| Sessions | `session_restore` | `sid` | Persisted session re-created at boot. |
| Sessions | `session_restore_fail` | `sid`, `err` | Pre-create on boot threw. |
| Sessions | `startup_sessions_restored` | `count` | Summary at boot. |
| Sessions | `session_prune` | `pruned`, `live` | Expired session records dropped from disk. |
| Sessions | `session_persist_fail` | `err`, `file` | Writing sessions.json failed. |
| Sessions | `session_delete_request` | `sid`, `email` | Client DELETE `/mcp`. |
| Auth | `auth_missing` | `path`, `method`, `ua`, `ip` | No `Authorization` header. |
| Auth | `auth_ok` | `sub`, `legacy`, `exp`, `ttl_remaining_s`, `path`, `ip` | JWT or legacy bearer accepted. |
| Auth | `jwt_reject` | `reason=<missing_sub\|allowlist_miss\|verify_failed>`, `err`, `sub_claimed`, `exp_claimed`, **`expired`**, `path`, `ua`, `ip` | JWT failed. `expired=true` is the smoking gun for the 1h-TTL hypothesis. |
| Auth | `auth_reject` | `reason=unknown_token`, `looked_like_jwt`, `path`, `ua`, `ip` | Bearer present but not a JWT and not the legacy token. |
| Auth | `jwt_issue` | `sub`, `ttl_s`, `exp` | Access token minted. |
| OAuth | `oauth_authorize` | `flow_id`, `client_id`, `redirect_uri_host` | `/authorize` accepted; redirecting to Google. |
| OAuth | `oauth_authorize_reject` | `reason=<bad_response_type\|missing_client_id\|missing_redirect_uri\|missing_pkce\|bad_pkce_method\|unknown_client\|redirect_uri_mismatch>`, `client_id` | `/authorize` validation failed. |
| OAuth | `oauth_callback_reject` | `reason=<google_returned_error\|missing_code_or_state\|flow_unknown_or_expired\|google_token_exchange_failed\|google_no_id_token\|google_idtoken_invalid\|missing_email\|email_unverified\|allowlist_miss>`, …context | `/oauth/google/callback` failed. |
| OAuth | `oauth_code_issued` | `sub`, `flow_id`, `code`, `ttl_s` | Our short-lived auth code minted. |
| OAuth | `oauth_token_reject` | `reason=<unsupported_grant_type\|invalid_request\|unknown_code\|expired\|redirect_uri_mismatch\|client_id_mismatch\|pkce_fail>`, `grant`, `code`, `sub` | `/token` rejected. |
| OAuth | `oauth_token_issued` | `sub`, `client_id`, `expires_in_s`, `refresh_token_issued`, `grant?` | Access token returned. |
| OAuth | `oauth_client_registered` | `client_id`, `client_name`, `redirect_uris_count` | DCR client registered via `/register`. |
| Refresh | `refresh_issue` | `sub`, `rt_id`, `ttl_s` | Refresh token issued (alongside an access token). |
| Refresh | `refresh_consume_ok` | `sub`, `old_rt_id`, `new_rt_id` | Refresh accepted; rotated. |
| Refresh | `refresh_consume_reject` | `reason=<unknown_or_expired\|allowlist_miss>`, `sub`, `rt_claimed_id` | Refresh denied. |
| Refresh | `refresh_prune` | `pruned`, `live` | Expired refresh tokens dropped from disk on boot. |
| HTTP | `mcp_request` | `sid`, `email`, `is_init` | POST `/mcp` routed. |
| HTTP | `mcp_stream_open` | `sid`, `email` | GET `/mcp` SSE stream opened. |
| HTTP | `mcp_session_404` | `sid_claimed`, `had_header`, `email`, `verb`, `is_init?` | Client presented stale or missing session ID. **Second key diagnostic** — fires even when the JWT is fresh. |
| HTTP | `http_404` / `http_405` / `http_500` | `path`, `method`, `err?` | Generic failures. |
| HTTP | `artifact_404` | `token`, `reason` | `/artifacts/<token>` lookup failed. |

### Redaction rules

- **Never logged:** raw tokens (access, refresh, auth code), `Authorization` headers, client secrets, Google ID tokens, `Error.stack` (file paths leak).
- **`sub` (email) IS logged.** It's the join key for tracing one client through the OAuth flow + JWT validation + session lifecycle. Single-tenant server today — internal data only.
- **Opaque IDs truncated to 8 chars + `…`** (session IDs, OAuth flow IDs, auth codes, refresh-token hashes). Enough to correlate within a log window, not enough to replay.
- **IPs default OFF** (`MCP_LOG_IP=none`). Opt-in to `truncated` (/16 IPv4, /48 IPv6) or `full`.
- **User-Agent truncated to 80 chars.**

---

## Common failure modes

### Token refresh broken

**Symptom:** Connector reports "user's connection to this connector was invalidated" in Claude Desktop mid-conversation. Clients keep needing to re-OAuth.

**Logs to look for:**

```
evt=jwt_reject reason=verify_failed err="..." expired=true ...
```

Without a subsequent `evt=refresh_consume_ok` line for the same `sub`. That means the client *should* have refreshed but didn't (or the refresh was rejected).

**Diagnosis:**

```bash
gcloud ... --command="sudo /usr/local/bin/service-logs brand-mcp 500" | grep -E 'jwt_reject|refresh_'
```

If you see `refresh_consume_reject reason=unknown_or_expired`, the refresh token wasn't in the store. That points at the store being wiped.

**Root cause (May 2026):** `refresh-tokens.json` was on tmpfs — every redeploy wiped it. Fix: mount a host volume for `MCP_STATE_DIR`. See [deployment.md § Storage tiers](deployment.md#storage-tiers).

**Healthy example trace:**

```
evt=jwt_reject reason=verify_failed err="\"exp\" claim timestamp check failed" expired=true ...
evt=refresh_consume_ok sub=...@gmail.com old_rt_id=h4a5s6h7… new_rt_id=k1l2m3n4…
evt=refresh_issue sub=...@gmail.com rt_id=k1l2m3n4… ttl_s=2592000
evt=jwt_issue sub=...@gmail.com ttl_s=3600 exp=...
evt=oauth_token_issued sub=...@gmail.com ... grant=refresh_token
evt=auth_ok sub=...@gmail.com legacy=false ttl_remaining_s=3599 path=/mcp
```

### Sessions wiped on redeploy

**Symptom:** Clients see `mcp_session_404` immediately after a deploy, then everything works after reconnect. Annoying but recoverable.

**Logs:**

```
evt=mcp_session_404 sid_claimed=596020d0… had_header=true email=...@gmail.com verb=POST is_init=false
```

**Root cause:** Same as refresh tokens — `sessions.json` was on tmpfs.

**Fix:** Same as above — mount `MCP_STATE_DIR` to a host volume.

**Detection:** If you see `mcp_session_404` immediately after a `startup` event for the same email, it's the redeploy pattern. If you see it sporadically (not clustered around startup), the client is just stale — that's expected behavior, the 404 tells compliant clients to drop the stale ID and reinitialize.

### Brand Site can't fetch published items

**Symptom:** `/brand/decks/` on `escapevelocity.consulting` shows the loading state forever, then "Could not load published decks." Browser console shows `Refused to connect to ...` or `Refused to load image ...`.

**Root cause:** CSP on the website host blocks `mcp.escapevelocity.consulting`. The Brand Site fetches cross-origin; without `connect-src` + `img-src` allowlist entries, the browser refuses.

**Fix:** Update the Caddyfile on the website host. See [deployment.md § Caddyfile CSP for the website](deployment.md#2-caddyfile-csp-for-the-website).

**Verify:**

```bash
curl -sI https://escapevelocity.consulting/brand/decks/ | grep -i content-security
# Must include https://mcp.escapevelocity.consulting in connect-src + img-src
```

### Published items disappear

**Symptom:** Yesterday's published deck is gone today. `GET /api/published?type=deck` returns `{"items":[],"count":0}` after a known publish.

**Root cause:** `MCP_PUBLISHED_DIR` isn't mounted to a host volume. The default `/app/published` is container-ephemeral; a redeploy wipes it.

**Fix:** Wire the host volume mount. See [deployment.md § Storage tiers](deployment.md#storage-tiers).

**Detection:**

```
evt=startup ... published_dir=/app/published ...
```

…doesn't tell you whether the dir is mounted. To check, exec into the container:

```bash
docker exec brand-mcp mount | grep /app/published
# Should show a bind mount line; nothing = ephemeral
```

Or check from the host:

```bash
ls -la /mnt/pd/data/brand-mcp-published/
# Should show subdirs for every published item
```

### Template hardcoded tokens

**Symptom:** Changed a token in `tokens.ts`, ran `build:tokens`, but a specific template's render still shows the old color.

**Root cause:** The template hardcodes the color or font instead of using `var(--color-…)` / `var(--font-…)`. Violates the [Token-Sourcing Rule](rules.md#token-sourcing-rule).

**Fix:**

1. Grep the template for the literal hex / font name:

   ```bash
   grep -E '#[0-9A-Fa-f]{6}|Space Grotesk|Inter\b' templates/<key>.html
   ```

2. Replace with `var(--…)` references. Ensure `{{ TOKENS_CSS | safe }}` is in the template's `<style>` block.

3. Verify: flip the token value, re-render, confirm the new value appears in the output, revert.

### CI didn't fire

**Symptom:** Pushed a change to MCP-relevant paths but no workflow run shows up in GitHub Actions.

**Diagnosis:**

```bash
gh run list --repo Escape-Velocity-Consulting/brand --limit 5
gh api repos/Escape-Velocity-Consulting/brand/actions/runs?head_sha=<your-sha> --jq '.total_count'
```

If `total_count` is 0 after 2+ minutes:

1. Verify the push reached `origin/main`:
   ```bash
   git -C brand log origin/main -1 --oneline
   ```
2. Check workflow file path globs (`deploy-mcp.yml` → `on.push.paths`). Did your change touch any matching path?
3. Try manual dispatch:
   ```bash
   gh workflow run deploy-mcp.yml --repo Escape-Velocity-Consulting/brand --ref main
   ```
   If this returns HTTP 500, it's a transient GH Actions issue. Try via the Actions UI in a browser.
4. Check repo Actions permissions:
   ```bash
   gh api repos/Escape-Velocity-Consulting/brand/actions/permissions --jq '{enabled, allowed_actions}'
   # enabled=true, allowed_actions=all is correct
   ```

The CI Monitoring Rule applies — don't declare a push "done" until the run passes.

---

## Healthy-trace examples

For comparison when reading logs:

### Healthy OAuth + first /mcp call

```
evt=oauth_authorize flow_id=a1b2c3d4… client_id=cli_xyz1… redirect_uri_host=claude.ai
evt=oauth_code_issued sub=tommi.enenkel@gmail.com flow_id=a1b2c3d4… code=q9w8e7r6… ttl_s=60
evt=jwt_issue sub=tommi.enenkel@gmail.com ttl_s=3600 exp=1735682400
evt=refresh_issue sub=tommi.enenkel@gmail.com rt_id=h4a5s6h7… ttl_s=2592000
evt=oauth_token_issued sub=tommi.enenkel@gmail.com client_id=cli_xyz1… expires_in_s=3600 refresh_token_issued=true
evt=auth_ok sub=tommi.enenkel@gmail.com legacy=false exp=1735682400 ttl_remaining_s=3598 path=/mcp
evt=mcp_request email=tommi.enenkel@gmail.com is_init=true
evt=session_create sid=af020fb6… total_sessions=1
```

### Expired-token + silent refresh

```
evt=jwt_reject reason=verify_failed err="\"exp\" claim timestamp check failed" expired=true ...
evt=refresh_consume_ok sub=tommi.enenkel@gmail.com old_rt_id=h4a5s6h7… new_rt_id=k1l2m3n4…
evt=refresh_issue sub=tommi.enenkel@gmail.com rt_id=k1l2m3n4… ttl_s=2592000
evt=jwt_issue sub=tommi.enenkel@gmail.com ttl_s=3600 exp=1735686000
evt=oauth_token_issued sub=tommi.enenkel@gmail.com client_id=cli_xyz1… expires_in_s=3600 refresh_token_issued=true grant=refresh_token
evt=auth_ok sub=tommi.enenkel@gmail.com legacy=false ttl_remaining_s=3599 path=/mcp
```

If you see `jwt_reject expired=true` without a subsequent `refresh_consume_ok` (or with `refresh_consume_reject`), the client never tried to refresh — that's the broken case to debug.

## See also

- [mcp-server.md](mcp-server.md) — the server emitting these logs
- [deployment.md § Storage tiers](deployment.md#storage-tiers) — the persistence model that fixes the refresh/session issues
- [publishing.md](publishing.md) — the flow that needs `MCP_PUBLISHED_DIR` mounted
