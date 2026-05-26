---
name: escape-velocity-brand
description: |
  Use when creating or rendering any Escape Velocity branded asset —
  branded documents (letter, offer, invoice, tos, report), social images
  (OG, LinkedIn banner, Twitter banner, quote/stats card), LinkedIn
  carousels, slide decks, or ad-hoc on-brand HTML. Works with the
  escape-velocity-brand MCP server registered for pixel-perfect rendering;
  falls back to HTML-only authoring otherwise.
---

# Escape Velocity Brand

## Mental model

- **This skill = brand design system + HTML authoring + workflow routing.**
  You know the brand tokens (colors, fonts, spacing), the template patterns,
  and which tool fits which request.
- **escape-velocity-brand = pixel-perfect rendering.** Warm Chromium server, HTML → PNG
  or PDF. Registered separately by the user (one-time workstation setup).

If escape-velocity-brand is **not** registered, the skill still works — author the HTML
using brand CSS vars and return it to the user. They can paste it into a
browser or register the MCP later to get rendered artifacts.

## The 9 tools (when escape-velocity-brand is registered)

**Render** (both transports):

| Tool | Use when |
|------|----------|
| **`render_template`**     | You want a standard branded asset (letter, OG image, invoice, carousel slide). Pick a template key, fill `vars`, optionally pass a markdown body. Output format is driven by the template registry. |
| **`render_slides`**       | You have N discrete pages → want a viewer / combined PDF / per-page PNGs / any combination. Two input modes: `markdown` (presentation-style with `===` separators) or `pages` (carousel-style explicit HTML/template per page). Pass `persist: true` to also publish in one step (HTTP transport only). |
| **`render_html_to_png`**  | You wrote custom HTML — want a single PNG screenshot. **Last-resort tool.** |
| **`render_html_to_pdf`**  | You wrote custom HTML — want a PDF. Playwright auto-paginates long HTML. **Last-resort tool.** |

**Publishing** (HTTP transport only — promotes ephemeral renders to a permanent, public URL on the Brand Site):

| Tool | Use when |
|------|----------|
| **`publish_artifact`**    | The user says **"publish this"** after a `render_slides` call. Pass the `bundleId` from the render response. Returns the stable ID + URL. The deck appears on `escapevelocity.consulting/brand/decks/` immediately. |
| **`unpublish_artifact`**  | The user says **"unpublish &lt;id&gt;"** with an ID they read from the Brand Site card. Pass the ID. Idempotent. |
| **`list_published`**      | The user wants to see what's currently published. Optional `type` filter (`deck`, `document`, `image`, `carousel`). |

**Introspection** (both transports):

| Tool | Use when |
|------|----------|
| **`list_templates`**      | Discover which templates exist + their metadata (output format, dims, required vars, tags). |
| **`get_tokens`**          | Get the parsed `tokens.json` (colors, type, spacing values). |

### When to publish

The publish flow exists because conversation-driven renders are ephemeral by default — they expire in 1h and don't appear on the Brand Site. Publishing is a deliberate second step:

- **User says "publish this" / "make it permanent" / "put it on the site"** → call `publish_artifact({ bundleId })` with the bundleId from the previous render response. Or re-render with `persist: true`.
- **User says "unpublish &lt;id&gt;"** → call `unpublish_artifact({ id })`. The ID is the short base64 chip on the deck card.
- **User wants to browse what's already there** → call `list_published()` or point them at `escapevelocity.consulting/brand/decks/`.

Only `render_slides` supports `persist: true` today. Other render tools (`render_template`, `render_html_to_png`, `render_html_to_pdf`) don't have a publish path yet — file a follow-up if the user asks.

<!-- AUTO-GENERATED:CATALOG — edit templates.meta.ts and run `npm run build:skill` -->

## Template catalog

_Snapshot generated from `templates.meta.ts`. Call `list_templates` if you suspect drift since the skill was built._

### Documents (PDF, A4)

