# Escape Velocity — Brand Specification

> **Status:** v1 — complete.
> **Source of truth for:** colors, typography, spacing, components, voice, generator interfaces, and asset conventions.
> Everything else (generators, templates, CSS) is an implementation of this spec.

---

## 1. Identity

- **Brand name:** Escape Velocity
- **Domain:** escapevelocity.consulting
- **Market:** DACH — German-speaking SMBs
- **Positioning:** Digitalisierung & Prozessoptimierung
- **Visual direction:** Warm Cream + Warm Black + Terracotta. Grounded, premium, operator-grade. Not startup-flashy, not corporate-stiff.

---

## 2. Color System

### Canonical Palette

All values below are authoritative. Any file diverging from these must be updated.

| Token | Hex | Name | Role |
|-------|-----|------|------|
| `cream` | `#F9F7F4` | Warm Cream | Default page/document background |
| `black` | `#1E1C1A` | Warm Black | Dark sections: nav, hero, footer, dark cards, TLDR boxes |
| `terracotta` | `#D4784A` | Terracotta | Primary accent: CTAs, borders, tags, eyebrows, underlines, logo accent |
| `terracotta-hover` | `#C2653A` | Terracotta Dark | Hover state for terracotta buttons/links |
| `accent` | `#E8865A` | Light Accent | Inline accent on dark backgrounds (e.g., "Velocity" in logo on dark) |
| `light` | `#F5F3F0` | Warm Light | Primary text on dark backgrounds |
| `muted` | `#C4BEB8` | Muted | Secondary text on dark backgrounds, newsletter body on dark |
| `subtle` | `#807A74` | Subtle | Tertiary text: stat descriptions, edition labels |
| `body` | `#5C5650` | Body Text | Default body copy on light backgrounds |
| `text` | `#1A1816` | Near Black | Headings, strong text, primary content on light backgrounds |

> **Color drift resolved:** `letter.html` previously used `#C46B3C` for terracotta. Canonical value is `#D4784A`. All implementations must use the tokens above.

### Secondary Colors

Use extremely sparingly — only when there is a genuine semantic reason (e.g., status, category distinction) that cannot be served by the primary palette.

| Purpose | Hex | Usage |
|---------|-----|-------|
| `kommt` (upcoming) | `#3B82F6` | Tag background: `rgba(59,130,246,0.08)`, text: `#3B82F6` |
| `tun` (action) | `#16A34A` | Tag background: `rgba(34,197,94,0.08)`, text: `#16A34A` |

### Usage Rules

- **On cream backgrounds:** use `text` for headings, `body` for copy, `terracotta` for accents.
- **On black backgrounds:** use `light` for headings, `muted` for copy, `terracotta` or `accent` for accents.
- **Never** use pure `#000000` or `#ffffff` — always use the warm-tinted variants.
- **Max 2 accent colors per asset** (terracotta counts as one; newsletter tag colors are the exception by design).
- **Print rule:** Assets intended for standard office printing (letters, offers, invoices) must not use full black backgrounds. Use cream or white backgrounds only. Foreground elements that appear white on screen should use transparent or pure white, not the warm-tinted `light` token, to ensure clean printing.

---

## 3. Typography System

### Typefaces

| Font | Role | Weights Available | Self-Hosted Files |
|------|------|-------------------|-------------------|
| **Space Grotesk** | Headlines, logo, brand identity | 400–700 | `space-grotesk.woff2`, `space-grotesk-ext.woff2` |
| **Manrope** | UI labels, eyebrows, CTAs, tags, newsletter body | 400–800 | `manrope.woff2`, `manrope-ext.woff2` |
| **Inter** | Website body copy, form text, footer | 400–600 | `inter.woff2`, `inter-ext.woff2` |
| **JetBrains Mono** | Technical accent only — URL display | 400–500 | Google Fonts (not self-hosted) |

**Rule:** Maximum 3 fonts per asset. JetBrains Mono is a rare accent — only use it for URL/domain display (e.g., LinkedIn banner). Never use it for body text.

### Type Scale

| Role | Font | Weight | Size | Line Height | Letter Spacing | Color |
|------|------|--------|------|-------------|----------------|-------|
| Hero H1 | Space Grotesk | 700 | 54–72px | 1.08 | — | `light` (on dark) |
| Card Title / H3 | Space Grotesk | 600 | 20px | 1.3 | — | `text` |
| Document H1 | Space Grotesk | 700 | 22px | 1.25 | — | `text` |
| Document H2 | Space Grotesk | 700 | 17px | 1.3 | — | `terracotta` |
| Document H3 | Space Grotesk | 600 | 14px | 1.35 | — | `text` |
| Newsletter H2 | Manrope | 700 | 22–23px | 1.3 | — | `text` |
| Eyebrow / Section Label | Manrope | 600 | 13px | — | 2px | `terracotta` (uppercase) |
| Badge / Tag | Manrope | 600 | 11px | — | 1px | varies by context (uppercase) |
| CTA Button | Manrope | 600 | 15–16px | — | — | white |
| Price Label | Manrope | 600 | 13px | — | — | `terracotta` |
| Website Body | Inter | 400 | 15px | 1.7 | — | `body` |
| Newsletter Body | Manrope | 400–500 | 14–15px | 1.7 | — | `body` |
| Document Body | Inter | 400 | 13px | 1.75 | — | `#3D3A36` (near `text`) |
| Stat Value | Space Grotesk | 700 | 28px | — | — | `terracotta` |
| Stat Label | Manrope | 400 | 13px | — | — | `subtle` |
| Technical / URL | JetBrains Mono | 400–500 | 11–12px | — | 0.5px | `terracotta` |
| Logo | Space Grotesk | 700 | 20–22px | — | -0.01em | `text`/`light` + `terracotta` accent on "Velocity" |

