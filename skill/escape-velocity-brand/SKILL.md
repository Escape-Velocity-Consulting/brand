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
| `social/og` | 1200×630 | Open Graph image (1200×630). For website / blog post sharing. SUBTITLE accepts inline markup — wrap a phrase in <span class="accent">…</span> to color just that part terracotta. | `TITLE`, `SUBTITLE` |
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
| **Slide 1 only** — deck cover (logo + title + author + QR auto-bakes on publish) | `title` |
| **Last slide only** — end-card mirroring the title chrome (logo + author + QR) | `closing` |
| Chapter / section divider, "Tipp #N" intro, pause slide — anything mid-deck with a big word | `section` |
| Bold single-sentence impact statement or one-word punch — centered, chrome visible | `statement` |
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
| `@author:` | `title`, `closing` | Override the default author byline (`Tommi Enenkel`). |
| `@date:` | `title`, `closing` | Appends ` · <date>` to the author byline. Keeps the date out of the subtitle. |
| `@qr:` | `title`, `closing` | `none` suppresses the QR slot; an explicit URL bakes that destination; default leaves a placeholder that `publish_artifact` fills with the publication's detail-page URL. |
| `@qr-image:` | `title`, `closing` | Static image (e.g. project mark) in the right-hand slot instead of a QR. |
| `@qr-caption:` | `title`, `closing` | Override the caption beneath the QR (default: `Get the slides!`). |
| `@source:` | `quote` | Attribution line. Alternative to writing `— Source · Author` with an em-dash. |

### Authoring rules

- **`@type: title` is slide-1-only.** Exactly one per deck, always the first slide. It carries the logo, author byline, and QR auto-bake slot. If you use `@type: title` on slide 2+, the renderer downgrades it to `@type: section` and pushes a `title_misuse` warning into `result.warnings` — your deck still renders, but you'll see the warning.
- **`@type: closing` is for the last slide.** It mirrors the title chrome exactly — logo, author byline, QR auto-bake slot — but carries a "Danke!" or CTA headline instead of the deck title. Use `<!-- @bg: terracotta -->` for a strong end-card. Both title and closing slides are baked with the QR on publish.
- **`@type: statement` is a centered impact slide.** One sentence or one word, rendered large (`clamp(52px, 6vw, 96px)`), chrome (logo + page number) visible. Use `**bold**` in the `# Headline` to accent one word in terracotta (cream on dark/terracotta bg). An optional second paragraph becomes a smaller subtitle. Good for: thesis statements, provocations, pause moments.
- **Section / chapter slides:** `# Title` is canonical. The parser also accepts `## Title` as a safety net, but write `#`. Sections have no logo, no byline, no QR — they're the big-word divider, on a `cream` / `black` / `terracotta` background.
- **Quote slides:** put the quotation in `> ` lines. Attribute the source with either `<!-- @source: ... -->` (preferred) or a single line starting with an em-dash (`— Source · Date`). Never bury the source inside the blockquote.
- **Custom HTML escape hatch (`@type: html`):** the *leading* `## Title` line is auto-extracted and rendered as a styled heading; the renderer also auto-wraps your body in `<div class="ev-canvas">` so you don't have to ship padding boilerplate. Markdown is **not** parsed inside. Use the `.ev-*` utility classes — see the recipe library below.
- **Title and closing slides** automatically get the logo, the author byline (`Tommi Enenkel`), and a QR placeholder. The publish step fills the QR with the detail-page URL. If your markdown already contains a byline-shaped line, the renderer auto-strips it from the subtitle to avoid duplication.

### `@type: html` — recipes + utility palette

The canvas contract:
1. Open with a `## Heading` line — the renderer extracts it and emits `<h2 class="ev-h2">Heading <span class="ev-rule"></span></h2>`.
2. Write your body **without** padding wrappers — the renderer auto-wraps in `<div class="ev-canvas">`.
3. Reach for `.ev-*` classes for visual patterns. **Never** inline `style="..."` for color, font-family, font-size, font-weight, or background — the renderer's linter pushes warnings into `result.warnings` for each violation.
4. `TOKENS_CSS` is already injected at the slide level. Don't re-inject inside your `@type: html` block — the linter will warn.

