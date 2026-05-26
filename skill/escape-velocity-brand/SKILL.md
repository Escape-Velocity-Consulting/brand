---
name: escape-velocity-brand
description: |
  Use when creating or rendering any Escape Velocity branded asset. Trigger
  on ANY request to: write a letter, draft an offer or proposal, make an
  invoice, create terms of service, produce a report, generate a LinkedIn
  post, banner, or carousel, build a slide deck, make a social image, or
  prototype an on-brand web page — even if the user doesn't say "brand" or
  "Escape Velocity" explicitly.
  German trigger terms: Brief, Angebot, Rechnung, AGB, Bericht, LinkedIn-Post,
  LinkedIn-Karussell, Foliendeck, Präsentation, Ankündigung, Zitat-Karte,
  Zahlen-Karte, Social-Bild, Landing Page.
  The skill ships templates, tokens, fonts, logos, the brand reference, and
  the canonical spec — it can author any of these standalone. The
  escape-velocity-brand MCP server is an OPTIONAL extension that adds
  pixel-perfect PNG/PDF rendering and publishing.
---

# Escape Velocity Brand

## Mental model

**I am the brand asset creator.** Templates, tokens, fonts, logos, the brand reference, and the canonical brand spec are bundled with me. I author HTML, SVG, and on-brand prototypes by reading my own files and substituting variables. The output works in any browser.

**The escape-velocity-brand MCP server is an optional extension** that adds two capabilities I don't have on my own:

- **Pixel rendering** — Playwright-driven HTML → PNG / HTML → PDF
- **Publishing** — promotes a render to a permanent public URL on the Brand Site

If the MCP is registered, prefer it for binary outputs (PDF, PNG) — the canonical templates render identically server-side. If the MCP isn't registered, I still produce the asset by handing the user finished HTML they can save and open in any browser.

## Brand identity defaults

These are fixed for all Escape Velocity assets. Pre-fill them whenever a template needs sender / company information.

| Field | Value |
|-------|-------|
| Name | Thomas (Tommi) Enenkel |
| Company | Thomas Enenkel GmbH |
| Brand | Escape Velocity |
| Address | Wiener Straße 11-13/2/3, 3002 Purkersdorf, Austria |
| Phone | +43 664 6522083 |
| Email | tommi.enenkel@escapevelocity.consulting |
| Website | escapevelocity.consulting |
| Meeting | https://meetings-eu1.hubspot.com/tommi-enenkel/meeting |
| UID (VAT) | ATU77669024 |
| IBAN | AT03 3266 7000 0003 8695 |

The `recipient` and `date` vars in document templates refer to the **client**, not the sender — the sender block is baked into the templates.

## Brand voice

All client-facing copy defaults to **German** unless the user explicitly requests English. Key rules:

- **Clear** — one idea per sentence; no jargon without explanation
- **Concrete** — use numbers, names, timelines; never "innovative solutions"
- **Calm** — no urgency, no all-caps, no "exclusive offer" language
- **Direct** — active voice, present tense ("Wir liefern" not "geliefert wird")

Formatting:
- Sentence case for headlines and labels (not Title Case)
- No emoji in client-facing documents (letters, offers, invoices, ToS)
- No exclamation marks in formal documents
- German typography: noun caps, „curly quotes", "ß" not "ss"

Full reference: `references/brand-reference.md`

## What's inside this skill bundle

```
escape-velocity-brand/
├── SKILL.md                    this file
├── references/
│   ├── brand-reference.md      token table, CSS vars, layout patterns, voice
│   ├── brand-spec.md           canonical brand contract (BRAND_SPEC.md)
│   └── templates.meta.json     template registry as JSON
├── tokens/
│   ├── tokens.css              CSS custom properties (--color-*, --font-*)
│   └── tokens.json             same values as JSON for lookups
├── templates/                  all 17 templates incl. _base.html, _recipient.html
│   ├── letter.html, offer.html, invoice.html, tos.html, report.html
│   ├── palette-sheet.html, presentation.html
│   ├── social/*.html           OG, LinkedIn, Twitter, YouTube, quote, stats, announcement
│   └── carousel/*.html         title, numbered-item, cta
├── fonts/                      Space Grotesk, Inter, Manrope, JetBrains Mono (woff2)
├── assets/logos/               brand wordmark + logo SVGs
├── components/radar.js         portable JS used by some slide templates
├── web/                        Brand Kit web bundle for prototyping
│   ├── starter.html            starter page using brand CSS
│   ├── README.md               dev guide
│   ├── site.css                brand website CSS (matches escapevelocity.consulting)
│   └── print.css               print-mode CSS
└── press/
    └── boilerplate.md          official "about us" boilerplate
```

