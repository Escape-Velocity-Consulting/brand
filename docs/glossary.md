# Glossary

Use these terms consistently — they have specific meanings in this repo.

## System layers

| Term | Meaning |
|---|---|
| **Brand System** | This `brand/` repo as a whole: tokens, templates, generators, site source, MCP server, skill. |
| **Brand Tokens** | `tokens.ts` → `tokens.css` + `tokens.json`. Single source of truth for color, type, spacing. See [`BRAND_SPEC.md`](../BRAND_SPEC.md) §13. |
| **Brand Templates** | `templates/*.html` — document/social/carousel/presentation templates rendered by generators. Not the same as Brand Site Nunjucks templates (`site/*.njk`). |
| **Brand Generators** | `generators/` — `pdf.ts`, `image.ts`, `carousel.ts`, `presentation.ts`. Thin CLI shims over the rendering core. See [generators.md](generators.md). |
| **Rendering Core** | `src/core/` — pure-function library (no `process.exit`, no CWD assumptions, shared `BrowserPool`). The single source of truth for render logic, used by both CLI shims and the MCP server. See [architecture.md](architecture.md). |
| **Brand Assets** | Logos, fonts, generated PNGs, QR codes — anything that ships as a file under `assets/`. |

## Outputs

| Term | Meaning |
|---|---|
| **Brand Site** | The multi-page reference at `/brand/` (overview, identity, components, documents, social, presentations, decks, workflow, download, press). Built from `site/`. Viewable standalone at `localhost:3000/brand/` and embedded on the live website. See [brand-site.md](brand-site.md). |
| **Brand Distribution** | `dist/site/` — the build output. Self-contained, ready to serve at `/brand/`. The website consumes this via git submodule. |
| **Brand Kit** | `dist/brand-kit.zip` — downloadable bundle for designers, partners, press. Linked from `/brand/download/`. Assembled by `build:kit` from existing canonical sources. See [brand-kit.md](brand-kit.md). |
| **Brand Skill** | `dist/escape-velocity-brand.skill` — Claude skill package teaching the design system + tool routing. Thin (~8KB), no embedded templates. See [skill.md](skill.md). |
| **Brand MCP** | `src/mcp/` — stdio + HTTP MCP server wrapping the rendering core. Exposes 9 tools with a warm Chromium across calls. Public endpoint: `https://mcp.escapevelocity.consulting/mcp` (Google-OAuth gated). See [mcp-server.md](mcp-server.md). |

## Publishing

