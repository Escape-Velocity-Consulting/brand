# Brand-repo documentation

This directory holds operational documentation for the brand system — how it works, how to do things, where to look when something breaks.

Three layers exist in parallel:

- **[`BRAND_SPEC.md`](../BRAND_SPEC.md)** — canonical contract. *What* the system is. Rarely changes.
- **[`CLAUDE.md`](../CLAUDE.md)** — agent-facing rules + navigation hub. *What's mandatory*, *where to find things*. Slim.
- **`docs/` (this directory)** — *how* the system works, organized by topic. The bulk of the operational knowledge lives here.

Edit the layer that matches your change: contract → spec, mandate → CLAUDE.md, mechanism → docs/. The [Documentation-Sync Rule](rules.md#documentation-sync-rule) requires that any system change updates every relevant layer in the same commit.

---

## What to read first

| You are | Read |
|---|---|
| **New contributor** orienting on the repo | [`architecture.md`](architecture.md) → [`glossary.md`](glossary.md) → [`../CLAUDE.md`](../CLAUDE.md) |
| **Agent** picking up a brand task | [`../CLAUDE.md`](../CLAUDE.md) — it lists the 5 rules and the where-to-find-X table |
| **Sysadmin** wiring infra | [`deployment.md`](deployment.md) → [`troubleshooting.md`](troubleshooting.md) |
| **Publisher** (rendering decks to share) | [`publishing.md`](publishing.md) |
| **Template author** adding a new asset type | [`templates.md`](templates.md) → [`../BRAND_SPEC.md`](../BRAND_SPEC.md) §11 |
| **Anyone debugging a failure** | [`troubleshooting.md`](troubleshooting.md) |

---

## Document index

| File | Scope |
|---|---|
| [`README.md`](README.md) | This index + lookup tables. |
| [`architecture.md`](architecture.md) | The system at a glance: layers (tokens → core → consumers → outputs), where state lives, what the BrowserPool is for. |
| [`rules.md`](rules.md) | The 5 mandates in full — CI Monitoring, Spec-First, Documentation-Sync, Token-Sourcing, Brand-Site Coverage. |
| [`mcp-server.md`](mcp-server.md) | The escape-velocity-brand MCP server: tools, transports, OAuth, env vars, registration. |
| [`publishing.md`](publishing.md) | Publish/unpublish flow: ephemeral vs persistent, bundles, REST routes, Brand Site integration. |
| [`templates.md`](templates.md) | Template registry, the propagation chain, adding a template, modifying a template. |
| [`generators.md`](generators.md) | CLI shims (`pdf.ts`, `image.ts`, `carousel.ts`, `presentation.ts`) over `src/core/`. |
| [`brand-site.md`](brand-site.md) | The `/brand/` static site: 11ty, data-driven swatches, the dev/iterate flow, per-page status. |
| [`brand-kit.md`](brand-kit.md) | The downloadable Brand Kit (`dist/brand-kit.zip`) and its source-of-truth chain. |
| [`skill.md`](skill.md) | The `escape-velocity-brand` skill package: bundle contents, edit flow, graceful degradation. |
| [`testing.md`](testing.md) | E2E + unit suites: stdio / HTTP fixtures, how to add a test, where reports go. |
| [`deployment.md`](deployment.md) | Dockerfile, CI workflow, the three storage tiers, admin-coordinated tasks. |
| [`troubleshooting.md`](troubleshooting.md) | Common failures by log signature, gcloud commands to read prod logs. |
| [`glossary.md`](glossary.md) | Terminology — Brand System, Brand Site, Brand Distribution, Brand Kit, Brand MCP, Bundle, Published Item, etc. |

---

## Quick lookup tables

### Tool → file

| MCP tool | Source | Doc |
|---|---|---|
| `render_template` | `src/mcp/tools/renderTemplate.ts` | [templates.md](templates.md) |
| `render_html_to_png` | `src/mcp/tools/renderHtmlToPng.ts` | [mcp-server.md](mcp-server.md) |
| `render_html_to_pdf` | `src/mcp/tools/renderHtmlToPdf.ts` | [mcp-server.md](mcp-server.md) |
| `render_slides` | `src/mcp/tools/renderSlides.ts` | [mcp-server.md](mcp-server.md), [publishing.md](publishing.md) |
| `publish_artifact` | `src/mcp/tools/publishArtifact.ts` | [publishing.md](publishing.md) |
| `unpublish_artifact` | `src/mcp/tools/unpublishArtifact.ts` | [publishing.md](publishing.md) |
| `list_published` | `src/mcp/tools/listPublished.ts` | [publishing.md](publishing.md) |
| `list_templates` | `src/mcp/tools/listTemplates.ts` | [templates.md](templates.md) |
| `get_tokens` | `src/mcp/tools/getTokens.ts` | [mcp-server.md](mcp-server.md) |

### Asset type → how to make it

| What you want | How |
|---|---|
| Branded document (letter / offer / invoice / tos / report) | `render_template({ template: "<type>", markdown, recipient?, date?, ref? })` |
| Social graphic (banner / OG / quote card / etc.) | `render_template({ template: "social/<key>", vars })` |
| LinkedIn carousel (PDF + per-slide PNGs) | `render_slides({ pages: [...], dimensions: "linkedin-portrait", outputs: { pdf, pngs } })` |
| Slide deck (HTML viewer + PDF + PNGs) | `render_slides({ markdown, dimensions: "slide-16-9", outputs: { viewer, pdf, pngs }, persist: true })` |
| Custom PNG with no template match | `render_html_to_png({ html, width, height })` *— last resort* |
| Custom PDF with no template match | `render_html_to_pdf({ html, format })` *— last resort* |
| Publish a rendered deck to the Brand Site | `publish_artifact({ bundleId })` — bundleId from the prior `render_slides` response |

### Failure → where to look

| Symptom | First stop |
|---|---|
| `jwt_reject expired=true` in logs | [troubleshooting.md § token refresh broken](troubleshooting.md#token-refresh-broken) |
| `mcp_session_404` after a redeploy | [troubleshooting.md § sessions wiped on redeploy](troubleshooting.md#sessions-wiped-on-redeploy) |
| `/brand/decks/` empty in browser, CORS errors | [troubleshooting.md § brand site cant fetch published items](troubleshooting.md#brand-site-cant-fetch-published-items) |
| Published items vanish after deploy | [troubleshooting.md § published items disappear](troubleshooting.md#published-items-disappear) |
| Tokens not flowing into template output | [troubleshooting.md § template hardcoded](troubleshooting.md#template-hardcoded-tokens) |
| CI didn't trigger on push | [troubleshooting.md § ci didnt fire](troubleshooting.md#ci-didnt-fire) |

### "Which file owns this concept?"

| Concept | Lives in |
|---|---|
| Color / type / spacing values | `tokens.ts` → `tokens.css` + `tokens.json` ([brand-site.md](brand-site.md), [BRAND_SPEC §13](../BRAND_SPEC.md)) |
| Template registry (output, dims, vars, prompts) | `templates.meta.ts` ([templates.md](templates.md)) |
| MCP tool registration | `src/mcp/shared/createServer.ts` ([mcp-server.md](mcp-server.md)) |
| Skill instructions (auto-generated catalog + routing) | `skill/escape-velocity-brand/SKILL.md` ([skill.md](skill.md)) |
| Brand reference sidecar (tokens, layout patterns) | `BRAND_SKILL.md` ([skill.md](skill.md)) |
| Press copy (DE + EN bio, contact) | `press/boilerplate.md` |
| Brand Kit assembly logic | `scripts/build-kit.ts` ([brand-kit.md](brand-kit.md)) |
| The Brand Site (11ty source) | `site/` ([brand-site.md](brand-site.md)) |
| OAuth handlers | `src/mcp/shared/oauthServer.ts` ([mcp-server.md § OAuth](mcp-server.md#oauth-google-delegated)) |
| Persistent state (sessions, refresh tokens) | `<MCP_STATE_DIR>/{sessions,refresh-tokens}.json` ([deployment.md § storage](deployment.md#storage-tiers)) |
| Published items | `<MCP_PUBLISHED_DIR>/<id>/` ([publishing.md § storage](publishing.md#storage-layout)) |

---

## Conventions

- **No mermaid / external dependencies.** Plain markdown, text-art diagrams where helpful. The docs render in any markdown viewer.
- **Cross-references stay short.** "See [publishing.md](publishing.md)" is enough — don't duplicate content. The rule of thumb: if you find yourself copy-pasting a paragraph between docs, link instead.
- **Auto-generated content is marked.** The catalog + routing blocks in `skill/escape-velocity-brand/SKILL.md` sit between `<!-- AUTO-GENERATED:* -->` markers. Hand-edits inside those blocks will be lost on the next `npm run build:skill`.
- **Doc-Sync Rule applies.** Any change to a system surface must update every relevant doc in the same commit. See [rules.md § Documentation-Sync Rule](rules.md#documentation-sync-rule).
