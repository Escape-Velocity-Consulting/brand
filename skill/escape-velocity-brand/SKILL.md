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

## The 6 tools (when escape-velocity-brand is registered)

| Tool | Use when |
|------|----------|
| **`render_template`**     | You want a standard branded asset (letter, OG image, invoice, carousel slide). Pick a template key, fill `vars`, optionally pass a markdown body. Output format is driven by the template registry. |
| **`render_slides`**       | You have N discrete pages → want a viewer / combined PDF / per-page PNGs / any combination. Two input modes: `markdown` (presentation-style with `===` separators) or `pages` (carousel-style explicit HTML/template per page). |
| **`render_html_to_png`**  | You wrote custom HTML — want a single PNG screenshot. |
| **`render_html_to_pdf`**  | You wrote custom HTML — want a PDF. Playwright auto-paginates long HTML. |
| **`list_templates`**      | Discover which templates exist + their metadata (output format, dims, required vars, tags). |
| **`get_tokens`**          | Get the parsed `tokens.json` (colors, type, spacing values). |

## Routing decision tree

1. **Standard branded output** → `render_template`
   - "Write a letter to X" → `render_template({ template: 'letter', markdown, recipient, ... })`
   - "Render an OG image" → `render_template({ template: 'social/og', vars: {...} })`
   - "Make an invoice" → `render_template({ template: 'invoice', markdown, recipient, ref, ... })`

2. **Multi-page / slide-like** → `render_slides`
   - LinkedIn carousel → `render_slides({ pages: [{template, vars}...], dimensions: 'linkedin-portrait', outputs: { pdf: true, pngs: true } })`
   - Slide deck from markdown → `render_slides({ markdown, dimensions: 'slide-16-9', outputs: { viewer: true, pdf: true, pngs: true } })`

3. **Ad-hoc custom design** → `render_html_to_png` or `render_html_to_pdf`
   - Custom infographic / one-off layout → write the HTML, call the appropriate tool.

4. **Long custom multi-page PDF document** → `render_html_to_pdf` (HTML is naturally paginated).

5. **Don't know the template name?** → call `list_templates` first.

6. **Don't have token values handy?** → call `get_tokens`. (Or read the brand reference sidecar.)

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

- ❌ Hardcoding hex values (`#c0392b`) or font names (`'Space Grotesk'`) in HTML you write. Use `var(--color-terracotta)` / `var(--font-headline)`.
- ❌ Calling `render_html_to_png` when a named template exists. Use `render_template` for known assets.
- ❌ Calling N times for a multi-page render. Use `render_slides` with output toggles — one round trip.
- ❌ Writing full slide HTML from scratch for a presentation. Use markdown input mode with `===` separators + `<!-- @type: title|content|two-col|quote|image -->` directives.

## See also

- `references/brand-reference.md` — token table, CSS vars, design patterns
- `brand/CLAUDE.md` § MCP Server — how to register escape-velocity-brand on your workstation (Claude Code or Claude Desktop)