| Term | Meaning |
|---|---|
| **Artifact (ephemeral)** | A single file written through the `RemoteOutputSink` to the `ArtifactStore`. HMAC-signed URL, 1h TTL. Designed to expire. |
| **Bundle** | A logical group of artifacts produced by one multi-file render call (e.g. a deck = viewer HTML + PDF + N PNGs). Identified by a short base64 `bundleId`. Manifest persisted with the same TTL as the artifacts it references. See [publishing.md § Bundle abstraction](publishing.md#bundle-abstraction). |
| **Bundle Manifest** | A `<bundleId>.bundle.json` file in `MCP_TMP_DIR` describing the type, title, primary file, thumbnail file, and member artifacts of a bundle. Read by `publish_artifact` to promote the bundle. |
| **Published Item** | A bundle that's been promoted from the ephemeral artifact store to the persistent published store. Stable ID (~10 char base64), served at `https://mcp.escapevelocity.consulting/published/<id>/<file>`. |
| **`persist: true`** | A shortcut on `render_slides` that renders + publishes in one step. Sugar over the two-step `render_slides` → `publish_artifact` flow. |

## OAuth + auth

| Term | Meaning |
|---|---|
| **Access token** | A JWT signed with `MCP_JWT_SECRET`, HS256, 1h TTL by default. Sent as `Authorization: Bearer <jwt>` on `/mcp` calls. |
| **Refresh token** | An opaque `rt_<32 bytes b64url>` string, 30d TTL. SHA-256-hashed at rest in `<MCP_STATE_DIR>/refresh-tokens.json`. Single-use: every refresh issues a fresh token, the old one is deleted. |
| **Auth code** | A short-lived (60s) code the MCP mints after Google verifies the user's email. Exchanged at `/token` for an access + refresh pair. |
| **Allowlist** | `MCP_ALLOWED_EMAILS` — comma-separated lowercase emails permitted to authenticate. Re-checked on every request AND every refresh, so removing an email kicks the user on the next call. |
| **DCR (Dynamic Client Registration)** | RFC 7591 — Claude Desktop self-registers a client via `POST /register` without a human pre-arranging a client ID/secret. |
| **PKCE** | RFC 7636 — Claude proves it's the same client that started the flow when redeeming the auth code. |

## Storage tiers

| Term | Meaning |
|---|---|
| **In-container** | Anywhere in the container FS that isn't a bind mount. Survives process restart, **does not** survive container redeploy. |
| **tmpfs (`/tmp`)** | Memory-backed FS. Wiped on every container start. Used for short-TTL artifacts that are designed to expire. |
| **Host volume** | A directory on the VM bind-mounted into the container. Survives restarts AND redeploys. Required for sessions, refresh tokens, published items. See [deployment.md § Storage tiers](deployment.md#storage-tiers). |

## Rules

See [rules.md](rules.md) for full text.

| Rule | What it prevents |
|---|---|
| **CI Monitoring Rule** | Silently broken deploys |
| **Spec-First Rule** | Silent contract drift between code and the canonical spec |
| **Documentation-Sync Rule** | Code-doc drift — a change landing in code but not in docs |
| **Token-Sourcing Rule** | Templates hardcoding colors/fonts → silent design-system forks |
| **Brand-Site Coverage Rule** | Templates that ship but can't be found on the Brand Site |

## Related concepts

| Term | Meaning |
|---|---|
| **BrowserPool** | The singleton warm-Chromium holder in `src/core/browserPool.ts`. Reused across renders to avoid 2–3s cold-start per call. The MCP server holds one for the process lifetime; CLI shims construct one per invocation. |
| **OutputSink** | The abstraction in `src/mcp/shared/outputSinks.ts` that decouples render logic from "where do I write this?". `LocalOutputSink` writes to CWD; `RemoteOutputSink` writes through the artifact store and returns signed URLs. |
| **ServerContext** | The struct passed to every MCP tool: `{ paths, pool, outputSink, publishedStore?, publicBaseUrl? }`. Determines which tools register (publish-flow tools need `publishedStore` + `publicBaseUrl`). |
| **Brand Site Coverage** | The expectation that every template that ships must appear on the Brand Site (showcase + optional archive). See [rules.md § Brand-Site Coverage Rule](rules.md#brand-site-coverage-rule). |
| **Doc-Sync Surfaces** | The six describing surfaces (`BRAND_SPEC.md`, `CLAUDE.md`, `docs/`, `BRAND_SKILL.md`, deployed skill, automations). Any system change must update every relevant one. See [rules.md § Documentation-Sync Rule](rules.md#documentation-sync-rule). |

## Acronyms

| Acronym | Meaning |
|---|---|
| **AS** | Authorization Server (OAuth role — the brand MCP is its own AS) |
| **CSP** | Content Security Policy (HTTP header — the website needs `mcp.escapevelocity.consulting` in `connect-src` + `img-src`) |
| **DSGVO** | German for GDPR (data-protection regulation; `MCP_LOG_IP=none` is the DSGVO-safe default) |
| **JWT** | JSON Web Token (the MCP's access-token format, HS256) |
| **MCP** | Model Context Protocol — the protocol Claude uses to call tools on this server |
| **TTL** | Time To Live (1h on artifacts, 30d on refresh tokens, 60s on auth codes) |
| **UID** | Unix User ID (the container's `appuser` is 999, which the host mount must `chown` to) |
