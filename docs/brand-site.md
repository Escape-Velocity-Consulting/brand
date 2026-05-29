# Brand Site

The multi-page reference at `/brand/` (overview, identity, components, documents, social, presentations, decks, workflow, tooling, download, press). Built from `site/` by 11ty. Viewable standalone at `localhost:3000/brand/` and embedded on the live website at `escapevelocity.consulting/brand/` via git submodule.

## Architecture

- **Engine:** 11ty (Nunjucks)
- **Output URL prefix:** `/brand/` (via `pathPrefix` in `site/.eleventy.cjs`)
- **Data-driven parts:** color swatches, font samples, nav — sourced from `tokens.json` via `site/_data/*.cjs`. Editing `tokens.ts` → running `build:tokens` → swatches automatically reflect the new palette.
- **Hand-authored parts:** page narrative, typography scale table, component examples, voice rules, workflow docs.
- **Standalone viewable:** `dist/site/` is self-contained (tokens.css, fonts/, assets/, previews/ all colocated). Serve at `/brand/` with any static server.

## Pages

| Path | Source | Notes |
|---|---|---|
| `/brand/` | `site/index.njk` | Overview, links to other pages |
| `/brand/identity/` | `site/identity.njk` | Identity hub |
| `/brand/identity/foundations/` | `site/identity-foundations.njk` + `_data/logos.cjs` | Colors, type scale, spacing, and the **logo picker + gallery** — auto-generated from `logos.manifest.json` (mark × frame × surface). Not hand-curated; regenerate via `build:logos`. |
| `/brand/components/` | `site/components.njk` | UI patterns (buttons, cards, eyebrows, etc.) |
| `/brand/documents/` | `site/documents.njk` + `_data/documents.cjs` | Auto-discovered from `previews/*-preview.png` |
| `/brand/social/` | `site/social.njk` + `_data/social.cjs` | Auto-discovered from `templates/social/*.html` |
| `/brand/presentations/` | `site/presentations.njk` + `_data/slide-types.cjs` | Showcase of slide types from `previews/showcase/slide-types/` |
| `/brand/decks/` | `site/decks.njk` | **Live API fetch** from `GET /api/published?type=deck`. See [publishing.md](publishing.md). |
| `/brand/workflow/` | `site/workflow.njk` | Iteration / contribution guide |
| `/brand/tooling/` | `site/tooling.njk` + `_data/tooling.json` (generated) | Skill & MCP reference — tools, template catalog (auto-generated from `templates.meta.ts`), REST API, quick-connect |
| `/brand/download/` | `site/download.njk` | Brand Kit zip link |
| `/brand/press/` | `site/press.njk` + `_data/press.cjs` | Reads `press/boilerplate.md` |

## Iteration flow (when tweaking the brand)

1. **Edit** `tokens.ts` (or `site/_data/`, `site/*.njk`, `site/site.css`)
2. **`npm run dev`** — Brand Site is live at `localhost:3000/brand/` with auto-reload
3. **Commit + push** the brand repo
4. **Bump the submodule in `website/`** — see `website/CLAUDE.md` for commands. CI then rebuilds dist and deploys the live `/brand/` page.

The website does **not** copy from `brand/` directly anymore. It pulls via git submodule pinned to a commit. There is no "sync" step — pushing the brand repo and bumping the submodule pointer is the entire publication flow.

## Two patterns for archive pages

Per the [Brand-Site Coverage Rule](rules.md#brand-site-coverage-rule), every template type that produces non-sensitive outputs should have an archive page. Two implementation patterns exist:

### Filesystem-scan (legacy, simpler)

Used by `social.njk`, `documents.njk`, `presentations.njk`.

- `site/_data/<plural>.cjs` reads a directory at 11ty build time (`fs.readdirSync`).
- Pages are static — what's on disk at build time is what shows.
- Updates require a site rebuild + submodule bump to appear.
- Works well for repo-committed assets (showcase artifacts, template registries).

### Live API fetch (current pattern for user-published artifacts)

Used by `decks.njk`.

- Page emits an empty grid + inline `<script>` that fetches the listing at page-load time.
- Server endpoint: `GET https://mcp.escapevelocity.consulting/api/published?type=<bundle-type>`.
- Updates appear on refresh — no site rebuild needed.
- CORS allow-all on the API; the website's Caddyfile must add the MCP origin to `connect-src` and `img-src` CSP directives.

Use live-API when outputs are user-driven (you can't enumerate them at build time). Use filesystem-scan when outputs are repo-committed.

## Coverage today

| Template type | Showcase | Archive |
|---|---|---|
| **Documents** | ✅ `documents.njk` | ❌ Correct — client docs are sensitive |
| **Components** | ✅ `components.njk` | N/A |
| **Social** | ✅ `social.njk` | ❌ Consider adding when next touched |
| **Presentations / decks** | ✅ `presentations.njk` (showcase) | ✅ `decks.njk` (live API) |
| **Carousel** | ❌ known gap | ❌ |

## `site/_data/` modules

Each `.cjs` exports either a data object (consumed directly by Nunjucks `{{ name }}`) or an array (iterated by `{% for %}`):

| Module | Sources |
|---|---|
| `palette.cjs` | `tokens.json` colors |
| `typography.cjs` | `tokens.json` typography scale |
| `nav.cjs` | hand-authored — order matters |
| `version.cjs` | reads `package.json` |
| `press.cjs` | `press/boilerplate.md` |
| `documents.cjs` | scans `previews/*-preview.png` + colocated `DOCS_META` |
| `social.cjs` | scans `templates/social/*.html` + colocated `SOCIAL_META` |
| `slide-types.cjs` | hand-authored slide-type catalog with thumbnail paths |
| `tooling.json` | **generated** by `scripts/gen-tooling-data.ts` (gitignored) — MCP tool groups, template catalog (from `templates.meta.ts`), REST routes |

## Build chain

```
npm run dev          ← tokens → site → eleventy --serve (fast iteration)
npm run build:tokens ← tokens.ts → tokens.css + tokens.json
npm run build:assets ← regenerate rasters + document previews + showcase decks
npm run build:site   ← render site/ → dist/site/
npm run build:kit    ← assemble dist/brand-kit/ + zip it
npm run build:dist   ← meta: tokens → assets → skill → site → kit (full publishable build)
```

Use `npm run dev` for iteration (skips the slow asset/kit builds). Use `npm run build:dist` before a release.

See [`CLAUDE.md` § npm Scripts](../CLAUDE.md#npm-scripts) for the full script table.

## See also

- [`BRAND_SPEC.md`](../BRAND_SPEC.md) §3–§6 — visual contract for the Brand Site itself
- [publishing.md](publishing.md) — the `/brand/decks/` live-API pattern in detail
- [brand-kit.md](brand-kit.md) — the downloadable Brand Kit assembled from this site + tokens + fonts
- [rules.md § Brand-Site Coverage Rule](rules.md#brand-site-coverage-rule)