### Logo Treatment

- Text: `Escape ` in primary color + `Velocity` in `terracotta` (light bg) or `accent` (dark bg)
- Font: Space Grotesk 700
- No icon/mark exists yet — wordmark only

---

## 4. Spacing & Layout

### Container

| Context | Max Width | Horizontal Padding |
|---------|-----------|-------------------|
| Default | 1100px | 40px |
| Narrow (documents, newsletter) | 620–900px | 40px |
| Tablet (≤768px) | fluid | 24px |
| Mobile (≤480px) | fluid | 16px |

### Section Spacing

| Context | Value |
|---------|-------|
| Section vertical padding | 60–80px |
| Hero vertical padding | 80px |
| Card internal padding | 32px |
| Document margins (A4) | top: 12mm, sides: 25mm, bottom: 20mm |

### Grid

- Services / cards: `grid-template-columns: 1.2fr 0.9fr 0.9fr` (featured card wider)
- Newsletter tags: `grid-template-columns: auto 1fr` with `gap: 8px 14px`
- Default gap between cards: 20px

### Border Radius

| Element | Radius |
|---------|--------|
| Cards, wrappers | 12px |
| Buttons | 8px (web), 6px (email/newsletter) |
| Badges / tags | 4px |
| Code blocks | 6px |
| Inline code | 3px |
| Accent bar / rule | 0 |

---

## 5. Component Patterns

### Buttons

**Primary CTA (web)**
```css
display: inline-flex; align-items: center; gap: 8px;
padding: 15px 34px;
background: terracotta; color: white; border-radius: 8px;
font: Manrope 600 16px; text-decoration: none;
/* hover: background → terracotta-hover */
```

**Secondary CTA (web, on dark)**
```css
display: inline-flex; align-items: center; gap: 8px;
padding: 15px 34px; margin-left: 12px;
background: transparent; color: light;
border: 1px solid rgba(255,255,255,0.2); border-radius: 8px;
font: Manrope 500 16px;
```

**Newsletter CTA (email-safe)**
```css
display: inline-block; padding: 12px 28px;
background: terracotta; color: white; border-radius: 6px;
font: Manrope 600 14px;
```

### Cards

**Default card (light)**
```
background: white; border-radius: 12px; padding: 32px;
border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 1px 3px rgba(0,0,0,0.03);
hover: border-color → terracotta; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.06);
```

**Featured card (dark)**
```
background: black; border-radius: 12px; padding: 32px;
border: 1px solid rgba(212,120,74,0.3);
heading: light; body: muted; price: accent;
```

**Badge on featured card**
```
display: inline-block; padding: 3px 10px; border-radius: 4px;
background: rgba(212,120,74,0.15); color: terracotta;
font: Manrope 600 11px uppercase 1px letter-spacing;
```

### Hero Section

- Background: `black`
- Optional grid overlay: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px)` at 60px
- Optional radial glow: `radial-gradient(circle, rgba(212,120,74,0.08) 0%, transparent 65%)`
- Left accent bar: 4px solid terracotta (LinkedIn banner variant)
- Stats bar: separated by `border-top: 1px solid rgba(255,255,255,0.06)`, `margin-top: 48px; padding-top: 32px`

### Eyebrow / Section Label

```
font: Manrope 600 13px; text-transform: uppercase; letter-spacing: 2px;
color: terracotta; margin-bottom: 20px;
```

### Dividers

- Document accent bar: `height: 2px; background: terracotta`
- Meta-strip bottom border: `0.5px solid #E8E5E0` (only structural divider in documents)
- Subject line left border: `3px solid terracotta`
- Blockquote left border: `2.5px solid terracotta`
- Offer/invoice table: `border-left: 3px solid terracotta` (contained warm block, not th underline)
- Newsletter section divider: `1px solid rgba(0,0,0,0.06)`
- **No** h2 top borders, **no** visible `<hr>` in documents — spacing alone separates sections

### Newsletter-Specific Components

**TLDR Box**
```
background: black; border-radius: 8px; padding: 20px 24px;
label: Manrope 600 11px uppercase 2px tracking terracotta;
body: Inter 14px 1.6 muted;
```

**Callout / Quote Block**
```
background: cream; border-left: 3px solid terracotta;
border-radius: 0 8px 8px 0; padding: 20px 24px;
text: Space Grotesk 500 16px italic text-color;
source: Inter 12px #999;
```

**Tags (geht / kommt / tun)**
```
font: Manrope 600 11px uppercase 1px letter-spacing;
padding: 3px 10px; border-radius: 4px; white-space: nowrap;

geht:  background rgba(212,120,74,0.10), color #C2653A
kommt: background rgba(59,130,246,0.08), color #3B82F6
tun:   background rgba(34,197,94,0.08),  color #16A34A
```

---

## 6. Motion & Interaction

- Card hover: `transform: translateY(-2px)` + shadow deepens. Transition: `all 0.2s`.
- Button hover: background color shift to `terracotta-hover`. No transform.
- No animations on page load. No parallax. No scroll-triggered effects.
- Nav backdrop blur: `backdrop-filter: blur(12px)`.

---

## 7. Asset Format Specs

