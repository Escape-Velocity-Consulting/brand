# Architecture

The brand system is a stack of layers. Each layer has one job and depends only on layers below it.

```
                                  OUTPUTS
                                     │
  ┌────────────────┬─────────────────┼─────────────────┬────────────────┐
  │                │                 │                 │                │
  ▼                ▼                 ▼                 ▼                ▼
Brand Site     Brand Kit       Brand Skill        Brand MCP        Ad-hoc files
/brand/        brand-kit.zip   .skill bundle      9 tools          (CLI writes)
                                                  HTTP + stdio
                                                                      │
  ▲                ▲                 ▲                 ▲                ▲
  │                │                 │                 │                │
  └────────────────┴────────┬────────┴─────────────────┴────────────────┘
                            │
                            ▼
                       CONSUMERS
                            │
            ┌───────────────┼────────────────────┐
            │               │                    │
            ▼               ▼                    ▼
   CLI shims         MCP stdio server     MCP HTTP server
   generators/*.ts   src/mcp/server.ts    src/mcp/server-http.ts
                                          + ArtifactStore
                                          + BundleStore
                                          + PublishedStore
                                          + OAuth / JWT / refresh tokens
                            │
                            ▼
                      RENDERING CORE
                            │
                        src/core/
                            │
                            ├─ render.ts       (HTML → PNG / PDF primitives)
                            ├─ slides.ts       (N pages orchestrator)
                            ├─ document.ts     (markdown → branded PDF pipeline)
                            ├─ carousel.ts     (LinkedIn carousel)
                            ├─ markdown.ts     (md → html)
                            ├─ templates.ts    (Nunjucks render)
                            ├─ tokens.ts       (tokens.json loader)
                            ├─ paths.ts        (BrandPaths resolver)
                            └─ browserPool.ts  (warm Chromium singleton)
                            │
                            ▼
                       SOURCE OF TRUTH
                            │
                ┌───────────┼────────────────┬──────────────┐
                ▼           ▼                ▼              ▼
           tokens.ts   templates/        templates.meta.ts  fonts/
                       *.html
```

## Boundaries — what's allowed where

- **`src/core/` is pure.** No `process.exit`, no CWD reads, no `console.log`. All FS lookups take an explicit `BrandPaths`. Returns `Buffer`s or structured results, throws `GeneratorError` on failure. This is what lets the same code power CLI shims AND the MCP server AND tests.
- **`generators/*.ts` and `src/mcp/` are consumers.** They construct paths and a `BrowserPool`, call `src/core/`, and write outputs through their own conventions (FS for CLI / stdio, ArtifactStore for HTTP).
- **`tokens.ts` is the only place colors / type / spacing values are defined.** Every template injects `tokens.css` at render time (see [rules.md § Token-Sourcing Rule](rules.md#token-sourcing-rule)).
- **`templates.meta.ts` is the only place template metadata lives.** Output format, dims, vars, prompts, tags. Every consumer (MCP `list_templates` + `render_template`, the skill's auto-generated catalog, the Brand Site showcase) reads from here.

## Why a single `BrowserPool`

Cold-starting Chromium for every render is ~2–3s. Reusing a warm browser drops it to ~600ms. The MCP server constructs **one** `BrowserPool` at startup and shares it across all sessions and concurrent calls. CLI shims construct their own pool, render once, close — no point keeping one warm for a one-shot.

The pool gates concurrency too — if the user fires 20 slide renders at once, the pool serializes them onto a small number of browser contexts so we don't OOM the container.

## State and where it lives

Three storage tiers serve different lifetimes. The May 2026 disconnect (sessions + refresh tokens wiped on redeploy → clients forced to re-OAuth) traced to confusing these tiers; the docs now make the distinction explicit. See [deployment.md § Storage tiers](deployment.md#storage-tiers).

| Tier | Lifetime | Used for |
|---|---|---|
| In-container | Container lifetime | Compiled code, fonts, templates |
| tmpfs (`/tmp`) | Container lifetime | Ephemeral artifacts (1h TTL by design) |
| Host volume | Survives redeploys | `MCP_STATE_DIR` (sessions, refresh tokens), `MCP_PUBLISHED_DIR` (published items) |

## Outputs

The four "products" of this repo:

| Output | What | Consumed by |
|---|---|---|
| **Brand Site** (`dist/site/`) | 11ty-rendered static site at `/brand/` | Embedded on `escapevelocity.consulting/brand/` via git submodule. See [brand-site.md](brand-site.md). |
| **Brand Kit** (`dist/brand-kit.zip`) | Logos + fonts + tokens + sample assets + brand guide PDF, zipped | Designers, partners, press. See [brand-kit.md](brand-kit.md). |
| **Brand Skill** (`dist/escape-velocity-brand.skill`) | Thin guidance bundle (~8KB), no code/templates | Claude Code / Desktop, installed once. See [skill.md](skill.md). |
| **Brand MCP** (`mcp.escapevelocity.consulting/mcp`) | 9-tool MCP server, OAuth-gated | Claude Code / Desktop, calls render and publish. See [mcp-server.md](mcp-server.md). |

Plus ad-hoc files from CLI generators (`generators/*.ts`) which write to the user's CWD.

## Dependency arrows in one line

`tokens.ts` → `tokens.css` + `tokens.json` → templates render with brand vars → core renders templates → CLI/MCP/Brand-Kit consume core → Brand Site embeds outputs → website pulls Brand Distribution via git submodule.

When any layer changes, the [Documentation-Sync Rule](rules.md#documentation-sync-rule) requires updating every describing surface (spec, CLAUDE.md, this doc, skill source) in the same commit.
