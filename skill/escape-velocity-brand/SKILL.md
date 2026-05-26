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

- ❌ **Writing custom HTML for a standard asset type.** If the user's request matches any phrasing in the Routing table above, use the mapped template — don't author HTML from scratch. Custom HTML is only for designs no template covers.
- ❌ **Recreating a template from memory.** The canonical files are bundled with you under `templates/`. Read them.
- ❌ **Hardcoding hex values** (`#c0392b`) or font names (`'Space Grotesk'`) in HTML you write. Use `var(--color-terracotta)` / `var(--font-headline)`.
- ❌ **Calling N times for a multi-page render.** Use `render_slides` with output toggles — one round trip.
- ❌ **Calling `list_templates` on the hot path.** The catalog above is already in your context — only call it if you suspect drift.

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
