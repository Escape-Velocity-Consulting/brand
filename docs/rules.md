# Rules

Five mandates govern this repo. They exist because we've already lived the failure mode each rule prevents.

[`CLAUDE.md`](../CLAUDE.md) holds the short mandate text where agents see it on every task. This file is the canonical full text — anti-patterns, checklists, coverage. If a rule changes, edit here once; CLAUDE.md's summary updates next.

---

## CI Monitoring Rule

**After any `git push` to the brand repo that could trigger the Deploy MCP workflow, immediately monitor the run until it completes.**

The workflow (`.github/workflows/deploy-mcp.yml`) triggers on pushes to `main` that touch:

```
src/, templates/, fonts/, components/, tokens.ts, tokens.css,
package.json, package-lock.json, tsconfig.mcp.json,
scripts/build-tokens.ts, Dockerfile, .dockerignore,
.github/workflows/deploy-mcp.yml
```

After pushing, run:

```bash
gh run list --repo Escape-Velocity-Consulting/brand --limit 1
gh run watch <run-id> --repo Escape-Velocity-Consulting/brand --exit-status
```

If the run fails, fetch the logs of the failing step and report the error:

```bash
gh run view <run-id> --repo Escape-Velocity-Consulting/brand --log-failed
```

Do not declare a push "done" until the build job passes (or explicitly confirm with the user that they'll watch it themselves).

### Why

The MCP server is live; a broken deploy strands the public endpoint. A 3-minute deploy run that fails silently can sit unnoticed for hours. The fix is to watch every relevant push immediately.

---

## Spec-First Rule

**[`BRAND_SPEC.md`](../BRAND_SPEC.md) is the source of truth.** Before changing any brand code, templates, or tokens:

1. Consult the spec to understand current rules.
2. If the change requires a spec update, get explicit user approval first.
3. Update the spec, then implement.

Never silently deviate from the spec. If a conflict arises, flag it.

### Why

The spec is the contract everyone — humans, agents, consuming repos — assumes. Silent deviation = future-Tommi or future-agent acting on stale assumptions. The cost of updating the spec is small; the cost of debugging a silent contract drift is large.

---

## Documentation-Sync Rule

**Any change to a system capability MUST update every relevant describing surface in the same commit.**

The brand system has six surfaces that *describe* it:

| Surface | What it is |
|---|---|
| [`BRAND_SPEC.md`](../BRAND_SPEC.md) | Canonical contract |
| [`CLAUDE.md`](../CLAUDE.md) | Agent-facing rules + nav hub |
| [`docs/`](../docs/) | Topic-organized operational docs (this directory) |
| [`BRAND_SKILL.md`](../BRAND_SKILL.md) | Skill sidecar — copied into the .skill as `references/brand-reference.md` |
| `skill/escape-velocity-brand/SKILL.md` | Deployed skill instructions (with auto-generated catalog + routing blocks) |
| `.github/workflows/` + `scripts/hooks/` | Automations (CI triggers, pre-push checks) |

A change that lands in code but not in docs is broken on arrival. The next agent will silently call the wrong tool, miss the new flag, or rely on a removed file.

### Checklist before declaring a system change complete

1. **Spec updated** ([`BRAND_SPEC.md`](../BRAND_SPEC.md)) if the contract changed.
2. **`docs/` reflects the new surface** — tool table, env table, route table, file layout. Touch every doc that mentions the changed thing.
3. **`CLAUDE.md` summaries + nav table current.** Rules-and-nav only; depth lives in `docs/`.
4. **Skill source updated** — [`SKILL.md`](../skill/escape-velocity-brand/SKILL.md) (hand-authored sections only) + [`BRAND_SKILL.md`](../BRAND_SKILL.md); `npm run build:skill` ran; the new `.skill` reinstalled.
5. **CI/automation aware of the change** — new path globs in `deploy-mcp.yml`, new hook checks, new build steps.
6. **User-facing surface mentions the new capability** — nav entry, help text, README, Brand Site page.

### Anti-patterns

- ❌ "I'll update docs in a follow-up PR." Follow-ups rot.
- ❌ Updating only one of the parallel skill files (`SKILL.md` source vs `BRAND_SKILL.md` sidecar vs the deployed `.claude/skills/escape-velocity-brand/` copy).
- ❌ Adding an MCP tool without registering it in the SKILL routing block. (For template additions, that block is auto-generated from `templates.meta.ts` — so the registry edit *is* the doc update.)
- ❌ Bumping a tool count or env list without grepping for the previous count/list across the repo. A stale "6 tools" string somewhere will lead the next agent astray.
- ❌ Hand-editing content inside `<!-- AUTO-GENERATED:* -->` markers. The next build overwrites it.

### Why

The publish flow change in May 2026 added 3 tools to the MCP and a whole new storage tier. Spread across CLAUDE.md alone, the diff was unreviewable and easy to get wrong. The Doc-Sync Rule and the new `docs/` structure are the response: each topic doc bounds the diff, and the rule forces all surfaces to update together.

---

## Token-Sourcing Rule

**[`tokens.ts`](../tokens.ts) is the single source of truth for color, type, and spacing values. Never duplicate them in templates.**

### The rule

Every new template you create — document, deck, social, anything that ships brand styling — MUST source its tokens by injecting `tokens.css` at render time. **No exceptions.** This is not "preferred"; it is mandatory. A template that hardcodes brand values is broken on arrival, even if it looks correct, because it silently forks the design system.

Concretely, when you create a new template:

1. **Template file:** put `{{ TOKENS_CSS | safe }}` near the top of the `<style>` block. Use the `var(--color-terracotta)` / `var(--font-headline)` syntax everywhere downstream. Never write a raw hex value or font name.
2. **Generator file:** read `brand/tokens.css` into a string and pass it as the `TOKENS_CSS` Nunjucks variable. If `tokens.css` doesn't exist, fail with an error message telling the user to run `npm run build:tokens` — don't fall back to defaults.
3. **Verify before declaring done:** flip one value in `tokens.ts` (e.g. `terracotta` → `#3B82F6`), run `build:tokens` + your generator, confirm the new color appears in the output, then revert. If the output didn't change, your template is hardcoded somewhere — find it.

Reference implementation: `templates/presentation.html` + `generators/presentation.ts`. Copy that pattern.

### Anti-patterns

- ❌ Pasting hex values or font names directly into a template's CSS — not even "just this once for inline-friendliness."
- ❌ Writing your own `:root { --color-… }` block in the template. That silently forks the tokens.
- ❌ Hardcoding tokens "for now" with a TODO to refactor later. Do it right the first time; the cost is one extra import.

### Coverage

All current top-level templates (`presentation.html`, `letter.html`, `offer.html`, `invoice.html`, `tos.html`, `report.html`) source tokens via `_base.html`'s `{{ TOKENS_CSS | safe }}` injection. New templates must do the same.

Subdirectory templates (`templates/social/*.html`, `templates/carousel/*.html`) also source tokens — `src/core/image.ts` and `src/core/carousel.ts` pass `TOKENS_CSS` into `renderStringTemplate`, and each template injects it inside its own `<style>` block (these templates are standalone, not based on `_base.html`).

### Why

Tokens are the only thing that makes "the brand" coherent across decks, documents, social posts, and the Brand Site. A hardcoded color in one template creates a fork: change the master and the fork doesn't follow. We've already had this fail once when a presentation template duplicated tokens and the brand-color rotation skipped it.

---

## Brand-Site Coverage Rule

**Every new template that produces a tangible output (document, deck, social image, infographic, etc.) MUST be surfaced on the Brand Site. A template without a Brand Site presence is undiscoverable to the user.**

Coverage means two things, applied in order:

### 1. Showcase page (always required)

A `site/<type>.njk` page that demonstrates the template's variants/types with sample renders, syntax examples, and a link to the canonical demo output.

When the template emits multiple types/variants, drive the page from `site/_data/<type>.cjs` and read sample renders from a **canonical showcase artifact** regenerated by `build:assets` so the page tracks template changes automatically — you don't have to remember to re-screenshot.

Reference implementation: `site/presentations.njk` + `site/_data/slide-types.cjs` + `previews/showcase/slide-types.md` + the showcase regen step at the bottom of `scripts/export-assets.ts`.

### 2. Archive page (where it makes sense)

A `site/<plural>.njk` page that lists every rendered output of that type.

Two patterns, both valid:

- **Filesystem-scan (legacy pattern, simpler):** `site/social.njk` + `site/_data/social.cjs` reads `templates/social/*.html` at build time.
- **Live API fetch (current pattern for user-published artifacts):** `site/decks.njk` reads from `GET /api/published?type=deck` on the brand MCP at page-load time. Updates appear on refresh, no rebuild needed. See [publishing.md](publishing.md).

Use the live-API pattern when outputs are user-driven (you can't enumerate them at build time). Use filesystem-scan when outputs are repo-committed assets.

Skip an archive page when outputs are confidential (client letters, invoices, contracts) or noisy (one-off social PNGs).

### Always

- Add the nav entry in `site/_data/nav.cjs` — order matters.
- Verify `scripts/build-site.sh` already copies your output directory into `dist/site/` (today it copies the whole `previews/` tree, so anything under there is covered).
- If you add a new top-level dir outside `previews/`, extend `build-site.sh`.

### Anti-patterns

- ❌ Building a generator without a showcase page. "I'll add the site page later" leads to forgotten work — do it in the same change.
- ❌ Hardcoding showcase thumbnails as static images checked into the repo instead of regenerating them from a canonical showcase artifact. The whole point is that the page tracks the template; static screenshots drift.
- ❌ Hardcoding archive content when filesystem discovery or API discovery would work.

### Coverage today

| Template type | Showcase | Archive |
|---|---|---|
| **Documents** (letter/offer/invoice/tos/report) | ✅ `documents.njk` — auto-discovered from `previews/*-preview.png` via `site/_data/documents.cjs`. | ❌ Correct — client docs are sensitive. |
| **Components** (UI patterns) | ✅ `components.njk` | N/A |
| **Social** (LinkedIn banner / cards / OG) | ✅ `social.njk` — auto-discovered from `templates/social/*.html` via `site/_data/social.cjs`. | ❌ Consider adding when next touched. |
| **Presentations / decks** | ✅ `presentations.njk` — auto-regenerated showcase. **Reference implementation.** | ✅ `decks.njk` — **client-side fetched from `GET /api/published?type=deck`**. See [publishing.md](publishing.md). |
| **Carousel** (LinkedIn carousels) | ❌ — known gap, add when carousel templates next touched. | ❌ |

### Why

A template that the user can't find on the Brand Site might as well not exist. We've already shipped templates that lived in `templates/social/` for weeks before anyone realized they weren't on the site — discoverability is the rule.