**Forbidden in `@type: html`:**
- Inline `style="color: …; font-family: …; font-size: …; background: …"` — use `.ev-*` classes
- Hardcoded hex colors (`#abc123`) outside `<svg>` — use `var(--color-*)`
- Hardcoded font names (`'Inter'`, `'Space Grotesk'`) — use `var(--font-*)`
- `var(--color-warm-gray-300)` for thin lines or small text — it disappears on cream. Use `var(--color-text)` with reduced opacity instead.

#### Recipe — Multiplier (`1× → 10× → 100×`)

```html
<!-- @type: html -->
## Aber in Teil zwei verrennt er sich

<p class="ev-lead">Wenn KI dich zehnfach produktiv macht, macht sie auch jeden in deinem Team zehnfach produktiv.</p>
<div class="ev-mult-row">
  <div class="ev-mult-col">
    <div class="ev-mult-num">1×</div>
    <div class="ev-mult-box ev-mult-box--sm">heute</div>
  </div>
  <div class="ev-mult-arrow">→</div>
  <div class="ev-mult-col">
    <div class="ev-mult-num ev-mult-num--lg ev-accent">10×</div>
    <div class="ev-mult-box ev-mult-box--md">mit KI</div>
  </div>
  <div class="ev-mult-arrow">→</div>
  <div class="ev-mult-col">
    <div class="ev-mult-num ev-mult-num--xl">100×</div>
    <div class="ev-mult-box ev-mult-box--lg">10 Leute, Kompounding</div>
  </div>
</div>
<p class="ev-foot"><strong>Mehr Output pro Kopf. Nicht null Köpfe.</strong></p>
```

#### Recipe — Process flow

```html
<!-- @type: html -->
## Prozesse: Wie KI integrieren?

<div class="ev-flow">
  <div class="ev-flow-step">Input</div>
  <div class="ev-flow-line" data-label="KI-Andock" data-dock><span class="ev-flow-dock"></span></div>
  <div class="ev-flow-step">Verarbeitung</div>
  <div class="ev-flow-line" data-label="KI-Andock" data-dock><span class="ev-flow-dock"></span></div>
  <div class="ev-flow-step">Entscheidung</div>
  <div class="ev-flow-line"></div>
  <div class="ev-flow-step">Output</div>
</div>
<p class="ev-foot">KI ersetzt eure Prozesse nicht. Sie wird in sie integriert.</p>
```

#### Recipe — Spectrum (axis with marker + shift)

```html
<!-- @type: html -->
## Das Enablement-Spektrum

<div class="ev-spectrum" style="--from: 32%; --to: 68%; --at: 32%;">
  <div class="ev-spectrum-axis">
    <div class="ev-spectrum-marker"></div>
    <div class="ev-spectrum-shift"></div>
  </div>
  <div class="ev-spectrum-shift-label">KI verschiebt den Punkt</div>
  <div class="ev-spectrum-ends">
    <div>Alles auslagern<span>IT-Firmen, Agenturen</span></div>
    <div>Alles selber machen<span>eigenes Team, eigene Tools</span></div>
  </div>
</div>
<p class="ev-foot">Regular People können jetzt mehr selbst tun.</p>
```