Call as `render_template({ template: KEY, markdown: BODY, ...vars })`. Each accepts a markdown body and the listed required vars.

| Key | Use for | Required vars |
|-----|---------|---------------|
| `letter` | Branded business letter (single or multi-page). Markdown body, optional recipient block. | _(none)_ |
| `offer` | Branded offer / proposal PDF. Markdown body, recipient + date required for canonical filename. | `recipient`, `date` |
| `invoice` | Branded invoice PDF. Structured invoice line items in the body. Recipient + UID (or private flag) required. | `recipient`, `date` |
| `tos` | Terms of service / legal document. Markdown body, optional headings. | _(none)_ |
| `report` | Branded multi-page report. Markdown body, optional cover image. | _(none)_ |

### Social (PNG)

Call as `render_template({ template: KEY, vars: { ... } })`.

| Key | Dimensions | Use for | Optional vars |
|-----|------------|---------|---------------|
| `social/og` | 1200×630 | Open Graph image (1200×630). For website / blog post sharing. | `TITLE`, `SUBTITLE`, `EYEBROW` |
| `social/linkedin-banner` | 1584×396 | LinkedIn profile banner (1584×396). | `TITLE`, `SUBTITLE` |
| `social/twitter-banner` | 1500×500 | Twitter/X profile banner (1500×500). | `TITLE`, `SUBTITLE` |
| `social/youtube-banner` | 2560×1440 | YouTube channel banner (2560×1440, safe area ~1546×423). | `TITLE`, `SUBTITLE` |
| `social/announcement` | 1200×630 | Announcement post (1200×630). Bold title + body copy. | `TITLE`, `BODY`, `EYEBROW` |
| `social/quote-card` | 1200×1200 | Square quote card (1200×1200). Quote + attribution. | `QUOTE`, `AUTHOR` |
| `social/stats-card` | 1200×1200 | Square stats card (1200×1200). Big number + label + context. | `NUMBER`, `LABEL`, `CONTEXT` |
| `social/linkedin-post-portrait` | 1080×1350 | LinkedIn portrait feed post (1080×1350, 4:5). Content-flexible: eyebrow + headline + body + CTA. The generalist "LinkedIn shareable image" — use when nothing more specific (quote-card, stats-card) fits. | `EYEBROW`, `HEADLINE`, `BODY`, `CTA` |

### Carousel slides (PNG)

Used **inside** `render_slides({ pages: [{ template: KEY, vars }, ...] })`, not directly via `render_template`.

| Key | Dimensions | Role | Optional vars |
|-----|------------|------|---------------|
| `carousel/title` | 1080×1350 | Carousel title slide (LinkedIn portrait 1080×1350). Eyebrow + big number + body. | `EYEBROW`, `BIGNUMBER`, `TITLE`, `BODY` |
| `carousel/numbered-item` | 1080×1350 | Carousel numbered list item (1080×1350). Used inside multi-slide carousels. | `TITLE`, `BODY`, `PROGRESS` |
| `carousel/cta` | 1080×1350 | Carousel CTA / closing slide (1080×1350). | `CTA`, `SUBTITLE` |

<!-- /AUTO-GENERATED:CATALOG -->

<!-- AUTO-GENERATED:ROUTING — edit templates.meta.ts and run `npm run build:skill` -->

## Routing

> **Default to `render_template` (or `render_slides` for multi-page).**
> Custom HTML via `render_html_to_png` / `render_html_to_pdf` is the **last resort** — only when nothing in the table below matches. If the user mentions any phrasing in the left column, use the mapped tool.

