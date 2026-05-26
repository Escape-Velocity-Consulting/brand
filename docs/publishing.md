# Publishing

The brand MCP server has two output paths for rendered files:

1. **Ephemeral artifact store** (default). Every render writes through `RemoteOutputSink` → `ArtifactStore`. Each file gets an HMAC-signed download URL with a **1h TTL**. Designed for "show me the render, I'll decide what to do with it" — fine for previews, drafts, throwaway one-offs.
2. **Persistent published store** (opt-in). The `publish_artifact` tool copies a freshly-rendered *bundle* into a host-mounted persistent directory. Published items get a stable URL, no expiry, and surface on the Brand Site at `/brand/decks/` (and eventually other type sections).

## Why two paths

Conversation-driven renders should evaporate by default — the user explicitly opts something into permanence. This avoids the failure mode where every test render clutters the public site, while keeping the publish step trivial ("publish this", or `persist: true` on the render call).

## Bundle abstraction

Render tools that produce more than one file (today: `render_slides`) wrap their writes in a *bundle scope* on the `OutputSink`. At end-of-scope a manifest (`<bundleId>.bundle.json`) is written into the artifact store with the same TTL as the artifacts it references. The render response includes `bundleId` — that's the handle the user references for `publish_artifact`.

Internally:

```ts
// In a multi-file render tool (e.g. renderSlides.ts):
const bundleId = ctx.outputSink.beginBundle({
  type: 'deck',
  title: args.title,
  primaryFile: 'index.html',
  thumbnailFile: 'slides/slide-01.png',
})
// ... write viewer + pdf + N pngs through the sink ...
ctx.outputSink.endBundle()
// bundleId returned to caller in the response
```

The `LocalOutputSink` (stdio) no-ops bundle methods — there's no concept of publishing on stdio.

If the bundle's TTL expires before publish, the publish call fails loudly with `Bundle not found or expired: <bundleId>`. Re-render and try again.

## Tool surface

```
publish_artifact({ bundleId, title?, type?, bakeQr? })
  → moves an ephemeral bundle into MCP_PUBLISHED_DIR/<id>/
  → for decks: bakes a QR code (pointing to the detail page) onto every title
    slide in the HTML viewer + matching PDF pages. Suppress with bakeQr: false.
  → returns { id, type, title, publishedAt, primaryUrl, thumbnailUrl, files,
              bakeStatus?: { baked, reason?, warnings[] } }
  → bakeStatus is present whenever a bake was attempted. `baked: false` means
    the deck published but the QR didn't get onto the title slides (the HTML
    viewer still has the placeholder marker, qr-title.png may be missing).
    `warnings[]` enumerates soft failures: `screenshot_failed: slide N: ...`,
    `pdf_swap_failed: ...`, `qr_generate_failed: ...`. Use these to diagnose
    silent failures rather than discovering them as 404s later.
  → bundleId is deleted (publishing twice from the same bundleId is a footgun)

unpublish_artifact({ id })
  → removes MCP_PUBLISHED_DIR/<id>/  (idempotent — unknown id returns removed:false)
  → returns { id, removed }

list_published({ type? })
  → reads meta.json from every subdir of MCP_PUBLISHED_DIR
  → returns { items, count } sorted by publishedAt desc

render_slides({ ..., persist: true })
  → renders + publishes in one step
  → response includes both the per-file URLs (ephemeral) AND the `published` field (stable)
```

`persist: true` only works on the HTTP transport (stdio has no publishedStore). On stdio mode the flag is silently ignored.

## REST routes (public, no auth)

