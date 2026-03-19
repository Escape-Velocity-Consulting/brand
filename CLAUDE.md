# Brand OS

## Spec-First Rule

**BRAND_SPEC.md is the source of truth.** Before changing any brand code, templates, or tokens:

1. Consult the spec to understand current rules
2. If the change requires a spec update, get explicit user approval first
3. Update the spec, then implement

Never silently deviate from the spec. If a conflict arises, flag it.

## Repository Layout

```
brand/
├── BRAND_SPEC.md          ← canonical spec (source of truth)
├── CLAUDE.md              ← this file
├── AGENT_GUIDE.md         ← terse agent lookup tables
├── BRAND_SKILL.md         ← agent cheatsheet
├── VARIANTS.md            ← variant tracking registry
├── tokens.ts              ← token source of truth (colors, fonts, spacing)
├── tokens.css             ← generated from tokens.ts
├── tsconfig.json
├── package.json
├── generate_qr.py         ← legacy Python QR generator (needs SpaceGrotesk.ttf)
├── SpaceGrotesk.ttf       ← font for generate_qr.py
├── assets/
│   ├── logos/             ← SVG source files
│   ├── raster/            ← generated PNGs (from SVGs + templates)
│   └── qr/               ← generated QR codes
├── generators/
│   ├── pdf.ts             ← Markdown → PDF (Playwright)
│   └── image.ts           ← HTML/SVG → PNG (sharp/Playwright)
├── templates/
│   ├── _base.html         ← Nunjucks base (fonts + reset)
│   ├── letter.html        ← extends _base.html
│   └── social/
│       └── linkedin-banner.html  ← standalone (1584x396)
├── scripts/
│   ├── build-tokens.ts    ← generates tokens.css
│   ├── sync-website.sh    ← copies tokens.css → website/styles/
│   └── export-assets.ts   ← generates all raster exports + previews
└── demo/
    ├── index.html         ← brand showcase (serve, don't open as file)
    └── previews/          ← generated document screenshots
```

## Generators

### pdf.ts — Document Generator
```bash
npx tsx brand/generators/pdf.ts <input.md> [options]
  -o, --output <path>       Output PDF path
  --type <letter|offer|invoice|tos>  (default: letter)
  --to <string>             Recipient
  --date <string>           Date (default: today)
  --ref <string>            Reference number
  --subject <string>        Subject (default: first H1)
  --confidential            Add confidential label
  --lang <de|en>            (default: de)
  --template <path>         Direct template override
  --debug                   Write .debug.html alongside PDF
```

### image.ts — Raster Export Generator
```bash
npx tsx brand/generators/image.ts --input <file> --type <html|svg> -o <output.png>
  --preset <og|linkedin-banner|linkedin-post|square>
  --width <px> --height <px>    (alternative to --preset)
```

Presets: og=1200x630, linkedin-banner=1584x396, linkedin-post=1200x1200, square=1000x1000

## Token Workflow

When brand tokens change:
1. Edit `brand/tokens.ts`
2. `npm run build:tokens` → regenerates `brand/tokens.css`
3. `npm run sync:website` → copies `tokens.css` to `website/styles/tokens.css`
4. Commit both repos separately

CSS rule: `@import` must be the first rule in `website/styles/base.css` (before `@font-face`).

## Templates

- **Engine:** Nunjucks (same as website's Eleventy)
- **Base template:** `templates/_base.html` — provides `@font-face` declarations, reset
- **Variable convention:** UPPERCASE names (`CONTENT`, `SUBJECT`, `RECIPIENT`, `DATE`, `REF`, `CONFIDENTIAL`, `SHOW_META`, `LANG`, `STRINGS`, `FONTS_URI`)
- **Font loading:** Templates use `{{ FONTS_URI }}` variable, resolved to `file://` path at render time
- **Self-contained:** Templates inline all styles (no CSS var references) for Playwright `file://` compatibility

## Fonts

- Self-hosted woff2 files live in `website/fonts/` (shared by web + generators)
- Generators reference fonts at `../website/fonts/` (works when repos co-located under `business/`)
- `SpaceGrotesk.ttf` in brand/ root is used only by `generate_qr.py` (PIL needs TTF, not woff2)

## npm Scripts

| Script | Command | What it does |
|--------|---------|--------------|
| `build:tokens` | `tsx scripts/build-tokens.ts` | Regenerate `tokens.css` from `tokens.ts` |
| `sync:website` | `bash scripts/sync-website.sh` | Copy `tokens.css` → `website/styles/tokens.css` |
| `pdf` | `tsx generators/pdf.ts` | Generate branded PDF from Markdown |
| `image` | `tsx generators/image.ts` | Generate PNG from HTML/SVG |
| `export` | `tsx scripts/export-assets.ts` | Regenerate all raster assets + previews |

## Demo Page

The demo page at `brand/demo/index.html` must be served via a local server for font loading:
```bash
npx serve C:/Users/tommi/business -p 3006
# Open http://localhost:3006/brand/demo/
```

Do not open as `file://` — fonts won't load.

## Legacy

- `generate_qr.py` — Python QR generator. Still active. Will be replaced by `generators/qr.ts` in a future step.
- `svg.ts` (infographic generator) — defined in spec §11.2, not yet implemented.
- `offer.html`, `invoice.html`, `tos.html` templates — defined in spec, not yet implemented.