| If user asks for ... | Use ... |
|---------------------|---------|
| Brief, letter, Korrespondenz, correspondence, briefing, Anschreiben | `render_template({ template: 'letter', markdown: '...' })` |
| Angebot, offer, proposal, service offer, Offerte | `render_template({ template: 'offer', markdown: '...', recipient: ..., date: ... })` |
| Rechnung, invoice, bill, Honorarnote | `render_template({ template: 'invoice', markdown: '...', recipient: ..., date: ... })` |
| AGB, ToS, terms of service, Nutzungsbedingungen, Geschäftsbedingungen, contract | `render_template({ template: 'tos', markdown: '...' })` |
| Report, Bericht, report, multi-page report, study, Studie, whitepaper | `render_template({ template: 'report', markdown: '...' })` |
| OG image, Open Graph image, blog share image, website share image, link preview image | `render_template({ template: 'social/og', vars: { ... } })` |
| LinkedIn banner, LinkedIn profile banner, LinkedIn cover, LinkedIn header | `render_template({ template: 'social/linkedin-banner', vars: { ... } })` |
| Twitter banner, X banner, Twitter/X banner, X profile banner, Twitter header | `render_template({ template: 'social/twitter-banner', vars: { ... } })` |
| YouTube banner, YouTube channel banner, YouTube channel art, YouTube cover | `render_template({ template: 'social/youtube-banner', vars: { ... } })` |
| Ankündigung, announcement post, announcement, launch post, news post | `render_template({ template: 'social/announcement', vars: { ... } })` |
| quote card, Zitat-Karte, LinkedIn quote post, square quote, quote post, pull quote | `render_template({ template: 'social/quote-card', vars: { ... } })` |
| stats card, Zahlen-Karte, big number post, stat post, metric card, KPI card | `render_template({ template: 'social/stats-card', vars: { ... } })` |
| LinkedIn post, LinkedIn image, LinkedIn shareable, LinkedIn portrait post, LinkedIn vertical post, LinkedIn feed post, LinkedIn content post, shareable image, social post, social image, feed post, post image | `render_template({ template: 'social/linkedin-post-portrait', vars: { ... } })` |
| LinkedIn carousel, Carousel post, multi-slide post | `render_slides({ pages: [{ template: 'carousel/title', vars }, { template: 'carousel/numbered-item', vars }, ...], dimensions: 'linkedin-portrait', outputs: { pdf: true, pngs: true } })` |
| Slide deck, presentation, Präsentation, Foliendeck | `render_slides({ markdown: '...', dimensions: 'slide-16-9', outputs: { viewer: true, pdf: true } })` |
| Long custom multi-page PDF | `render_html_to_pdf({ html: '...', format: 'A4' })` |
| Custom one-off design with no template match | `render_html_to_png({ html: '...', width, height })` or `render_html_to_pdf` |

If nothing matches and the request feels like it _should_ have a template, call `list_templates` before falling back to custom HTML — the registry may have grown since this skill was built.

<!-- /AUTO-GENERATED:ROUTING -->

## Other lookups

- **Don't have token values handy?** Call `get_tokens`, or check `references/brand-reference.md`.
- **Suspect the catalog above is stale?** Call `list_templates` — the registry is the live source of truth.

## HTML authoring rules (always, even without MCP)

When writing HTML for the brand:

- **Always inject brand tokens.** The MCP auto-injects `FONTS_URI` + `TOKENS_CSS` when calling render tools. In `<style>` blocks, write:
  ```html
  <style>
    {{ TOKENS_CSS | safe }}
    body { font-family: var(--font-body); color: var(--color-black); }
    h1   { font-family: var(--font-headline); color: var(--color-terracotta); }
  </style>
  ```
- **Color vars** (from `tokens.css`): `--color-cream`, `--color-black`, `--color-terracotta`, `--color-warm-gray-{100..900}`, etc.
- **Font vars**: `--font-headline` (Space Grotesk), `--font-body` (Inter), `--font-ui` (Manrope), `--font-mono` (JetBrains Mono).
- **Never** hardcode hex values, font names, or spacing values. If unsure of the exact name, call `get_tokens` or read `references/brand-reference.md`.
- **Starting points**: pick the closest existing template (`list_templates`) and mutate. Don't start from scratch if a template is 80% there.

## Output handling