| Asset Type | Dimensions / Format | Notes |
|------------|---------------------|-------|
| LinkedIn Banner | 1584×396px (4:1 ratio) | Dark bg, left accent bar, wordmark left, tagline right |
| LinkedIn Feed Landscape | 1200×627px (~1.91:1) | Same ratio as OG, standard feed image |
| LinkedIn Feed Portrait | 1080×1350px (4:5) | Max vertical real estate in feed |
| LinkedIn Profile Photo | 400×400px | Not in scope yet |
| Social Share Graphic | 1200×630px (OG standard) | TBD |
| Newsletter | Max 620px wide, HTML | Dark header, cream body, inline styles for email clients |
| Letter / Document | A4 (210×297mm) | 12mm top, 25mm sides, 20mm bottom |
| Business Card (digital) | Mobile-optimized HTML | Dark theme, minimal, VCF download |
| OG Image | 1200×630px | Dark bg, parameterized title/subtitle |
| Quote Card | 1200×1200px | Shareable insight/quote graphic |
| Stats Card | 1200×1200px | Key metric highlight |
| Announcement | 1200×630px or 1200×1200px | Service/event announcement |
| Twitter/X Banner | 1500×500px | Profile cover |
| YouTube Banner | 2560×1440px (safe: 1546×423) | Channel art |
| Instagram Post | 1080×1080px | Square post (use templates or custom) |
| Instagram Story | 1080×1920px | Vertical story |
| QR Code | SVG + PNG | On brand colors (TBD — currently generic) |

---

## 8. Voice & Copy

**Tone:** Direct. Warm but not soft. Expert without being cold. Peer-to-peer, not advisor-to-client.

**Register:** German for DACH-facing content. English for international/technical content. Mix is fine within a document when context warrants (e.g., technical terms stay in English).

**Dos:**
- Konkret vor abstrakt — lead with outcome, not process
- Active voice, short sentences
- Numbers when possible ("6 Wochen", "17 Jahre", "3 Prozesse")
- "Sie" form in German (formal, but not stiff)
- Dry wit is welcome; forced enthusiasm is not

**Don'ts:**
- No "revolutionieren", "disruptiv", "game-changer", "transformativ" as empty adjectives
- No excessive exclamation marks
- No "Wir freuen uns..." opener for letters
- No filler phrases: "In diesem Zusammenhang möchten wir..."
- No AI-forward positioning as the headline — AI is a delivery method

**Copy patterns:**
- Eyebrows: `TRANSFORMATION & AUTOMATION` / `PROZESSOPTIMIERUNG` — uppercase, 2–4 words
- CTAs: imperative + arrow → `Kostenloses Erstgespräch →` / `Weiterlesen →`
- Logo accent: always "Velocity" in terracotta, never "Escape"
- Tagline variants: "Digitization · Automation · AI" (EN) / "Digitalisierung & Prozessoptimierung" (DE)
- Tagline in documents: Inter 11px, mixed-case, `letter-spacing: 0.04em`, `color: #7A756F`. **Not** uppercase Manrope — wide letter-spacing at small sizes causes pixel shimmer on non-retina screens

---

## 9. Repository Structure

### Current layout (as-is)

```
business/
├── brand/
│   ├── assets/                     (implicit — files scattered in brand/ root)
│   │   ├── ev-wordmark.svg
│   │   ├── ev-wordmark-300.png
│   │   ├── ev-wordmark-300-v2.png
│   │   ├── logo-dark.svg
│   │   ├── logo-dark-square.svg
│   │   ├── logo-dark-300.png
│   │   ├── linkedin-banner_1_1.png
│   │   ├── qr-hi.png
│   │   └── SpaceGrotesk.ttf
│   ├── letter.html                 ← Jinja2 template (Python)
│   ├── md2pdf.py                   ← Python generator (Playwright)
│   ├── generate_qr.py              ← Python QR generator
│   ├── requirements.txt
│   └── package.json                ← Node (sharp only)
└── website/
    ├── fonts/                      ← Self-hosted woff2 (shared by web + PDF)
    ├── styles/base.css             ← CSS tokens (partially duplicates brand layer)
    ├── scripts/
    │   ├── quiz.js
    │   ├── cookie-consent.js
    │   └── tracking.js
    ├── quiz/index.njk              ← Quiz spider page
    └── ...
```

### Target layout (after migration)

`brand/` and `website/` remain separate git repos. They cannot share runtime dependencies. The solution is **copy-on-sync**: `brand/` is the canonical source; `website/` holds its own checked-in copy of `tokens.css` and is explicitly synced when brand tokens change. Drift is permitted and expected — sync is a deliberate act, not automatic.

```
brand/                             ← own git repo, canonical brand source
├── BRAND_SPEC.md
├── tokens.ts                      ← source of truth
├── tokens.css                     ← generated from tokens.ts; also synced to website
├── assets/
│   ├── logos/                     ← SVG source files (hand-crafted, parameterized)
│   │   ├── ev-wordmark.svg
│   │   ├── logo-dark.svg
│   │   └── logo-dark-square.svg
│   ├── raster/                    ← generated by export-assets.ts (source: SVG above)
│   │   ├── ev-wordmark-300.png
│   │   └── logo-dark-300.png
│   └── qr/                        ← generated by generate_qr.ts
│       └── qr-hi.png
├── templates/
│   ├── _base.html                 ← font loading + CSS vars; extended by all doc templates
│   ├── letter.html
│   ├── offer.html
│   ├── invoice.html
│   ├── tos.html
│   └── social/
│       └── linkedin-banner.html   ← native HTML template → image.ts → PNG
├── generators/
│   ├── pdf.ts                     ← Markdown → HTML → Playwright → PDF
│   ├── svg.ts                     ← data → SVG (infographics, spider, charts)
│   ├── image.ts                   ← HTML/SVG → sharp/Playwright → PNG
│   └── qr.ts                      ← URL → QR code PNG (replaces generate_qr.py)
├── scripts/
│   ├── export-assets.ts           ← SVG logos → raster exports (runs in CI or on demand)
│   └── sync-website.sh            ← copies tokens.css into website repo
├── package.json
├── tsconfig.json
└── requirements.txt               ← legacy; deprecate once pdf.ts is stable

website/                           ← own git repo, autodeploys independently
├── fonts/                         ← self-hosted woff2; also referenced by brand generators
├── styles/
│   ├── tokens.css                 ← copy synced from brand/tokens.css (checked in, not gitignored)
│   └── base.css                   ← @import './tokens.css'; no longer defines tokens itself
└── ...
```