(The `--from`, `--to`, `--at` custom properties on the wrapper position the shift bar and marker as percentages along the axis — geometry-only, not visual styling, so they're acceptable inline.)

#### Recipe — Tier ladder (emphasized middle)

```html
<!-- @type: html -->
## Wie es weitergeht

<div class="ev-tiers">
  <div class="ev-tier">
    <div class="ev-tier-eyebrow">Hilf mir lernen</div>
    <div class="ev-tier-title">Richtung selber machen</div>
    <div class="ev-tier-offer">
      <div class="ev-tier-offer-title">Use Case Consultation</div>
      <div class="ev-tier-offer-meta">€250</div>
    </div>
  </div>
  <div class="ev-tier ev-tier--emphasized">
    <div class="ev-tier-eyebrow">Lass uns gemeinsam bauen</div>
    <div class="ev-tier-title">Mein eigentlicher Modus</div>
    <div class="ev-tier-offer">
      <div class="ev-tier-offer-title">1:1 Coaching</div>
      <div class="ev-tier-offer-meta">€500 / Session</div>
    </div>
    <div class="ev-tier-offer">
      <div class="ev-tier-offer-title">Aha! Workshop</div>
      <div class="ev-tier-offer-meta">€2.500</div>
    </div>
  </div>
  <div class="ev-tier">
    <div class="ev-tier-eyebrow">Übernimm das für mich</div>
    <div class="ev-tier-title">Richtung auslagern</div>
    <div class="ev-tier-offer">
      <div class="ev-tier-offer-title">Tech Upgrade</div>
      <div class="ev-tier-offer-meta">Projektbasiert</div>
    </div>
  </div>
</div>
```

#### Full utility class reference

| Class | What it gives you |
|-------|-------------------|
| `.ev-canvas` | Body-font, body-color wrapper. Auto-applied by the renderer. |
| `.ev-h2` | Slide H2 — Space Grotesk 56px 700. Auto-emitted when your html block starts with `## Heading`. |
| `.ev-rule` | 60×3px terracotta accent block. |
| `.ev-lead` | Inter 26px lead paragraph (left-aligned, max-width 1400px). |
| `.ev-foot` | 24px centered foot paragraph for closing line under a visual. |
| `.ev-eyebrow` | Manrope 700 uppercase terracotta eyebrow text. |
| `.ev-accent` | Terracotta text color (use on a single span for one-accent-per-slide). |
| `.ev-card` / `.ev-card--dark` | Cream/dark panel with terracotta left border. |
| `.ev-dash-list` | `<ul>` with terracotta dash bullets. |
| `.ev-grid-2` / `.ev-grid-3` / `.ev-grid-4` | Equal-column grid containers. |
| `.ev-quote-bar` | Left terracotta border + padding. |
| `.ev-flow` + `.ev-flow-step` + `.ev-flow-line[data-label][data-dock]` | Horizontal step process. |
| `.ev-spectrum` + axis + marker + shift + ends | Axis with point marker + shift arrow + endpoint labels. |
| `.ev-tiers` + `.ev-tier` + `.ev-tier--emphasized` + `.ev-tier-offer*` | 3-column ladder, middle tier visually lifted. |
| `.ev-mult-row` + `.ev-mult-col` + `.ev-mult-num[--lg|--xl]` + `.ev-mult-box[--sm|--md|--lg]` + `.ev-mult-arrow` | Multiplier visualization (1× → 10× → 100×). |

### Visual rules

- **One accent per slide.** Pick the single most important word/phrase, mark it terracotta — `**bold**` inside a title-slide H1 renders as the highlight; `<strong>` inside `content` slides; `.ev-accent` inside `html` slides. Sprinkling terracotta on multiple words per slide weakens every accent.
- **Density cap.** Content slides max ~6 bullets or ~80 words. If you exceed that, split into two slides instead of shrinking text.
- **Lists vs. grids.** 3+ short parallel items with a `**Title** — body` shape → `cards`. One dense narrative list → `content`.
- **Memes carry themselves.** Use `@type: image` with a single emoji or short headline. Pair with `@chrome: none` so the brand footer doesn't intrude on the punchline.

### Density & overflow

- **Content slides cap at ~6 bullets / ~80 words.** If you exceed that, the renderer's Playwright overflow check emits a `{type: 'overflow', slideIndex: N}` warning in `result.warnings`. Don't shrink text — split into multiple slides.
- **Image-headline slides** auto-clamp to `clamp(72px, 9vw, 200px)` and use `text-wrap: balance`. Long sentence headlines still wrap into multiple lines; very long ones still overflow and warn.
- **Big-number slides** cap at `clamp(120px, 14vw, 220px)` — 30% smaller than the previous cap. Long captions go in the body copy beneath, not in the number itself.

### Contrast adaptation (text color by background)

Backgrounds dictate which tokens are valid for text. The shipped slide CSS already adapts per `[data-bg]`; the rules below cover any text you author inside `@type: html` blocks, and any new slide type contributed later.

| Background | Primary text | Secondary / body | Subtle / labels |
|------------|--------------|------------------|-----------------|
| `cream` / `light` | `--color-text` (#1A1816) | `--color-body` (#5C5650) | `--color-subtle` (#807A74) |
| `black` | `--color-cream` (#F9F7F4) | `rgba(255,255,255,0.88)` | `rgba(255,255,255,0.72)` |
| `terracotta` | `--color-cream` | `--color-cream` | `rgba(255,255,255,0.85)` |

Hard rules:

- **Small-text rule (24px and below).** Any text smaller than ~24px on cream uses `--color-text`, not `--color-body` or `--color-subtle`. The brand templates already apply this to page numbers, quote attributions, byline, subtitle — but any custom HTML you write must respect it. On dark backgrounds, small text uses `--color-cream` (not `rgba(255,255,255, 0.7)` — too washed out, this was the v4 quote-attribution bug).
- **`--color-subtle` (#807A74) is fg-on-cream only.** It is *not* valid on black or terracotta — it disappears.
- **`--color-muted` (#C4BEB8) is a background tint, not body text.** Using it for foreground text on cream produces near-invisible labels (this was the page-number bug before).
- **`--color-warm-gray-300` is unsafe on cream for thin lines.** Use `var(--color-text)` with reduced opacity (the `.ev-flow-line` / `.ev-rule` / `.ev-spectrum-axis` utilities handle this automatically).
- **Quote attributions, page numbers, footers, captions** all need explicit per-bg color rules. Default to `--color-text` on cream, `--color-cream` on dark.
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
  Skill-only (no MCP): replace `{{ TOKENS_CSS | safe }}` with the contents of `tokens/tokens.css`. Via the MCP (`render_html_to_png` / `render_html_to_pdf`): the brand tokens + resolved `@font-face` declarations are injected into the output **automatically**, so `var(--color-*)` and brand font-families resolve even with no `{{ TOKENS_CSS }}` placeholder and no font declarations at all. Including the placeholder is still fine for explicit placement. **Do not** react to a styling problem by stripping your token/font CSS *and* switching to bare `var(--color-*)` while assuming the vars are predefined — and do not hardcode hex/font values to "force" a color; the auto-inject already covers you.
- **Color vars** (from `tokens/tokens.css`): `--color-cream`, `--color-black`, `--color-terracotta`, `--color-accent`, `--color-light`, `--color-muted`, `--color-warm-gray-{100..900}`, etc.
- **Font vars**: `--font-headline` (Space Grotesk), `--font-body` (Inter), `--font-ui` (Manrope), `--font-mono` (JetBrains Mono).
- **Never** hardcode hex values, font names, or spacing values. Use the CSS vars.
- **Starting points**: read `templates/` directly — the canonical files are bundled with you. Don't recreate a template from memory.
- **Logos**: read `assets/logos/*.svg` and inline as needed. They are outlined (no font dependency). Names follow `{mark}-{surface}-{frame}` — mark `monogram|stacked|inline`, frame `square|margin|padded|bare`, surface `dark|light|terracotta|transparent-light|transparent-dark|transparent-mono-light|transparent-mono-dark`. Pick by surface: `*-dark-*` on dark backgrounds, `*-light-*` on cream, `*-terracotta-*` on terracotta, `transparent-light`/`transparent-dark` (two-tone, accent kept) over photos, `transparent-mono-light`/`transparent-mono-dark` (flat single-colour knockouts) for graphics. Legacy names (`logo-dark.svg`, `ev-wordmark.svg`, …) still resolve as aliases.

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

- ❌ **Using `@type: title` past slide 1.** Title chrome (logo + byline + QR slot) is reserved for the deck cover. For chapter dividers, "Tipp #N" intros, and pause slides, use `@type: section`. The renderer will downgrade misused titles to section and push a `title_misuse` warning into `result.warnings`.
- ❌ **Using `@type: section` for the closing / thank-you slide.** The last slide should be `@type: closing` — it mirrors the title chrome (logo + author + QR). `@type: section` has no chrome and won't get the QR bake.
- ❌ **Using `@type: section` for a single-word punchline or thesis statement.** Sections are chrome-free dividers. If the content is a punchy sentence with emphasis (`**bold**`), use `@type: statement` — it has chrome and accent support.
- ❌ **Repeating the author byline in the title-slide subtitle.** The title and closing slides auto-render "Tommi Enenkel" at the bottom. If your subtitle also includes that line, the renderer auto-strips it — but don't put it there in the first place; the subtitle is for the value-prop tagline or CTA.
- ❌ **Re-injecting `{{ TOKENS_CSS }}` inside `@type: html`.** The presentation template already injects tokens at the document level. Re-injecting inside your fragment is wasteful and signals stale skill teaching; the linter warns.
- ❌ **Writing custom HTML for a list of parallel items.** Use `@type: cards` — the layout auto-grids and styles each card.
- ❌ **Adding a subtitle below a meme.** Use `@type: image` with a `# 🥋` headline + `@chrome: none`; no caption, no subtitle. The punchline lives alone.
- ❌ **Using `##` for section/chapter slide titles** as a deliberate choice. The parser tolerates it as a safety net, but `#` is canonical for section/title slides.
- ❌ **Burying the quote source inside the blockquote.** Use `<!-- @source: ... -->` or an em-dash attribution line on its own.
- ❌ **Inline `style="font-size: …; font-family: …; color: …"`** inside `@type: html`. Use the `.ev-card` / `.ev-grid-3` / `.ev-dash-list` / `.ev-accent` utility classes; they pick up tokens automatically.
- ❌ **Marking three different words terracotta on one slide.** One accent per slide. Pick the *point* of the slide.
- ❌ **Cramming a content slide past ~6 bullets or ~80 words.** Split into multiple slides instead of shrinking text.
- ❌ **`--color-subtle` (#807A74) or `--color-muted` (#C4BEB8) as foreground on dark backgrounds.** They render as low-contrast smudges. Use `--color-cream` / `rgba(255,255,255,0.72+)` on dark, `--color-body` / `--color-subtle` on light. See the contrast pair table above.
- ❌ **Putting the date in the title-slide subtitle.** Use `<!-- @date: ... -->` — it appends to the author byline at the bottom of the slide so the subtitle stays a clean tagline.

### Worked example: `examples/reference-deck.md`

The skill bundles a canonical 23-slide type catalog at `examples/reference-deck.md`. **Read it before authoring a new deck** — it shows every layout in all bg variants with correct syntax. When starting a new deck, copy from it rather than writing from memory.

It covers all types in all bg variants (`cream` / `black` / `terracotta`):

- `@type: title` — cream, `**accent**` h1, `@date:`, QR auto-bake slot
- `@type: section` — cream with eyebrow (`> Step 1`), black, terracotta
- `@type: statement` — cream (accent word), black (single bold word), terracotta
- `@type: content` — bullets with `**bold**` + `*italic*`, H3 eyebrow variant
- `@type: cards` — 6-up auto-grid
- `@type: two-col` — symmetric pair
- `@type: comparison` — opinionated before/after
- `@type: quote` — black with `@source:`, cream
- `@type: big-number` — black, eyebrow + caption
- `@type: image` — chrome on vs. `@chrome: none` (full-bleed)
- `@type: html` — multiplier, spectrum, flow, tier ladder, canvas utilities
- `@type: closing` — terracotta, `**accent**` h1, QR auto-bake slot

Published live: `https://mcp.escapevelocity.consulting/published/pXInP8D115/`

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