## Capability matrix

| I want to produce ... | Skill alone | + MCP registered |
|---|---|---|
| Branded HTML document (letter, offer, invoice, tos, report) | ✅ read `templates/<key>.html` + `_base.html`, fill vars, hand user finished HTML | ✅ `render_template` → PDF URL |
| Social image as HTML | ✅ read `templates/social/<key>.html`, fill vars | ✅ `render_template` → PNG URL |
| Carousel slides as HTML | ✅ fill each `templates/carousel/<key>.html`, concatenate | ✅ `render_slides` → PDF + PNGs |
| Slide deck from markdown | ✅ author HTML from `templates/presentation.html` | ✅ `render_slides` with viewer |
| Ad-hoc on-brand HTML | ✅ use tokens + reference patterns | ✅ `render_html_to_png/pdf` |
| On-brand website prototype | ✅ start from `web/starter.html` + link `web/site.css` | ✅ same — render to PDF/PNG for sharing |
| Inline brand mark / logo | ✅ read `assets/logos/*.svg` | ✅ same |
| Read live token values | ✅ read `tokens/tokens.json` | ✅ `get_tokens` |
| Discover templates | ✅ read `references/templates.meta.json` | ✅ `list_templates` |
| PNG / PDF binary output | ❌ Playwright not available | ✅ |
| Permanent public URL on Brand Site | ❌ no server | ✅ `publish_artifact` |

## Authoring flow — skill-only (no MCP)

For social and carousel templates (flat, no inheritance):

1. Read `templates/<key>.html`.
2. Read `tokens/tokens.css`.
3. In the template's `<style>` block, replace `{{ TOKENS_CSS | safe }}` with the contents of tokens.css.
4. Replace `{{ FONTS_URI }}` with `./fonts` — the path is relative to where the user saves the HTML.
5. Substitute `{{ VAR }}` placeholders with the values you have; evaluate `{% if %}` / `{% for %}` blocks by hand.
6. Hand the user the finished HTML. Tell them: "Save as `<name>.html` next to a copy of the `fonts/` folder, or in any directory if you don't need brand fonts to load."

For document templates (letter, offer, invoice, tos, report) that use Nunjucks inheritance:

1. Read `templates/<key>.html`. The first line will be `{% extends "_base.html" %}`.
2. Read `templates/_base.html` — this is the page wrapper (letterhead, footer, font-face declarations).
3. Read `templates/_recipient.html` if the document uses `{% import "_recipient.html" as r %}`.
4. Compose the final HTML: take `_base.html` as the outer structure, and for every `{% block NAME %}{% endblock %}` placeholder in the base, slot in the matching `{% block NAME %}...{% endblock %}` content from the child template. The child's `{% block content %}` body goes inside the base's `{% block content %}` slot, etc.
5. Expand any `{{ r.macro_name(args) }}` calls by reading `_recipient.html` and inlining the relevant macro output.
6. Render the markdown body to HTML and substitute into `{{ CONTENT | safe }}`.
7. Replace `{{ TOKENS_CSS | safe }}` → tokens.css contents, `{{ FONTS_URI }}` → `./fonts`.
8. Hand the user the finished HTML.

## Authoring flow — MCP registered

If the escape-velocity-brand MCP is registered, prefer it for any binary output. The same templates exist server-side; just call:

```
render_template({ template: '<key>', vars: { ... }, markdown: '...' })
```

The MCP reads the canonical template (same files you have locally), substitutes variables, and renders with Playwright. Returns a signed URL. Don't author HTML yourself when the MCP is available — go through `render_template`. Only fall back to authoring inline HTML when no template matches the request.