**Sync workflow:**

When brand tokens change:
1. Edit `brand/tokens.ts`
2. Run `npm run build:tokens` → regenerates `brand/tokens.css`
3. Run `brand/scripts/sync-website.sh` → copies `tokens.css` into `website/styles/tokens.css`
4. Commit both repos separately

**CSS rule:** `@import` must appear before all other rules in `base.css` (including `@font-face`). This is a CSS spec requirement — placing it after `@font-face` causes browsers to silently ignore the import.

**Font access for brand generators:**
Generators reference fonts at `../website/fonts/` by relative path (valid when both repos are co-located under `business/`). For isolated environments (e.g., CI running only the brand repo), fonts must be present — document as a setup requirement in the brand repo's README.

---

## 10. Asset Inventory

### Logos

SVGs are the source of truth. Raster exports are generated artifacts — never edit PNGs directly.

| File | Format | Variant | Source | How generated |
|------|--------|---------|--------|---------------|
| `assets/logos/ev-wordmark.svg` | SVG | Wordmark, light bg | hand-crafted | — |
| `assets/logos/logo-dark.svg` | SVG | Wordmark, dark bg | hand-crafted | — |
| `assets/logos/logo-dark-square.svg` | SVG | Square crop, dark bg | hand-crafted | — |
| `assets/raster/ev-wordmark-300.png` | PNG 300px | Light bg | above SVG | `export-assets.ts` |
| `assets/raster/logo-dark-300.png` | PNG 300px | Dark bg | above SVG | `export-assets.ts` |
| `assets/raster/ev-wordmark-300-v2.png` | PNG 300px | Light bg v2 | above SVG | review — may be superseded |

### Social & Generated Assets

| File | Dimensions | Source template | Generator | Current status |
|------|-----------|-----------------|-----------|----------------|
| `assets/raster/linkedin-banner.png` | 1584×396 | `templates/social/linkedin-banner.html` | `image.ts` | Active — tagline: "Digitalisierung & Prozessoptimierung" (updated from "KI & Automatisierung für KMUs" to reflect current positioning) |
| `assets/qr/qr-hi.png` | varies | URL: hi/ page | `generators/qr.ts` | Active |
| `website/qr.png` | varies | URL: main site | `generators/qr.ts` | Active |
| `website/qr-lockscreen.png` | varies | URL: main site | `generators/qr.ts` | Active |
| `assets/raster/quote-card.png` | 1200×1200 | `templates/social/quote-card.html` | `image.ts` | Active |
| `assets/raster/stats-card.png` | 1200×1200 | `templates/social/stats-card.html` | `image.ts` | Active |
| `assets/raster/announcement.png` | 1200×630 | `templates/social/announcement.html` | `image.ts` | Active |
| `assets/raster/og.png` | 1200×630 | `templates/social/og.html` | `image.ts` | Active |
| `assets/raster/twitter-banner.png` | 1500×500 | `templates/social/twitter-banner.html` | `image.ts` | Active |
| `assets/raster/youtube-banner.png` | 2560×1440 | `templates/social/youtube-banner.html` | `image.ts` | Active |
| `assets/logos/ev-wordmark-light.svg` | SVG | Wordmark, light text for dark bg | hand-crafted | — |
| `assets/logos/ev-wordmark-transparent.svg` | SVG | Wordmark, transparent bg | hand-crafted | — |

> LinkedIn banner is now generated from `templates/social/linkedin-banner.html` via `image.ts`. The Affinity/Figma source files have been removed.

### Font Files (in `website/fonts/`)

| File | Font | Coverage |
|------|------|----------|
| `space-grotesk.woff2` | Space Grotesk | Latin basic |
| `space-grotesk-ext.woff2` | Space Grotesk | Latin extended |
| `manrope.woff2` | Manrope | Latin basic |
| `manrope-ext.woff2` | Manrope | Latin extended |
| `inter.woff2` | Inter | Latin basic |
| `inter-ext.woff2` | Inter | Latin extended |

> `SpaceGrotesk.ttf` in `brand/` root is a legacy TTF — not used by any active generator. Origin unclear. Keep for reference but do not use in new templates.

---

## 11. Generator Interfaces

### 11.1 `pdf.ts` — Document Generator

Converts Markdown to a branded A4 PDF using Playwright (Chromium). Replaces `md2pdf.py`.

**Input:** Markdown file (`.md`)

**Output:** PDF file (`.pdf`) + optional debug HTML (`.debug.html`)