| Route | Purpose |
|-------|---------|
| `GET /api/published[?type=<bundle-type>]` | List published items. CORS: `*`. |
| `GET /api/published/<id>` | Single item metadata. |
| `GET /published/<id>` | **Publication detail page** (HTML). Canonical share URL — title, type badge, date, Open / Download buttons, 4-up deck thumbnails, author card. |
| `GET /published/<id>/view` | Deck viewer (alias to the bundle's `index.html`). |
| `GET /published/<id>/<relativeName>` | Serve a published file (path-traversal guarded). `index.html` continues to work directly for backward compatibility. |

Published data is public by design — no auth on the read side. Auth lives on the *write* side (the MCP tools require the same OAuth allowlist as render).

The detail page (`/published/<id>`) is what QR codes on deck title slides resolve to — it's the audience-facing landing, not the raw viewer.

URLs in API responses are computed at read time from `MCP_PUBLIC_BASE_URL`, not stored in `meta.json`. This keeps the on-disk state portable across dev/prod and across domain migrations.

## Storage layout

```
<MCP_PUBLISHED_DIR>/
  <id>/                     ← ~10-char base64 ID
    meta.json               ← serialized PublishedItem (no URLs)
    index.html              ← (deck) the viewer
    <slug>.pdf              ← the PDF (page 1 patched with QR after bake)
    qr-title.png            ← (deck) the auto-baked QR pointing to detail page
    slides/slide-01.png     ← per-slide PNGs (deck) — slide 1 regenerated post-bake
    slides/slide-NN.png     ← rest of the slides
    source.md               ← (deck) original markdown source
    ...
```

ID generation: `randomBytes(8).toString('base64url').slice(0, 10)`. Collision-checked on allocation; retry up to 8 times before throwing.

## Bundle types

| Type | Produced by | Primary file | Thumbnail |
|---|---|---|---|
| `deck` | `render_slides` in markdown mode (viewer + pdf + pngs) | `index.html` | `slides/slide-01.png` |
| `carousel` | `render_slides` in pages mode (pdf + pngs) | `<slug>.pdf` | `slides/slide-01.png` |
| `document` | (future — `render_template` for letter/offer/invoice/tos/report) | `<slug>.pdf` | preview PNG |
| `image` | (future — `render_template` for social) | `<slug>.png` | self |
| `html-pdf` | (future — `render_html_to_pdf` standalone) | `<slug>.pdf` | (none) |
| `html-png` | (future — `render_html_to_png` standalone) | `<slug>.png` | self |

Today only `deck` and `carousel` flow through bundles. Single-output render tools (`render_template`, `render_html_to_*`) don't have `persist: true` yet — see § Anti-patterns below.

## Brand Site integration

`/brand/decks/` is a client-side-fetched page: on load it `fetch`es `https://mcp.escapevelocity.consulting/api/published?type=deck` and renders cards. Updates appear immediately on refresh — no site rebuild needed. Each card shows:

- The short ID as a copy-to-clipboard chip (user references it in chat for `unpublish_artifact`)
- The publish timestamp
- A 4-up thumbnail strip from `slides/slide-01.png` … `slide-04.png`
- "Open Viewer" + "Download PDF" actions

If the MCP is unreachable the page shows an empty state with the error. The website's Caddyfile must include `mcp.escapevelocity.consulting` in `connect-src` and `img-src` CSP directives.

Source: `site/decks.njk`.

## Infrastructure dependency — REQUIRED for persistence

`MCP_PUBLISHED_DIR` defaults to `/app/published` inside the container, which is **container-ephemeral**. The `Dockerfile` declares `VOLUME ["/app/published"]` to document the contract, but `VOLUME` alone creates an anonymous Docker volume that disappears on container recreation. To persist published items across container redeploys, the admin's `deploy-service brand-mcp` script must mount a host directory there:

```bash
docker run -v /data/brand-mcp-published:/app/published \
           -e MCP_PUBLISHED_DIR=/app/published \
           ... ghcr.io/escape-velocity-consulting/brand-mcp:prod
```

The host directory needs to be owned by the container's `appuser` UID/GID (or world-writable, less ideal).

Current prod wiring (as of May 2026):

- Host: `/mnt/pd/data/brand-mcp-published`
- Container: `/app/published`
- Owner: `999:999` (matches `appuser`)

See [deployment.md § Storage tiers](deployment.md#storage-tiers) for the full three-tier model.

## End-to-end flow

User says **"render a deck"** → Claude calls `render_slides` → server renders + returns 23 signed URLs + a `bundleId`.

User says **"publish this"** → Claude calls `publish_artifact({ bundleId })` → server copies the bundle files from the artifact store to `MCP_PUBLISHED_DIR/<id>/`, writes `meta.json`, deletes the bundle manifest. Returns the new `id` + stable `primaryUrl`.

User opens `escapevelocity.consulting/brand/decks/` → browser fetches `/api/published?type=deck` → renders a card → user clicks "Open Viewer" → browser loads `mcp.escapevelocity.consulting/published/<id>/index.html`.

User wants to remove it → reads the ID off the card chip → tells Claude **"unpublish &lt;id&gt;"** → Claude calls `unpublish_artifact({ id })` → server removes the directory → card disappears on next page load.

## Anti-patterns

- ❌ Embedding URLs in `meta.json`. The `publicBaseUrl` can change (dev vs prod); compute URLs at read time via `publishedItemToApi`.
- ❌ Adding new artifact-bearing routes without CORS headers. The Brand Site fetches cross-origin.
- ❌ Publishing single-file outputs without going through `beginBundle/endBundle`. The publish flow expects a bundle manifest; one-file renders must still create a one-entry bundle. **V1 only wires this for `render_slides`. Other render tools' `persist: true` is a follow-up.** When you wire it for `render_template` etc., follow the `renderSlides.ts` pattern: open a bundle around the single write, then call `publishedStore.publish` if `persist: true`.
- ❌ Storing rendered deck output dirs as committed files under `previews/decks/<slug>/`. That's the legacy filesystem-discovery pattern, retired by this flow. Source markdown at `previews/decks/<slug>.md` is fine to commit; the rendered output is what flows through publish. **Exception:** `previews/decks/reference-deck/` is the canonical worked example — its rendered HTML viewer + PDF + slide PNGs are intentionally committed alongside the source MD so the skill bundle and docs can link directly to a viewable artifact. Regenerate via `npm run build:reference-deck`.

## See also

- [mcp-server.md](mcp-server.md) — the MCP tool surface this flow extends
- [brand-site.md § /brand/decks/](brand-site.md) — how the listing page works
- [deployment.md § Storage tiers](deployment.md#storage-tiers) — the volume-mount requirement
- [troubleshooting.md § published items disappear](troubleshooting.md#published-items-disappear) — when the volume isn't mounted
