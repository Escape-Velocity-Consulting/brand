# Generators

CLI shims at `generators/*.ts` that wrap `src/core/` for command-line use. Each constructs a local `BrowserPool`, calls the core, writes the result to disk, closes the pool. Behavior is byte-identical to the equivalent MCP tool call on the stdio transport — the MCP server and these shims share the same rendering core.

The canonical reference for each generator's interface is [`BRAND_SPEC.md`](../BRAND_SPEC.md) §11. This doc summarizes the CLI surface.

## `pdf.ts` — Document Generator

Converts Markdown to a branded A4 PDF using Playwright.

```bash
npx tsx generators/pdf.ts <input.md> [options]

Options:
  -o, --output <path>           Output PDF path (default: input filename + .pdf)
  --type <letter|offer|invoice|tos|report>  Document type — selects template (default: letter)
  --to <string>                 Recipient: "Name · Company"
  --date <string>               Date string (default: today, locale-formatted)
  --ref <string>                Reference number: "EV-2026-042"
  --subject <string>            Subject line (default: first H1 from markdown)
  --confidential                Add Vertraulich/Confidential label
  --lang <de|en>                Label language (default: de)
  --template <path>             Override template path directly (bypasses --type)
  --attach <path>               Append a PDF (e.g. AGB) to the output — merged via pdf-lib
  --debug                       Write .debug.html alongside PDF (off by default)
```

See [`BRAND_SPEC.md`](../BRAND_SPEC.md) §11.1 for the full document-type matrix and structured-arg semantics (the `--to` flag accepts a Recipient struct, etc.).

## `image.ts` — Raster Export Generator

Renders HTML or SVG → PNG via Playwright screenshot.

```bash
npx tsx generators/image.ts --input <file> --type <html|svg> -o <output.png>

Options:
  --preset <og|linkedin-banner|linkedin-post|square>  Predefined dimensions
  --width <px> --height <px>    Custom dimensions (alternative to --preset)
  --var "KEY=value"             Nunjucks variables (repeatable)
```

Presets: `og` = 1200×630, `linkedin-banner` = 1584×396, `linkedin-post` = 1200×1200, `square` = 1000×1000.

See [`BRAND_SPEC.md`](../BRAND_SPEC.md) §11.3.

## `carousel.ts` — Carousel PDF Generator

Renders a multi-slide LinkedIn carousel from a JSON spec → combined PDF + per-slide PNG sidecar.

```bash
npx tsx generators/carousel.ts --spec <spec.json> -o <output.pdf>
```

Spec shape:

```jsonc
{
  "format": "linkedin-portrait",  // or "linkedin-square"
  "slides": [
    { "template": "templates/carousel/title.html", "vars": { "TITLE": "..." } },
    { "template": "templates/carousel/numbered-item.html", "vars": { ... } },
    { "template": "templates/carousel/cta.html", "vars": { ... } }
  ]
}
```

Auto-injects `PROGRESS` ("N / total") on numbered-item slides. Title + CTA are excluded from the count.

See [`BRAND_SPEC.md`](../BRAND_SPEC.md) §11.6.

## `presentation.ts` — Slide Deck Generator

Renders a markdown deck → HTML viewer + optional PDF + per-slide PNGs.

```bash
npx tsx generators/presentation.ts <input.md> [options]

Options:
  -o, --output <path>      Output directory (default: ./<input-stem>)
  --pdf                    Also produce <stem>.pdf
  --png                    Also produce slides/slide-NN.png per slide
  --ratio <16-9|4-3>       Aspect ratio (default: 16-9 → 1920×1080)
  --theme <cream|black>    Default background (default: cream)
  --title <string>         Deck title (default: first H1)
  --debug                  Write debug.html (all slides vertical)
```

**Input format:** Markdown with `===` slide separators. Per-slide directives via HTML comment: `<!-- @type: title|section|content|two-col|quote|image|html -->`, `<!-- @bg: cream|black|terracotta -->`. Defaults to `content`. The `html` type passes raw HTML through (use for embedding components like `radar.js`). Two-col splits left/right on `:::`.

**Outputs:** `<out>/index.html` (self-contained viewer with `components/` and `fonts/` copied alongside), optional `<stem>.pdf` and `slides/slide-NN.png`.

**Viewer keys:** `← → / Space / PgUp / PgDn` navigate, `Home/End` jump, `F` fullscreen, `P` switch to print mode. Query params: `?slide=N` deep-link, `?print=1` flatten for PDF.

See [`BRAND_SPEC.md`](../BRAND_SPEC.md) §11.7.

## Relationship to MCP tools

The CLI generators and the MCP tools wrap the same `src/core/` functions:

| CLI | MCP tool | Common core |
|---|---|---|
| `pdf.ts` (`--type letter` etc.) | `render_template` (document type) | `core/document.ts` |
| `image.ts --type html` | `render_template` (PNG output) or `render_html_to_png` | `core/render.ts` |
| `image.ts --type svg` | (not exposed via MCP currently) | `core/render.ts` |
| `carousel.ts` | `render_slides({ pages: [...] })` | `core/slides.ts` |
| `presentation.ts` | `render_slides({ markdown: ... })` | `core/slides.ts` |

If you fix a rendering bug, fix it in `src/core/` — both consumers pick it up automatically. Don't put rendering logic in `generators/*.ts` or in MCP tool files.

## See also

- [`BRAND_SPEC.md`](../BRAND_SPEC.md) §11 — canonical generator interface reference
- [templates.md](templates.md) — templates these generators consume
- [mcp-server.md](mcp-server.md) — the MCP tools that share the same core
- [testing.md](testing.md) — E2E suites exercise both CLI and MCP paths