- **Remote HTTP MCP** (default — `https://mcp.escapevelocity.consulting/mcp`): every render call returns a `WriteResult` with `{ kind: 'url', url, expiresAt }`. URLs are HMAC-signed, valid for 1 hour, and download directly (no auth header needed for the artifact URL). Present them to the user as plain links.
- **Local stdio MCP**: returns `{ kind: 'path', path }` with absolute paths in the conversation's working directory.

Multi-output tools (`render_slides`) return nested results: `{ viewer, pdf, pngs: [...], slideCount, width, height }`. Toggle the outputs you don't need to keep responses small.

## Workflow

1. **Classify** the request → pick the right tool.
2. If template-driven: **confirm the template name** via `list_templates` if unsure.
3. If authoring HTML: read tokens via `get_tokens` (or the brand reference sidecar).
4. **Author**: write HTML or fill template vars. Use brand CSS vars, never hardcode.
5. **Render**: call the appropriate render tool.
6. **Present**: return the signed URL (or file path) to the user. Iterate on their feedback by re-rendering.

## Examples

### Branded letter (PDF)
```
render_template({
  template: "letter",
  markdown: "# Angebot Process-Review\n\nSehr geehrte Frau Muster,\n\nanbei unser Vorschlag...",
  recipient: { name: "Anna Muster", company: "Muster GmbH", address: "Musterstr. 1\n1010 Wien" },
  date: "2026-05-25",
  lang: "de"
})
```

### OG image (PNG)
```
render_template({
  template: "social/og",
  vars: { TITLE: "Process-Review", SUBTITLE: "CIO-level clarity in 5 days" }
})
```

### Custom HTML → PNG (ad-hoc design)
```
render_html_to_png({
  html: `<!doctype html><html><head><style>
    {{ TOKENS_CSS | safe }}
    body{margin:0;width:1200px;height:1200px;display:grid;place-items:center;
         font-family:var(--font-headline);background:var(--color-cream);}
    .big{font-size:240px;color:var(--color-terracotta);font-weight:700;}
  </style></head><body><div class="big">+27%</div></body></html>`,
  width: 1200,
  height: 1200
})
```

### LinkedIn carousel (3 slides, PDF + PNGs)
```
render_slides({
  pages: [
    { template: "templates/carousel/title.html", vars: { EYEBROW: "Process-Review", BIGNUMBER: "1" } },
    { template: "templates/carousel/numbered-item.html", vars: { TITLE: "Step one" } },
    { template: "templates/carousel/cta.html", vars: { CTA: "Get the diagnostic" } }
  ],
  dimensions: "linkedin-portrait",
  outputs: { pdf: true, pngs: true }
})
```

### Slide deck from markdown (viewer + PDF)
```
render_slides({
  markdown: "<!-- @type: title -->\n# Process-Review\n\n===\n\n## Why\n\nSMBs lack CIO-level clarity.",
  dimensions: "slide-16-9",
  outputs: { viewer: true, pdf: true }
})
```

## Anti-patterns

- ❌ **Writing custom HTML for a standard asset type.** If the user's request matches *any* phrasing in the Routing table above (LinkedIn banner, OG image, quote post, letter, offer, invoice, etc.), call the mapped template tool — don't author HTML. Custom HTML is only for designs no template covers.
- ❌ Hardcoding hex values (`#c0392b`) or font names (`'Space Grotesk'`) in HTML you write. Use `var(--color-terracotta)` / `var(--font-headline)`.
- ❌ Calling N times for a multi-page render. Use `render_slides` with output toggles — one round trip.
- ❌ Writing full slide HTML from scratch for a presentation. Use markdown input mode with `===` separators + `<!-- @type: title|content|two-col|quote|image -->` directives.
- ❌ Calling `list_templates` on the hot path just to discover templates. The catalog above is already in your context — only call `list_templates` if you suspect drift.

## See also

- `references/brand-reference.md` — token table, CSS vars, design patterns
- `brand/CLAUDE.md` § MCP Server — how to register escape-velocity-brand on your workstation (Claude Code or Claude Desktop)
