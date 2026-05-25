# Escape Velocity — Web Source

This folder contains the source you need to build something using the Escape Velocity brand: the CSS bundle, document & social HTML templates, and a working starter page.

## Quick start

1. Open `starter.html` in a browser. That's it. It loads the brand CSS bundle (`css/tokens.css`, `css/site.css`) and demonstrates the on-brand look with a hero, a card row, and a footer.
2. Use it as a scaffold for your own page. Copy the markup patterns; the brand styling comes from the linked CSS.

## Layout

```
web/
├── starter.html              ← working demo, no build step
├── css/
│   ├── tokens.css            ← design tokens (colors, fonts, spacing)
│   ├── site.css              ← components: buttons, cards, eyebrows, tags
│   └── print.css             ← print overrides
└── templates/
    ├── documents/            ← letter, offer, invoice, ToS, report (HTML sources)
    └── social/               ← LinkedIn banner, OG, quote, stats, etc.
```

## CSS load order

```html
<link rel="stylesheet" href="./css/tokens.css">     <!-- defines --color-*, --font-* -->
<link rel="stylesheet" href="./css/site.css">       <!-- consumes the tokens -->
<link rel="stylesheet" href="./css/print.css" media="print">
```

`tokens.css` MUST load first — the others reference its CSS custom properties (`var(--color-terracotta)`, `var(--font-headline)`, etc.).

## Fonts

`starter.html` loads the four brand fonts (Inter, Manrope, Space Grotesk, JetBrains Mono) from Google Fonts via `<link>` for zero-setup. For offline / self-hosted use, the woff2 files are in the kit's `../fonts/` directory — swap the Google Fonts `<link>` for `@font-face` rules pointing there.

`css/site.css` itself already includes `@font-face` rules that look for fonts at `css/fonts/*.woff2` — those files ship in this folder so `site.css` works without the Google Fonts link too.

## Document templates

`templates/documents/*.html` are the source for the document PDFs in `../documents/`. They use Nunjucks variables (`{{ CONTENT }}`, `{{ RECIPIENT }}`, `{{ DATE }}`, `{{ FONTS_URI }}`, `{{ TOKENS_CSS }}`, etc.) and are designed to be rendered by [Playwright](https://playwright.dev) from a `file://` URL. To use them in your own stack:

- Render the template with your templating engine (Nunjucks, Handlebars, Jinja2, etc.).
- Provide `TOKENS_CSS` as the contents of `css/tokens.css`.
- Provide `FONTS_URI` as the absolute file:// URL to the fonts dir.
- Convert the result to PDF via headless Chrome / Playwright.

See `_base.html` for the font and tokens injection pattern.

## Social templates

`templates/social/*.html` are full-page HTML files rendered to PNG at fixed dimensions (LinkedIn banner 1584×396, OG 1200×630, etc.). They inline their styles and don't require a build step.

## Live reference

For everything that isn't in this folder, the live Brand Site has it:

- **Components gallery** with examples and tokens — https://escapevelocity.consulting/brand/components/
- **Color palette + typography scale** — https://escapevelocity.consulting/brand/identity/
- **Document previews** — https://escapevelocity.consulting/brand/documents/
- **Social samples** — https://escapevelocity.consulting/brand/social/

## License

Usage governed by the kit's top-level `LICENSE.txt`. In short: editorial / partner / press use is fine, don't modify the logo marks, don't imply a partnership. Email tommi.enenkel@escapevelocity.consulting for anything beyond that.