## MCP tools as extension

When the escape-velocity-brand MCP is registered, these tools become available. They're the *rendering* and *publishing* layer on top of the skill's authoring capability.

### Render

| Tool | Use when |
|------|----------|
| `render_template` | Pick a template key, fill vars (+ optional markdown body) → PNG or PDF |
| `render_slides` | Multi-page output (carousel, slide deck) → viewer + PDF + PNGs |
| `render_html_to_png` | Custom HTML you authored → PNG. Last-resort tool. |
| `render_html_to_pdf` | Custom HTML → PDF. Last-resort tool. |

### Publishing (HTTP transport)

| Tool | Use when |
|------|----------|
| `publish_artifact` | User says "publish this" after a `render_slides` call. Pass the `bundleId` from the render response. Returns the stable ID + URL. |
| `unpublish_artifact` | User says "unpublish <id>" with an ID they read from the Brand Site card. Idempotent. |
| `list_published` | User wants to see what's currently published. Optional `type` filter. |

### Introspection

| Tool | Use when |
|------|----------|
| `list_templates` | Discover templates the MCP knows about (mirrors `references/templates.meta.json`). |
| `get_tokens` | Read live tokens from server (mirrors `tokens/tokens.json`). |

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

## Slide design rules

The presentation template (`render_slides` markdown mode) ships with named slide layouts. Pick the right layout *first*, then write the content. Reaching for `@type: html` to lay out a list-shaped slide produces inline-style spam that loses the brand voice.

### Layout decision tree

| Content shape | Use `@type:` |
|---------------|--------------|
| Deck cover (logo + title + author + QR auto-bakes on publish) | `title` |
| Chapter / section divider (single word or short phrase) | `section` |
| Narrative prose, ≤6 bullets, ≤80 words | `content` |
| Symmetric A/B pair (e.g. "Optimierung" vs "Wachstum") | `two-col` |
| Opinionated contrast (old way vs new way, before/after, generic vs branded) | `comparison` |
| Direct quotation with attribution | `quote` |
| 3–8 short parallel items (tools, threats, principles) | `cards` |
| Stat / impact line (one big number + caption) | `big-number` |
| Real image (photo, screenshot, diagram file) | `image` with `![](url)` |
| Meme / punchline (emoji + headline only — no caption, no subtitle) | `image` with `# 🥋` headline syntax |
| Custom SVG, chart, anything no layout supports | `html` (last resort) |

### Slide directives reference

All directives use `<!-- @key: value -->` syntax, one per line, at the top of a slide block:

| Directive | Slide types | Effect |
|-----------|-------------|--------|
| `@type:` | all | Layout selector (see table above). |
| `@bg:` | all | Background variant: `cream` (default), `light`, `black`, `terracotta`. Foreground colors auto-adapt. |
| `@chrome:` | all | `none` suppresses the wordmark + page-number footer (image / meme / hero slides). |
| `@notes:` | all | Speaker notes (not rendered in viewer; kept for export). |
| `@author:` | `title` | Override the default author byline (`Tommi Enenkel · Escape Velocity Consulting`). |
| `@date:` | `title` | Appends ` · <date>` to the author byline. Keeps the date out of the subtitle. |
| `@qr:` | `title` | `none` suppresses the QR slot; an explicit URL bakes that destination; default leaves a placeholder that `publish_artifact` fills with the publication's detail-page URL. |
| `@qr-image:` | `title` | Static image (e.g. project mark) in the right-hand slot instead of a QR. |
| `@qr-caption:` | `title` | Override the caption beneath the QR (default: `Get the slides!`). |
| `@source:` | `quote` | Attribution line. Alternative to writing `— Source · Author` with an em-dash. |

### Authoring rules

