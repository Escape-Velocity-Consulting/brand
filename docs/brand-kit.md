# Brand Kit

The Brand Kit (`dist/brand-kit.zip`) bundles logos, colors, fonts, sample documents and social graphics, the brand guide as PDF, and the press boilerplate for external distribution. It's the **fourth output** of the brand system (alongside the Brand Site, Brand Skill, and Brand MCP — see [architecture.md § Outputs](architecture.md#outputs)).

Public URL: `escapevelocity.consulting/brand/brand-kit.zip`. Linked from `/brand/download/`.

## Source-of-truth chain

Every asset in the kit derives from existing canonical sources — never duplicated.

| Kit path | Canonical source |
|----------|------------------|
| `logos/svg/` | `assets/logos/*.svg` |
| `logos/png/` | `assets/raster/*-{300,512,1024,2048}.png` (emitted by `build:assets`) |
| `colors/tokens.json` | `tokens.ts` (via `build:tokens`) |
| `colors/palette.pdf` | `templates/palette-sheet.html` + `tokens.css` (via `generate-palette-pdf.ts`) |
| `colors/palette.ase` | `tokens.json` (via `generate-palette-ase.ts`) |
| `fonts/*.woff2` | `fonts/` |
| `fonts/LICENSES/` | `fonts/LICENSES/` |
| `guidelines/brand-guide.pdf` | `dist/site/` printed via Playwright (via `generate-brand-guide-pdf.ts`) |
| `social/*` | curated subset of `assets/raster/` |
| `documents/*.pdf` | `previews/` |
| `press/boilerplate.{md,pdf}` | `press/boilerplate.md` |
| `press/photos/` | `press/photos/` |
| `web/starter.html`, `web/README.md` | `web/` (authored in-repo) |
| `web/css/{tokens,site,print}.css` | `tokens.css`, `site/site.css`, `site/print.css` |
| `web/css/fonts/*.woff2` | `fonts/*.woff2` (colocated so `site.css`'s `@font-face` paths resolve) |
| `web/templates/documents/*.html` | `templates/{letter,offer,invoice,tos,report,_base,_recipient}.html` |
| `web/templates/social/*.html` | `templates/social/*.html` |
| `LICENSE.txt` | `press/LICENSE.txt` |

## Update flow

1. Edit a canonical source (tokens, logos, boilerplate, license, etc.).
2. `npm run build:dist` — full chain: tokens → assets → site → kit.
3. Verify locally: unzip `dist/brand-kit.zip` and inspect; run `npm run dev` and open `/brand/download/`.
4. Commit + push the brand repo.
5. Bump the submodule in `website/`. Website CI rebuilds everything and `escapevelocity.consulting/brand/brand-kit.zip` updates.

## Assembly script

`scripts/build-kit.ts` orchestrates the copy. It assumes `build:tokens`, `build:assets`, and `build:site` have run first — `build:dist` chains them together.

```
scripts/
├── build-tokens.ts                ← tokens.ts → tokens.css + tokens.json
├── build-site.sh                  ← render Brand Site → dist/site/
├── build-dist.sh                  ← meta: tokens → assets → site → kit
├── build-kit.ts                   ← assemble dist/brand-kit/ + zip it
├── export-assets.ts               ← regenerate rasters + document previews
├── generate-palette-pdf.ts        ← A4 swatch sheet → palette.pdf
├── generate-palette-ase.ts        ← Adobe .ase swatch file
└── generate-brand-guide-pdf.ts    ← print dist/site/ → single multi-page PDF
```

## Anti-patterns

- ❌ **Hardcoding press copy, license text, or color values** in the kit generators. If a value isn't in `tokens.ts` / `press/` / `fonts/LICENSES/` already, add it there first.
- ❌ **Adding a new kit file without registering it in the table above** + in `scripts/build-kit.ts`. Both surfaces must point at the canonical source.
- ❌ **Bypassing `build:dist`** for a release. Always run the full chain so tokens/assets/site/kit are coherent.

## CI dependency

The deploy workflow's pre-push Trivy hook runs against `package-lock.json`. The kit build itself runs Playwright (for `generate-brand-guide-pdf.ts`) — in CI, the website repo's deploy ensures Playwright Chromium is installed. Locally, `npx playwright install` may be needed.

## See also

- [brand-site.md](brand-site.md) — the site source that becomes `guidelines/brand-guide.pdf`
- [`BRAND_SPEC.md`](../BRAND_SPEC.md) §21 — kit spec
- [`press/boilerplate.md`](../press/boilerplate.md) — canonical press copy that lands in `press/`
