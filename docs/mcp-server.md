# MCP server

The rendering core (`src/core/`) is exposed as an MCP server with two transports sharing the same tool surface:

- **`src/mcp/server.ts`** — stdio entrypoint. Used for local dev (Claude Code spawns it as a subprocess).
- **`src/mcp/server-http.ts`** — Streamable HTTP entrypoint. Used for remote deployment (containerized, behind a reverse proxy).

Both call `src/mcp/shared/createServer.ts` to register tools. They differ in:

- **OutputSink:** stdio writes files to the caller's CWD (`LocalOutputSink`); HTTP writes to an artifact store and returns signed download URLs (`RemoteOutputSink`).
- **Tool surface:** HTTP gets the 3 publish-flow tools (`publish_artifact`, `unpublish_artifact`, `list_published`) because they need persistent storage. Stdio omits them.

A single Chromium instance stays warm across calls (~600ms per render vs ~2–3s cold).

## Tools (9)

### Render (both transports)

| Tool | What it does |
|------|--------------|
| `render_template`     | Named template + Nunjucks vars (+ optional markdown body) → PNG or PDF. Output format driven by the template registry ([templates.md](templates.md)). |
| `render_html_to_png`  | Raw HTML string → 1 PNG. Generic primitive for ad-hoc designs / mutated templates. |
| `render_html_to_pdf`  | Raw HTML string → 1 PDF. Playwright auto-paginates long HTML; supports A4/A3/Letter or custom `{width,height}` pixel dims. |
| `render_slides`       | N pages → toggleable `{viewer, pdf, pngs}`. Two input modes: `markdown` (presentation-style with `===` separators) or `pages` (carousel-style explicit HTML/template per slide). On HTTP transport, multi-file output is grouped into a bundle (returns `bundleId`). Pass `persist: true` to publish in one step. |

### Publishing (HTTP transport only)

| Tool | What it does |
|------|--------------|
| `publish_artifact`    | Promote a bundleId from the ephemeral artifact store to the persistent published store. Returns the new published ID + stable URL. |
| `unpublish_artifact`  | Remove a published item by ID. Idempotent. |
| `list_published`      | List published items, optionally filtered by `type`. Same data as `GET /api/published`. |

Full details: [publishing.md](publishing.md).

### Introspection (both transports)

| Tool | What it does |
|------|--------------|
| `list_templates`      | Returns the full template registry (output format, dims, required vars, tags) sourced from `templates.meta.ts`. Optional `tag` filter. |
| `get_tokens`          | Parsed `tokens.json`. |

## Tool response shape

All render tools return a `WriteResult`-shaped output that's transport-aware:

```jsonc
// stdio (LocalOutputSink)
{ "kind": "path", "path": "C:/.../letter.pdf", "filename": "letter.pdf",
  "bytes": 138779, "mime": "application/pdf" }

// HTTP (RemoteOutputSink)
{ "kind": "url",
  "url": "https://mcp.escapevelocity.consulting/artifacts/<token>",
  "filename": "letter.pdf",
  "expiresAt": "2026-05-25T15:30:00Z",
  "bytes": 138779, "mime": "application/pdf" }
```

Multi-output tools (`render_slides`) return nested objects of these (`{ viewer, pdf, pngs: [...] }`). `outputPath` is optional in both modes — local mode honors it (treated as the bundle root for multi-output), remote mode treats it as a filename hint for `Content-Disposition`.

## Architecture