- **Section / chapter slides:** `# Title` is canonical. The parser also accepts `## Title` as a safety net, but write `#`.
- **Quote slides:** put the quotation in `> ` lines. Attribute the source with either `<!-- @source: ... -->` (preferred) or a single line starting with an em-dash (`— Source · Date`). Never bury the source inside the blockquote.
- **Custom HTML escape hatch (`@type: html`):** the *leading* `## Title` line is auto-extracted and rendered as a styled heading above the raw HTML. The rest is raw — markdown is **not** parsed inside. Prefer the utility classes below over inline `style="…"` attributes.
- **Title slides** automatically get the logo, the author byline, and a QR placeholder. The publish step fills the QR with the detail-page URL of the publication.

### Utility classes inside `@type: html`

Shipped with the presentation viewer — use these instead of inline styles when you must reach for the escape hatch:

| Class | What it gives you |
|-------|-------------------|
| `.ev-card` | Cream-bg panel with terracotta left border and rounded corners. |
| `.ev-card--dark` | Same shape on a dark background. |
| `.ev-eyebrow` | Manrope 600 uppercase eyebrow text. |
| `.ev-dash-list` | `<ul>` with the brand's terracotta dash bullets (no inline span hacks needed). |
| `.ev-grid-2` / `.ev-grid-3` / `.ev-grid-4` | Equal-column grid containers. |
| `.ev-accent` | Terracotta text color. |
| `.ev-quote-bar` | Left terracotta border + matching padding. |

### Visual rules

- **One accent per slide.** Pick the single most important word/phrase, mark it terracotta — `**bold**` inside a title-slide H1 renders as the highlight; `<strong>` inside `content` slides; `.ev-accent` inside `html` slides. Sprinkling terracotta on multiple words per slide weakens every accent.
- **Density cap.** Content slides max ~6 bullets or ~80 words. If you exceed that, split into two slides instead of shrinking text.
- **Lists vs. grids.** 3+ short parallel items with a `**Title** — body` shape → `cards`. One dense narrative list → `content`.
- **Memes carry themselves.** Use `@type: image` with a single emoji or short headline. Pair with `@chrome: none` so the brand footer doesn't intrude on the punchline.

### Contrast adaptation (text color by background)

Backgrounds dictate which tokens are valid for text. The shipped slide CSS already adapts per `[data-bg]`; the rules below cover any text you author inside `@type: html` blocks, and any new slide type contributed later.