**CLI:**
```bash
npx tsx brand/generators/pdf.ts <input.md> [options]

Options:
  -o, --output <path>           Output PDF path (default: input filename + .pdf)
  --type <letter|offer|invoice|tos>  Document type — selects template (default: letter)
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

**Document types:**

| `--type` | Template | Use case | Meta strip |
|----------|----------|----------|------------|
| `letter` | `templates/letter.html` | Correspondence, briefings, proposals in letter form | Optional |
| `offer` | `templates/offer.html` | Structured service offers with pricing | Optional |
| `invoice` | `templates/invoice.html` | Client invoices with line items | Required |
| `tos` | `templates/tos.html` | Terms of service, contracts | None |

Each type shares `_base.html` for font loading and CSS tokens. Type-specific templates control layout, chrome (header/footer style), and which metadata fields are shown.

**Rendering pipeline:**
1. Read `.md` → extract H1 as subject (if no `--subject`), then strip it from body to avoid double-rendering
2. Convert Markdown → HTML body via `markdown-it` (typographer: true — smart quotes enabled)
3. Inject into Nunjucks template
4. Write to temp `.html` file on disk
5. Playwright: `page.goto(file://...)` → `page.pdf()`
6. Delete temp file

**Font loading:** Templates must load fonts via `file://` URI pointing to `website/fonts/`. The `_base.html` template exposes a `FONTS_URI` variable resolved at render time to the absolute path of `website/fonts/`.

**Page format:** A4, margins: top 12mm / right 25mm / bottom 20mm / left 25mm

**Footer:** Doc-type-aware, auto-generated:
- **letter** (default): phone · email · domain · page X / Y
- **offer / invoice**: Thomas Enenkel GmbH · FN 570703w · UID ATU77669024 | IBAN AT03 3266 7000 0003 8695 · page X / Y
- **tos**: page X / Y only

**Document header layout (letterhead band):**
All document types share a single-band header: logo-group (logo 24px Space Grotesk + tagline stacked) left, header-contact (company name + address + phone/email) right. Accent bar below. This answers "who sent this" in one glance.

**Recipient format:** `--to "Name · Company"` — the ` · ` separator splits the string: name renders as Space Grotesk 14px 600 (block), company as 12px secondary below.

**h2 in documents:** Always `#1E1C1A` (black), never terracotta. Terracotta was ~3.5:1 contrast on cream (fails WCAG AA) and prints lighter than body text on B&W — inverting the visual hierarchy. Terracotta accent is preserved in accent bar, subject border, table accent, and links.

**i18n strings:**

| Key | DE | EN |
|-----|----|----|
| `to_label` | An: | To: |
| `subject_label` | Betreff | Subject |
| `confidential_label` | Vertraulich | Confidential |
| `page_label` | Seite | Page |

---

### 11.2 `svg.ts` — Infographic Generator

Generates branded SVG assets from structured data. Intended for charts, spider/radar diagrams, data visualizations, and decorative graphics.

**Input:** JSON data object + asset type identifier

**Output:** SVG file (`.svg`), optionally exported to PNG via `image.ts`

**CLI:**
```bash
npx tsx brand/generators/svg.ts --type <asset-type> --data <data.json> -o <output.svg>

Asset types (initial):
  spider       Radar/spider chart (used in quiz)
  flow         Process flow diagram (used in hero background)
  bar          Horizontal bar chart
```

**Design contract:** All SVGs must use brand token values (not hardcoded hex). Colors referenced as constants imported from `tokens.ts`. Viewbox standardized per asset type (see section 12).

---

### 11.3 `image.ts` — Raster Export Generator

Converts HTML templates or SVG files to PNG using `sharp` (already installed) or Playwright screenshot. Used for social graphics, profile covers, LinkedIn banner.

**Input:** HTML template path or SVG file path + optional data

**Output:** PNG file

**CLI:**
```bash
npx tsx brand/generators/image.ts --input <file> --type <html|svg> -o <output.png> [--width 1200] [--height 630]
```

**Rendering:**
- SVG → PNG: `sharp` (fast, no browser needed)
- HTML → PNG: Playwright `page.screenshot()` with fixed viewport — always runs Nunjucks rendering before screenshotting, regardless of whether the template uses variables (no-op if no variables present)

**Standard output sizes:**

| Preset | Dimensions | Use |
|--------|-----------|-----|
| `og` | 1200×630 | Open Graph / social share |
| `linkedin-banner` | 1584×396 | LinkedIn profile banner |
| `linkedin-post` | 1200×1200 | LinkedIn square post |
| `square` | 1000×1000 | Generic square graphic |
| `twitter-banner` | 1500×500 | Twitter/X profile banner |
| `youtube-banner` | 2560×1440 | YouTube channel art |
| `instagram-post` | 1080×1080 | Instagram square post |
| `instagram-story` | 1080×1920 | Instagram story |
| `a4` | 794×1123 | A4 document preview |

**`--var` flag:** Pass arbitrary Nunjucks variables to HTML templates via `--var KEY=VALUE`. Repeatable — use multiple `--var` flags for multiple variables. Keys are case-sensitive (use UPPERCASE by convention). Values are passed as strings to the Nunjucks context.

```bash
npm run image -- --input templates/social/og.html --type html --preset og \
  --var "TITLE=Page Title" --var "SUBTITLE=Subheading here" -o og.png
```

---

### 11.4 Social Template Conventions

- All social templates are standalone HTML with inline styles — no external CSS, no `_base.html` extension
- Font loading via `{{ FONTS_URI }}` variable (resolved to `file://` path at render time)
- Variables use UPPERCASE names with `| default()` fallbacks in Nunjucks
- Dark background (`#1E1C1A`) + terracotta accent bar is the standard visual language
- Templates set exact pixel dimensions on `html, body` with `overflow: hidden`
- No JavaScript — pure HTML/CSS for Playwright screenshot compatibility

---

### 11.5 Social Template Variables

**quote-card.html** (1200×1200):

| Variable | Required | Default |
|----------|----------|---------|
| `QUOTE` | yes | — |
| `AUTHOR` | no | "Tommi Enenkel" |
| `ROLE` | no | "Escape Velocity" |

**stats-card.html** (1200×1200):

| Variable | Required | Default |
|----------|----------|---------|
| `STAT` | yes | — |
| `UNIT` | no | "" |
| `LABEL` | yes | — |
| `CONTEXT` | no | "" |

**announcement.html** (1200×630):

| Variable | Required | Default |
|----------|----------|---------|
| `EYEBROW` | no | "NEUIGKEIT" |
| `HEADLINE` | yes | — |
| `BODY` | no | "" |
| `CTA` | no | "escapevelocity.consulting" |

**og.html** (1200×630):

| Variable | Required | Default |
|----------|----------|---------|
| `TITLE` | no | "Digitalisierung & Prozessoptimierung" |
| `SUBTITLE` | no | "" |

**linkedin-banner.html** (1584×396):

| Variable | Required | Default |
|----------|----------|---------|
| `TAGLINE` | no | "Digitalisierung & Prozessoptimierung" |
| `CTA_LABEL` | no | "Kostenloses Erstgespräch:" |
| `URL` | no | "escapevelocity.consulting" |

**twitter-banner.html** (1500×500): Same variables as linkedin-banner.html.

**youtube-banner.html** (2560×1440):

| Variable | Required | Default |
|----------|----------|---------|
| `BRAND` | no | "Escape Velocity" |
| `TAGLINE` | no | "Digitalisierung & Prozessoptimierung" |
| `URL` | no | "escapevelocity.consulting" |

---

## 12. Template Conventions

### `_base.html` — Base Template

Every document/print template extends this. It handles:
- `@font-face` declarations for all three brand fonts (Space Grotesk, Manrope, Inter)
- CSS custom property definitions (imported from or inlined from `tokens.css`)
- Reset styles (`*, margin: 0, box-sizing: border-box`)

**Template variables injected by all generators:**

| Variable | Type | Description |
|----------|------|-------------|
| `FONTS_URI` | string | Absolute `file://` path to `website/fonts/` |
| `LANG` | `"de" \| "en"` | Document language |
| `STRINGS` | object | i18n labels for the current lang |

### Document Templates (`letter.html`, `invoice.html`, `offer.html`)

Extend `_base.html`. Additional variables:

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `CONTENT` | HTML string | yes | Rendered Markdown body |
| `SUBJECT` | string | no | Subject/title line |
| `RECIPIENT` | string | no | Recipient display string |
| `DATE` | string | no | Formatted date |
| `REF` | string | no | Reference number |
| `CONFIDENTIAL` | boolean | no | Show confidential label |
| `SHOW_META` | boolean | derived | True if any of recipient/ref/confidential present |

**Print considerations:**
- No full black backgrounds (use cream or white)
- Terracotta accents are fine on print (they render as a warm mid-tone on greyscale)
- `light` token (`#F5F3F0`) should be replaced with `#ffffff` or `transparent` in print contexts

### SVG Templates

- ViewBox conventions by type: `spider` → `0 0 400 400`, `flow` → `0 0 700 400`, `bar` → `0 0 600 300`
- All color values referenced as JS constants from `tokens.ts`, not hardcoded
- Exported SVGs must be self-contained (no external references)

---

## 13. `tokens.ts` Contract

The canonical source of truth for all brand values. All other implementations derive from this.

```typescript
// brand/tokens.ts

export const colors = {
  cream:             '#F9F7F4',
  black:             '#1E1C1A',
  terracotta:        '#D4784A',
  terracottaHover:   '#C2653A',
  accent:            '#E8865A',
  light:             '#F5F3F0',
  muted:             '#C4BEB8',
  subtle:            '#807A74',
  body:              '#5C5650',
  text:              '#1A1816',
} as const

export const secondaryColors = {
  blue:  '#3B82F6',   // kommt tags
  green: '#16A34A',   // tun tags
} as const

export const fonts = {
  headline: "'Space Grotesk', sans-serif",
  ui:       "'Manrope', sans-serif",
  body:     "'Inter', sans-serif",
  mono:     "'JetBrains Mono', monospace",
} as const

export const fontFiles = {
  spaceGrotesk:    ['space-grotesk.woff2', 'space-grotesk-ext.woff2'],
  manrope:         ['manrope.woff2', 'manrope-ext.woff2'],
  inter:           ['inter.woff2', 'inter-ext.woff2'],
} as const

export const spacing = {
  containerMax:    '1100px',
  containerNarrow: '620px',
  paddingDesktop:  '40px',
  paddingTablet:   '24px',
  paddingMobile:   '16px',
} as const

export const radii = {
  card:   '12px',
  button: '8px',
  badge:  '4px',
  code:   '6px',
} as const

export const print = {
  pageFormat:   'A4',
  marginTop:    '12mm',
  marginRight:  '25mm',
  marginBottom: '20mm',
  marginLeft:   '25mm',
} as const
```

`tokens.css` mirrors the color and font tokens as CSS custom properties (the `:root { ... }` block currently in `base.css`). It is either generated from `tokens.ts` or manually kept in sync — a sync script is preferred.

---

## 14. Ideation & Concept Development

Use this workflow when the user wants to brainstorm, concept, or design a new asset and doesn't have a clear type yet. It follows the standard working model: brainstorm freely, iterate, then lock.

### When to use

- User says "I want to design something" but hasn't named a specific template
- New graphic, layout, or format that doesn't match an existing generator/template
- Exploring visual directions before committing to a reusable template

### Workflow: Brief → Sketch → Prototype → Iterate → Lock

1. **Brief** — Clarify purpose, placement, and dimensions. Match to a standard preset (§7) or define custom w×h. Who sees this? Where does it go?
2. **Content sketch** — Draft the text and visual elements. Identify what could become parameterizable later (variable candidates).
3. **Layout prototype** — Write standalone HTML to `scratch/<name>.html`. Follow general template conventions: inline styles, `{{ FONTS_URI }}` for fonts, fixed pixel dimensions on `html, body`, no JS. Render with `image.ts`, show the screenshot to the user.
4. **Iterate** — User reacts, agent adjusts, re-render, repeat. This is the creative loop — expect multiple rounds.
5. **Lock** — Finalize the design. Two outcomes:
   - **One-off asset:** Export the final PNG/PDF and deliver. Scratch file can be kept for reference or deleted.
   - **Reusable template** (optional): Promote to `templates/` (social, document, or new category as appropriate), convert hardcoded values to Nunjucks variables with `| default()` fallbacks, document variables in the spec (§12), add to the decision tree, rebuild the skill.

### Scratch directory

`scratch/` is gitignored — it holds WIP prototypes only. Clean up old files between sessions. Not limited to social formats — can prototype any format (documents, infographics, cards, etc.).

### Conventions

Scratch files follow the same conventions as production templates:
- Standalone HTML, inline styles
- Font loading via `{{ FONTS_URI }}`
- Fixed pixel dimensions, `overflow: hidden`
- No JavaScript
- Brand tokens only (no hardcoded hex)

### Composition Shortcuts

Three dimensions to pick from when starting a prototype:

**Formats (LinkedIn feed):**

| Preset | Dimensions | Ratio |
|--------|-----------|-------|
| `linkedin-landscape` | 1200×627 | ~1.91:1 |
| `linkedin-post` | 1200×1200 | 1:1 |
| `linkedin-portrait` | 1080×1350 | 4:5 |

**Color compositions:**

| Name | Background | Heading | Body/secondary | Accent | Use |
|------|-----------|---------|---------------|--------|-----|
| dark | `#1E1C1A` | `#F5F3F0` (light) | `#C4BEB8` (muted) | `#E8865A` (accent) | Default. High contrast, feeds. |
| cream | `#F9F7F4` | `#1A1816` (text) | `#5C5650` (body) | `#D4784A` (terracotta) | Softer/editorial feel, variety. |
| terracotta | `#D4784A` | `#F5F3F0` (light) | `#F9F7F4` (cream) | `#1E1C1A` (black) | Bold statement, single CTA. |

**Text alignment:**

| Alignment | Content | Footer | Accent bar |
|-----------|---------|--------|------------|
| left (default) | left-aligned | wordmark left, URL right | left edge, 4–5px |
| center | centered | centered, stacked | none (use top/bottom rule) |
| right | right-aligned | URL left, wordmark right | right edge, 4–5px |

---

## 15. Adding a New Asset Type

When a new asset type is needed (e.g., a new document format, a new social graphic, a new infographic style), the process is:

1. **Define the asset** in this spec — add it to section 7 (format specs) and section 10 (asset inventory) if it produces a stored file.
2. **Choose the generator:** document → `pdf.ts`, vector graphic → `svg.ts`, raster export → `image.ts`. If none fit, create a new generator file in `generators/`.
3. **Create the template** in `templates/` if the asset is HTML-based. Extend `_base.html`. Define all required template variables in this spec (section 12).
4. **Import from `tokens.ts`** — never hardcode color or font values in a new generator or template.
5. **Document the CLI interface** in section 11.
6. **Test with print-to-PDF** if the asset is intended for printing — verify the print rule (no black backgrounds, white foregrounds render correctly).

---

## 16. Claude Skill

The Claude skill (`brand/BRAND_SKILL.md`) is a terse, agent-readable brief that lets Claude generate new on-brand assets without being re-briefed on the brand in each session. It is not a repeat of this spec — it is an actionable summary of how to use the system.

**What it contains:**
- Token quick-reference (colors, fonts — hex values and roles in one table)
- Generator invocation cheatsheet (one line per generator with the most common flags)
- Template variable reference (which variables each template accepts)
- Decision tree: given a requested asset type, which generator and template to use
- Constraints checklist: things Claude must verify before generating (print rule, font limit, token-only colors)
- Pointer to this spec for anything not covered

**What it does not contain:**
- Explanations of why decisions were made (that's this spec)
- Full CSS / code examples (that's the templates)
- Anything that would require updating the skill every time the spec changes

**Maintenance rule:** When a new asset type, generator, or template is added, update the skill's decision tree and cheatsheet. Everything else in the skill should remain stable.

---

## 17. Documentation

Two documentation artifacts serve different audiences.

### 16.1 `AGENT_GUIDE.md` — For AI Agents

Terse. No prose introductions. Organized as lookup tables and decision flows. An agent should be able to find the answer to "how do I generate X" in under 5 seconds of reading.

**Structure:**
1. Generator quick-reference table (generator → what it does → one-line CLI example)
2. Document type map (what the user wants → `--type` flag value)
3. Template variable tables (per template, copy-paste ready)
4. Common flag combinations (the 5 most frequent invocations with actual example values)
5. Conflict resolution rules (see §16.2)
6. Where to add new things (one-liner pointers to §15 and §18)

**Tone:** Imperative. "Use `--type offer` for service offers." Not "You might want to consider using..."

### 16.2 Conflict Resolution

When a generation request conflicts with a spec rule, apply this priority order:

1. **Explicit user override** — user has specifically asked to deviate and understands the implications. Generate the deviation, document it as a variant (§18).
2. **Variant context** — the asset is already declared as a variant with known overrides. Apply variant overrides, not spec defaults.
3. **Spec rule** — apply the rule. If the request is ambiguous, apply the spec rule and note the decision.
4. **Spec gap** — rule doesn't exist yet. Use best judgment consistent with adjacent rules, then add the rule to the spec.

When in doubt, flag the conflict explicitly to the user rather than silently choosing.

**Extendability:** Both `AGENT_GUIDE.md` and conflict resolution rules are designed to be appended, not rewritten. New document types, generators, and rules get added as new rows in tables or new numbered items — existing content stays stable.

---

## 18. Mutations & Variants

A variant is any asset or component that intentionally deviates from one or more spec rules. Variants are first-class — they are expected, named, and documented. They do not pollute the canonical spec.

### When to create a variant

- Experimenting with a new visual direction before committing to the spec (e.g., testing a different font on the quiz)
- One-off client-facing asset that requires a different tone or layout
- A/B testing two versions of a social graphic
- Localisation that requires layout or typographic adjustments

### How to document a variant

Create a named entry in `brand/VARIANTS.md`:

```markdown
## [variant-name]

**Asset:** quiz spider chart
**Status:** experimental / active / deprecated
**Owner:** Tommi
**Created:** 2026-03-19

### Overrides
| Rule | Spec default | Variant value | Reason |
|------|-------------|---------------|--------|
| Headline font | Space Grotesk | Neue Haas Grotesk | Testing more editorial feel for quiz results |

### Files
- Template: `templates/variants/quiz-v2.html`
- Example output: `assets/raster/variants/quiz-spider-v2.png`

### Resolution
[ ] Promote to spec  [ ] Discard  [ ] Keep as permanent variant
```

### Rules for variants

- **Never modify canonical templates.** Create a new file under `templates/variants/` or `generators/variants/`.
- **Never import variant overrides into `tokens.ts`.** Variant values live only in the variant template or a companion `variant-tokens.ts`.
- **Document the override table.** Every deviation from the spec must be explicitly listed — not "it looks different" but "font-headline overridden from Space Grotesk to X because Y."
- **Assign a resolution.** Every variant eventually resolves to: promoted to spec, discarded, or designated a permanent variant (rare). Unresolved variants accumulate debt.
- **Max 3 active experimental variants at a time.** If you need a fourth, resolve one first.

### Promoting a variant to spec

1. Update the relevant sections of `BRAND_SPEC.md` with the new canonical values.
2. Update `tokens.ts` if the change involves token values.
3. Run `sync-website.sh` if `tokens.css` changed.
4. Update `AGENT_GUIDE.md` quick-reference tables.
5. Update `BRAND_SKILL.md` if the decision tree or cheatsheet is affected.
6. Mark the variant as "promoted" in `VARIANTS.md` and archive the variant files.

---

## 19. Demo Showcase

A 6-page static site at `brand/demo/`. No framework, no build step — open any page directly in a browser. Each page has exactly one job.

### Shared conventions across all pages

- Fonts loaded via `@font-face` from `../website/fonts/` (relative path)
- Tokens loaded via `<link rel="stylesheet" href="../tokens.css">`
- Shared `<nav>` strip linking all 6 pages (active page highlighted)
- `<link rel="stylesheet" href="print.css" media="print">` — `print.css` hides nav and ensures all content prints cleanly

### Pages

| File | Job | Replaces |
|------|-----|----------|
| `index.html` | Brand at a glance — logo, color strip, font samples, nav cards to all pages | — |
| `identity.html` | Full CI / Brand Guide — colors, typography scale, spacing, voice rules | `website/brand.njk` |
| `components.html` | Component Library — all live-rendered UI components | — |
| `documents.html` | Document templates — preview + HTML source + PNG + CLI snippet per type | — |
| `social.html` | Social & brand assets — LinkedIn banner, logo variants, QR codes | — |
| `workflow.html` | System documentation — pipeline, generators, token sync, skill packaging | — |

### Asset action bar pattern (documents.html and social.html)

Each asset has a consistent action bar:
```html
<a href="../templates/{type}.html">View HTML source</a>
<a href="previews/{type}-preview.png" download>Download PNG</a>
<!-- PDF types only: -->
<pre><code>npm run pdf -- sample.md --type {type} [flags]</code></pre>
```

### Document previews

Generated by `scripts/export-assets.ts` into `brand/demo/previews/`:
- `letter-preview.png`
- `offer-preview.png`
- `invoice-preview.png`
- `tos-preview.png`

Generated by screenshotting the debug HTML at 794×1123 viewport (A4). Regenerate with `npm run export`.

### Maintenance

When a new asset type or component is added to the spec, add a corresponding section to the relevant demo page. When a new document type is added, add it to `documents.html` and update `export-assets.ts` to generate its preview.

---

## 20. Skill Compilation Pipeline

The brand skill is packaged as a proper Cowork `.skill` file, installable by any user. The source lives in `brand/skill/` and is compiled by `brand/scripts/build-skill.sh`.

### Skill folder structure

```
brand/skill/
└── brand-engine/
    ├── SKILL.md                         ← YAML frontmatter + lean instructions (<200 lines)
    └── references/
        ├── brand-reference.md           ← copy of BRAND_SKILL.md (token tables, cheatsheet)
        └── agent-guide.md               ← copy of AGENT_GUIDE.md (CLI reference, quirks)
```

### SKILL.md structure

Follows the Cowork skill format:
```yaml
---
name: brand-engine
description: [triggering description — see below]
---
```

Body: decision tree, how to invoke generators, when to read reference files. Under 200 lines. Heavy reference material stays in `references/`.

The description must be specific enough to trigger on natural requests: "write a letter to a client", "generate an offer PDF", "create a LinkedIn banner", "regenerate the brand assets", "update the LinkedIn banner", etc.

### Compilation

```bash
npm run build:skill
```

This runs `scripts/build-skill.sh` which:
1. Copies `BRAND_SKILL.md` → `skill/brand-engine/references/brand-reference.md`
2. Copies `AGENT_GUIDE.md` → `skill/brand-engine/references/agent-guide.md`
3. Validates that `SKILL.md` is not a placeholder
4. Runs `package_skill.py` from the skill-creator tools
5. Outputs `brand/dist/brand-engine.skill`

### Installation

User installs `brand-engine.skill` via Cowork's plugin/skill install flow. Once installed, Claude can generate brand assets in any Cowork session without being re-briefed.

### Maintenance rule

`SKILL.md` is edited by hand when the system's capabilities change meaningfully. `references/` files are overwritten on every `build:skill` run — never edit them directly in the skill folder, always edit the source (`BRAND_SKILL.md`, `AGENT_GUIDE.md`) and rebuild.