- **`src/core/`** — pure-function rendering library. No `process.exit`, no CWD reads, no `console.log`. All FS lookups take an explicit `BrandPaths`. `BrowserPool` is the singleton chromium holder.
- **`src/mcp/shared/createServer.ts`** — registers all tools onto an `McpServer` given a `ServerContext` (paths + pool + outputSink + optionally publishedStore + publicBaseUrl).
- **`src/core/render.ts`** — generic `renderHtmlToPng` + `renderHtmlToPdf` primitives. Both auto-inject `FONTS_URI` + `TOKENS_CSS` and use the shared `BrowserPool`. All higher-level render paths delegate here.
- **`src/core/slides.ts`** — `renderSlides` multi-page orchestrator (markdown-deck mode + carousel-pages mode + output toggles).
- **`templates.meta.ts`** (brand root) — template registry: each entry declares output format, dims, body slot, required vars, and tags. Single source of truth for `list_templates` + `render_template` dispatching. See [templates.md](templates.md).
- **`src/mcp/shared/outputSinks.ts`** — `LocalOutputSink` (writeFileSync → path) and `RemoteOutputSink` (artifactStore.write → signed URL). The `RemoteOutputSink` also exposes `beginBundle`/`endBundle` for grouping multi-file renders — see [publishing.md § Bundle abstraction](publishing.md#bundle-abstraction).
- **`src/mcp/shared/artifactStore.ts`** — on-disk store + HMAC-signed token issuer (`signedToken.ts`) + periodic cleanup. Ephemeral by design.
- **`src/mcp/shared/bundleStore.ts`** — manifest of multi-file bundles, same TTL as the artifacts.
- **`src/mcp/shared/publishedStore.ts`** — persistent store of promoted bundles. See [publishing.md](publishing.md).
- **`src/mcp/shared/jwtAuth.ts`** — JWT issuance + validation. Issues HS256 tokens via `issueAccessToken`; `authenticate()` verifies them, re-checks `sub` against the runtime allowlist, and falls back to the legacy static bearer when present. Logs every auth event.
- **`src/mcp/shared/refreshTokenStore.ts`** — disk-backed refresh-token store at `<MCP_STATE_DIR>/refresh-tokens.json`. SHA-256-hashed at rest; `consume()` is atomic single-use (rotation). Persists across container restarts AND redeploys when `MCP_STATE_DIR` is wired to a host volume — see [deployment.md § Storage](deployment.md#storage-tiers).
- **`src/mcp/shared/sessionStore.ts`** — disk-backed session-ID store at `<MCP_STATE_DIR>/sessions.json`. Lets sessions survive container restarts and redeploys (when `MCP_STATE_DIR` is host-mounted). On boot, pre-creates `StreamableHTTPServerTransport` instances for every non-expired ID.
- **`src/mcp/shared/logger.ts`** — structured key=value stderr logger. See [troubleshooting.md § Diagnostic logging](troubleshooting.md#diagnostic-logging).
- **`src/mcp/tools/*.ts`** — one file per tool. Each tool: Zod input schema → call core → `ctx.outputSink.write(buffer, opts)` → return result via `runTool` / `successResult`.

## Routes (HTTP transport)

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /mcp` | `Authorization: Bearer <JWT-or-legacy-token>` | Streamable HTTP transport (stateful, per-session). |
| `GET /mcp` | same | SSE streaming for an existing session. |
| `DELETE /mcp` | same | Terminate a session. |
| `GET /artifacts/<token>` | signed URL only (HMAC + expiry encoded in token) | Download a rendered ephemeral artifact. |
| `GET /published/<id>/<file>` | none | Download a published file. Path-traversal guarded. See [publishing.md](publishing.md). |
| `GET /api/published[?type=]` | none | JSON listing of published items. CORS `*`. |
| `GET /api/published/<id>` | none | JSON metadata for one published item. |
| `GET /health` | none | Liveness probe (`{ "status": "ok" }`). |
| `GET /.well-known/oauth-protected-resource` | none | RFC 9728 — points clients at the AS. |
| `GET /.well-known/oauth-authorization-server` | none | RFC 8414 — AS metadata. |
| `GET /authorize` | none | OAuth code-flow entrypoint. Redirects to Google for user login. |
| `GET /oauth/google/callback` | none | Google calls back here; we mint our own auth code. |
| `POST /token` | none (PKCE) | Exchange `grant_type=authorization_code` (auth-code grant) or `grant_type=refresh_token` (rotating refresh) for a JWT access token. |
| `POST /register` | none | RFC 7591 Dynamic Client Registration. |

## OAuth (Google-delegated, embedded AS)

The MCP server is **both** the OAuth 2.1 resource server AND the authorization server, but it **delegates the actual user-login step to Google**. Flow:

1. Claude Desktop hits `GET /authorize` with PKCE challenge + Claude's `redirect_uri`.
2. We redirect the browser to Google's OAuth (`accounts.google.com`).
3. User signs into Google + consents.
4. Google redirects to `GET /oauth/google/callback`.
5. We exchange Google's code for an OIDC ID token, verify the signature against Google's JWKS, extract `email`, and check it against `MCP_ALLOWED_EMAILS`.
6. If the email is allowed, we issue **our own** auth code and redirect the browser back to Claude's `redirect_uri`.
7. Claude `POST /token`s with the code + PKCE verifier; we issue a **JWT** access token (HS256, signed with `MCP_JWT_SECRET`, 1h TTL) **plus a rotating refresh token** (opaque `rt_<32 bytes b64url>`, 30d TTL by default).
8. Claude calls `POST /mcp` with the JWT. We verify the signature, audience, expiry, and re-check the `sub` email against the allowlist on every request.
9. After ~1h the JWT expires. Claude silently `POST /token`s again with `grant_type=refresh_token`. We look up the refresh token by SHA-256 hash, atomically delete it (rotation = single-use), re-check the `sub` against the allowlist, then issue a fresh access token **and a fresh refresh token**. Claude transparently retries the failed `/mcp` request — the user sees no disconnect.

**Rotation semantics.** Refresh tokens are one-time-use. Each refresh issues a fresh token; the old one is gone. If a consumed refresh token is presented again, it just looks unknown (the record was deleted on consume).

Allowlist changes take effect on the next request OR the next refresh — no token revocation list needed.

### Google Cloud setup

1. Console → APIs & Services → Credentials → **Create OAuth 2.0 Client ID** (type: Web application).
2. Authorized redirect URI: `https://mcp.escapevelocity.consulting/oauth/google/callback`
3. Copy the **Client ID** and **Client Secret** → admin sets them as `MCP_OAUTH_GOOGLE_CLIENT_ID` and `MCP_OAUTH_GOOGLE_CLIENT_SECRET` on the container.
4. Add the owner's email to `MCP_ALLOWED_EMAILS` (comma-separated, lowercase).

## Env vars

Full list — see [deployment.md § Storage tiers](deployment.md#storage-tiers) for the persistence model and which env vars must point at host-mounted volumes.

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `BRAND_DIR` | yes | — | Absolute path to the brand repo root inside the container. |
| `MCP_SIGNING_SECRET` | yes | — | HMAC secret for artifact URLs. |
| `MCP_PUBLIC_BASE_URL` | yes | — | e.g. `https://mcp.escapevelocity.consulting`. Used as JWT iss/aud and for signed-URL building. |
| `MCP_JWT_SECRET` | yes (for OAuth) | — | HS256 secret for `/mcp` access tokens. Distinct from signing secret. |
| `MCP_OAUTH_GOOGLE_CLIENT_ID` | yes (for OAuth) | — | Google Cloud OAuth 2.0 Web Application client ID. |
| `MCP_OAUTH_GOOGLE_CLIENT_SECRET` | yes (for OAuth) | — | Matching client secret from Google Cloud. |
| `MCP_ALLOWED_EMAILS` | yes (for OAuth) | — | Comma-separated lowercase emails permitted to authenticate. Re-checked on every request. |
| `MCP_BEARER_TOKEN` | no (legacy / tests) | — | Legacy static bearer for the E2E test runner. One of `MCP_JWT_SECRET` or `MCP_BEARER_TOKEN` must be set. |
| `MCP_PORT` | no | `8080` | Listen port. |
| `MCP_BIND_HOST` | no | `0.0.0.0` | Listen host. |
| `MCP_TMP_DIR` | no | `<os.tmpdir>/brand-mcp` | **Ephemeral** artifact store + bundle manifests. Fine on tmpfs. |
| `MCP_STATE_DIR` | no | falls back to `MCP_TMP_DIR` | **Persistent** state directory for `sessions.json` + `refresh-tokens.json`. **Mount a host volume here in production.** See [deployment.md](deployment.md). |
| `MCP_PUBLISHED_DIR` | no | `<os.tmpdir>/brand-mcp-published` (container default: `/app/published`) | **Persistent** published-items directory. **Mount a host volume here in production.** See [publishing.md](publishing.md). |
| `MCP_ARTIFACT_TTL_SECONDS` | no | `3600` | Signed-URL TTL. |
| `MCP_CLEANUP_INTERVAL_SECONDS` | no | `300` | Cleanup-loop cadence. |
| `MCP_ALLOWED_ORIGINS` | no | (empty) | Optional comma-separated browser-Origin allowlist (DNS-rebinding defense). |
| `MCP_REFRESH_TOKEN_TTL_SECONDS` | no | `2592000` (30 days) | Refresh-token lifetime. |
| `MCP_LOG_IP` | no | `none` | Controls client-IP logging. `none` = drop IPs (DSGVO-safe default), `truncated` = /16 for IPv4 + /48 for IPv6, `full` = log as-is. |

## Registering the MCP server

One-time setup per workstation. **The skill assumes the escape-velocity-brand MCP server is registered.** Pick the option matching your client.

### Claude Desktop — OAuth via UI (recommended)

1. Open **Settings → Connectors → Add custom connector**.
2. Name: `escape-velocity-brand` (or whatever you prefer locally).
3. Remote MCP server URL: `https://mcp.escapevelocity.consulting/mcp`
4. Leave OAuth Client ID and Client Secret fields **blank** — Claude Desktop will self-register via Dynamic Client Registration (RFC 7591).
5. Click **Add**. Claude Desktop will open a browser tab → Google login → consent → redirect back. The connector becomes available.

Only emails in `MCP_ALLOWED_EMAILS` on the server can log in.

### Claude Code — OAuth (preferred)

```bash
claude mcp add --transport http escape-velocity-brand \
  https://mcp.escapevelocity.consulting/mcp
```

(No bearer header needed — Claude Code's OAuth helper will discover the AS via the `WWW-Authenticate` response and walk the flow.)

### Claude Code — legacy static bearer (during OAuth transition)

While `MCP_BEARER_TOKEN` is still active on the server (for the test runner), you can short-circuit with:

```bash
claude mcp add --transport http escape-velocity-brand \
  https://mcp.escapevelocity.consulting/mcp \
  --header "Authorization: Bearer $MCP_BEARER_TOKEN"
```

This will stop working once the legacy bearer is removed.

### Claude Code — local stdio (dev)

For working against unpushed brand-repo changes:

```json
{
  "mcpServers": {
    "escape-velocity-brand": {
      "command": "npx",
      "args": ["tsx", "C:/Users/tommi/business/brand/src/mcp/server.ts"],
      "env": { "BRAND_DIR": "C:/Users/tommi/business/brand" }
    }
  }
}
```

For packaged use: `npm run build:mcp` → point at `node dist/src/mcp/server.js`.

## See also

- [publishing.md](publishing.md) — the publish/unpublish flow built on top of the MCP
- [deployment.md](deployment.md) — Dockerfile, CI workflow, storage tiers
- [testing.md](testing.md) — E2E + unit suites
- [troubleshooting.md](troubleshooting.md) — logging vocabulary + common failures