| Background | Primary text | Secondary / body | Subtle / labels |
|------------|--------------|------------------|-----------------|
| `cream` / `light` | `--color-text` (#1A1816) | `--color-body` (#5C5650) | `--color-subtle` (#807A74) |
| `black` | `--color-cream` (#F9F7F4) | `rgba(255,255,255,0.88)` | `rgba(255,255,255,0.72)` |
| `terracotta` | `--color-cream` | `--color-cream` | `rgba(255,255,255,0.85)` |

Hard rules:

- **`--color-subtle` (#807A74) is fg-on-cream only.** It is *not* valid on black or terracotta — it disappears.
- **`--color-muted` (#C4BEB8) is a background tint, not body text.** Using it for foreground text on cream produces near-invisible labels (this was the page-number bug before).
- **Quote attributions, page numbers, footers, captions** all need explicit per-bg color rules. Default to body color on light, ≥0.72 white on dark.
- **`<strong>` accents** stay terracotta on light backgrounds; on terracotta backgrounds they collapse to cream (they'd be invisible otherwise).

## HTML authoring rules

Whether using `render_template` (MCP) or authoring inline, the same rules apply:

- **Inject brand tokens.** In `<style>` blocks, write:
  ```html
  <style>
    {{ TOKENS_CSS | safe }}
    body { font-family: var(--font-body); color: var(--color-black); }
    h1   { font-family: var(--font-headline); color: var(--color-terracotta); }
  </style>
  ```
  Skill-only: replace `{{ TOKENS_CSS | safe }}` with the contents of `tokens/tokens.css`. The MCP does this substitution automatically — its `TOKENS_CSS` injection also includes resolved `@font-face` declarations so fonts load without needing the templates to declare them.
- **Color vars** (from `tokens/tokens.css`): `--color-cream`, `--color-black`, `--color-terracotta`, `--color-accent`, `--color-light`, `--color-muted`, `--color-warm-gray-{100..900}`, etc.
- **Font vars**: `--font-headline` (Space Grotesk), `--font-body` (Inter), `--font-ui` (Manrope), `--font-mono` (JetBrains Mono).
- **Never** hardcode hex values, font names, or spacing values. Use the CSS vars.
- **Starting points**: read `templates/` directly — the canonical files are bundled with you. Don't recreate a template from memory.
- **Logos**: read `assets/logos/*.svg` and inline as needed. Use the `light` variants on dark backgrounds, `dark` variants on cream backgrounds.

## Website prototyping

The `web/` folder is the Brand Kit web bundle — a starter for building on-brand pages and prototypes that match `escapevelocity.consulting/brand/`.

- `web/starter.html` — a minimal HTML page that links `tokens.css` + `site.css` and demonstrates the brand's hero pattern. Start here for any landing page or mockup.
- `web/site.css` — the same CSS the production brand website uses. Layouts, components, vertical rhythm, color theming.
- `web/print.css` — print-mode rules (light bg, no images, etc.).
- `web/README.md` — short developer guide.

When the user asks for a landing page, marketing prototype, or any web page mockup, fork from `web/starter.html`, drop in their content, and hand them the finished HTML. They open it in a browser and see something visually consistent with the production brand site.

## Output handling

- **MCP path** — every render call returns a `WriteResult`. HTTP transport: `{ kind: 'url', url, expiresAt }` (signed URL, valid 1h, downloads directly). Stdio transport: `{ kind: 'path', path }` (absolute file path). Multi-output (`render_slides`) returns nested `{ viewer, pdf, pngs, ... }`.
- **Skill-only path** — return the final HTML as a string in your reply, plus a suggested filename and a note: "Save this and open in a browser. Copy the `fonts/` folder from the skill bundle next to the file if you want brand fonts to load — otherwise the page falls back to system fonts."

## Examples

### Letter — MCP path

```
render_template({
  template: "letter",
  markdown: "# Angebot Process-Review\n\nSehr geehrte Frau Muster,\n\nanbei unser Vorschlag...",
  recipient: { name: "Anna Muster", company: "Muster GmbH", address: "Musterstr. 1\n1010 Wien" },
  date: "2026-05-25",
  lang: "de"
})
```

### Letter — skill-only path

1. Read `templates/letter.html`, `_base.html`, `_recipient.html`, `tokens/tokens.css`.
2. In `_base.html`, find `{% block content %}{% endblock %}`. Replace with the content block from `letter.html`. Do the same for `{% block styles %}`.
3. Render the markdown body → HTML, substitute into `{{ CONTENT | safe }}`.
4. Inline the recipient via the `r.macro` calls from `_recipient.html`.
5. Replace `{{ TOKENS_CSS | safe }}` with tokens.css contents and `{{ FONTS_URI }}` with `./fonts`.
6. Hand user the HTML. Suggested filename: `letter-anna-muster-2026-05-25.html`.

### LinkedIn post — MCP path

```
render_template({
  template: "social/linkedin-post-portrait",
  vars: { EYEBROW: "Process-Review", HEADLINE: "CIO-level clarity in 5 days", BODY: "...", CTA: "escapevelocity.consulting/quiz" }
})
```

### LinkedIn post — skill-only path

Read `templates/social/linkedin-post-portrait.html`, inline tokens, substitute `{{ EYEBROW }}` / `{{ HEADLINE }}` / `{{ BODY }}` / `{{ CTA }}`, hand user the HTML. The template already has `@font-face` declarations using `{{ FONTS_URI }}` — replace that with `./fonts`.

### LinkedIn carousel (3 slides)

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

Skill-only path: fill each carousel template, hand the user three HTML files (or one combined preview). No PDF without the MCP.

### Slide deck from markdown

```
render_slides({
  markdown: "<!-- @type: title -->\n# Process-Review\n\n===\n\n## Why\n\nSMBs lack CIO-level clarity.",
  dimensions: "slide-16-9",
  outputs: { viewer: true, pdf: true }
})
```

### Website prototype

User asks: "make me an on-brand landing page for the Process-Review service."

1. Read `web/starter.html`, `web/site.css`, `web/print.css`, `tokens/tokens.css`.
2. Adapt `starter.html` — replace placeholder content with the user's copy. Keep the `<link rel="stylesheet" href="./site.css">` and tokens import.
3. Hand the user three files (`index.html`, `site.css`, `print.css`) plus the `fonts/` folder. They drop the bundle into a directory and open `index.html`.

## Anti-patterns

General:

- ❌ **Writing custom HTML for a standard asset type.** If the user's request matches any phrasing in the Routing table above, use the mapped template — don't author HTML from scratch. Custom HTML is only for designs no template covers.
- ❌ **Recreating a template from memory.** The canonical files are bundled with you under `templates/`. Read them.
- ❌ **Hardcoding hex values** (`#c0392b`) or font names (`'Space Grotesk'`) in HTML you write. Use `var(--color-terracotta)` / `var(--font-headline)`.
- ❌ **Calling N times for a multi-page render.** Use `render_slides` with output toggles — one round trip.
- ❌ **Calling `list_templates` on the hot path.** The catalog above is already in your context — only call it if you suspect drift.

Slide-specific (markdown mode of `render_slides`):

- ❌ **Writing custom HTML for a list of parallel items.** Use `@type: cards` — the layout auto-grids and styles each card.
- ❌ **Adding a subtitle below a meme.** Use `@type: image` with a `# 🥋` headline + `@chrome: none`; no caption, no subtitle. The punchline lives alone.
- ❌ **Using `##` for section/chapter slide titles** as a deliberate choice. The parser tolerates it as a safety net, but `#` is canonical for section/title slides.
- ❌ **Burying the quote source inside the blockquote.** Use `<!-- @source: ... -->` or an em-dash attribution line on its own.
- ❌ **Inline `style="font-size: …; font-family: …; color: …"`** inside `@type: html`. Use the `.ev-card` / `.ev-grid-3` / `.ev-dash-list` / `.ev-accent` utility classes; they pick up tokens automatically.
- ❌ **Marking three different words terracotta on one slide.** One accent per slide. Pick the *point* of the slide.
- ❌ **Cramming a content slide past ~6 bullets or ~80 words.** Split into multiple slides instead of shrinking text.
- ❌ **`--color-subtle` (#807A74) or `--color-muted` (#C4BEB8) as foreground on dark backgrounds.** They render as low-contrast smudges. Use `--color-cream` / `rgba(255,255,255,0.72+)` on dark, `--color-body` / `--color-subtle` on light. See the contrast pair table above.
- ❌ **Putting the date in the title-slide subtitle.** Use `<!-- @date: ... -->` — it appends to the author byline at the bottom of the slide so the subtitle stays a clean tagline.

### Worked example: `previews/decks/reference-deck.md`

The repo ships a canonical 10-slide example exercising every type and directive. It's the right starting point when authoring a new deck — read it before composing from scratch. The reference covers:

- Light-themed title slide with `**accent**` h1, `@date:`, QR auto-bake
- Dark quote with `@source:`
- `@type: section` (cream + black variants)
- `@type: content` with bullets + bold accent
- `@type: big-number` with eyebrow + caption
- `@type: cards` (6-up auto-grid)
- `@type: image` + `@chrome: none` (emoji punchline)
- `@type: comparison` (muted vs. accent)
- Terracotta closing title with QR + email subtitle

Render locally:
```
npm run pres -- previews/decks/reference-deck.md --output previews/decks/reference-deck
```

Or bake with publish-time QR (needs MCP-stack dependencies):
```
npm run build:reference-deck
```

## See also

- `references/brand-reference.md` — token table, CSS vars, design patterns, voice
- `references/brand-spec.md` — canonical brand contract (BRAND_SPEC.md)
- `references/templates.meta.json` — template registry as JSON
- `tokens/tokens.css` and `tokens/tokens.json` — design tokens
- `templates/` — canonical template files
- `web/` — Brand Kit web bundle for prototyping
- `assets/logos/` — brand mark SVGs
- `components/radar.js` — radar chart component used in some slides
- `press/boilerplate.md` — official "about us" copy
