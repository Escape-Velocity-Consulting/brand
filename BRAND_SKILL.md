# Escape Velocity — Brand Skill

> Terse agent brief. Rationale lives in BRAND_SPEC.md. CLI detail in AGENT_GUIDE.md.

---

## Token Quick-Reference

| Token | Hex | Use |
|-------|-----|-----|
| `cream` | `#F9F7F4` | Default background |
| `black` | `#1E1C1A` | Dark sections, hero, nav |
| `terracotta` | `#D4784A` | Primary accent — CTAs, borders, eyebrows |
| `terracottaHover` | `#C2653A` | Button hover |
| `accent` | `#E8865A` | Light accent on dark bg ("Velocity" in logo) |
| `light` | `#F5F3F0` | Text on dark bg |
| `muted` | `#C4BEB8` | Secondary text on dark bg |
| `subtle` | `#807A74` | Tertiary text, labels |
| `body` | `#5C5650` | Body copy on light bg |
| `text` | `#1A1816` | Headings on light bg |

**Fonts:** Space Grotesk (headlines, 700) · Manrope (UI/labels/CTAs, 600) · Inter (body, 400) · JetBrains Mono (URL display only, rare)

**Rule:** Never hardcode hex. Max 3 fonts per asset. No black backgrounds on print assets.

---

## Decision Tree

```
PDF document (letter / offer / invoice / ToS)?
  → npm run pdf -- input.md --type <letter|offer|invoice|tos>

Social graphic or banner?
  → npm run image -- --type html --preset <linkedin-banner|og|linkedin-post|linkedin-landscape|linkedin-portrait|square>
  LinkedIn landscape   → --preset linkedin-landscape
  LinkedIn portrait    → --preset linkedin-portrait

SVG logo → PNG?
  → npm run image -- --type svg --input assets/logos/X.svg

Infographic / chart?
  → svg.ts (not yet implemented — placeholder in demo)

Regenerate all raster assets + demo previews?
  → npm run export

Token change → sync to website?
  → npm run build:tokens && npm run sync:website
```

---

## Generator Cheatsheet

```bash
# Letter
npm run pdf -- input.md --type letter --to "Name · Company" --ref "EV-2026-042" --lang de

# Offer
npm run pdf -- input.md --type offer --to "Name · Company" --subject "Angebot: Prozess-Review"

# Invoice (structured recipient REQUIRED — see AGENT_GUIDE.md → "Recipient flags")
npm run pdf -- input.md --type invoice \
  --to-company "Acme GmbH" --to-name "z.H. Erika Muster" \
  --to-address "Hauptstr. 1\n1010 Wien" --to-uid "ATU12345678" \
  --ref "2026-11" --output-dir ../drafts
# Filename derived automatically: "AR 2026-11 - YYYY-MM-DD - Acme GmbH - <subject>.pdf"

# Terms of Service
npm run pdf -- input.md --type tos

# Debug (inspect HTML before committing to PDF)
npm run pdf -- input.md --type letter --debug

# LinkedIn banner
npm run image -- --input templates/social/linkedin-banner.html --type html --preset linkedin-banner -o assets/raster/linkedin-banner.png

# SVG logo → PNG
npm run image -- --input assets/logos/ev-wordmark.svg --type svg -o assets/raster/ev-wordmark-300.png --width 300

# Carousel (multi-slide PDF for LinkedIn)
npx tsx generators/carousel.ts --spec carousel.json -o carousel.pdf
```

---

## Template Variables

All document templates share:

| Variable | Required | Notes |
|----------|----------|-------|
| `CONTENT` | yes | Rendered HTML from markdown |
| `SUBJECT` | no | Auto-extracted from first H1 if omitted (H1 then stripped from body) |
| `RECIPIENT` | no | "Name · Company" format |
| `DATE` | no | Today in locale format |
| `REF` | no | e.g. "EV-2026-042" |
| `CONFIDENTIAL` | no | Boolean |
| `SHOW_META` | derived | True if RECIPIENT, REF, or CONFIDENTIAL present |
| `LANG` | no | "de" (default) or "en" |
| `STRINGS` | auto | Injected by pdf.ts |
| `FONTS_URI` | auto | Injected by pdf.ts — file:// path to website/fonts/ |

**Per-type overrides:**
- `invoice.html` — meta strip always shown
- `tos.html` — no meta strip, no subject line

### Carousel templates (`templates/carousel/`)

**title.html** — `EYEBROW` (opt), `BIGNUMBER` (req), `HEADLINE` (req, `| safe`)

**numbered-item.html** — `PILL` (req), `PROGRESS` (auto-injected, optional manual override), `NUMBER` (req), `TITLE` (req, `| safe`)

**cta.html** — `EYEBROW` (opt), `HEADLINE` (req, `| safe`), `SUBTITLE` (opt), `BUTTON` (req), `URL` (req)

All three templates expose `.accent { color: #E8865A; }` for inline emphasis (`<span class="accent">word</span>`). `WIDTH` and `HEIGHT` vars are auto-injected by `carousel.ts` based on the format. Auto-progress counts only `numbered-item.html` slides.

---

## Pre-Generation Checklist

- [ ] Colors from tokens only — no hardcoded hex
- [ ] Max 3 fonts per asset
- [ ] Print asset? → no black backgrounds; white foregrounds → `#fff` not `#F5F3F0`
- [ ] New template? → extends `_base.html`; uses `FONTS_URI` for font paths
- [ ] Variant (deviates from spec)? → document in `VARIANTS.md`, put files in `templates/variants/`

---

## Known Quirks

- **H1 stripping:** pdf.ts always strips the first H1 from the markdown body (used as subject). Pass `--subject` to override the value without affecting stripping behaviour.
- **Template adds signature and (offer) legal notes:** Don't paste "Mit freundlichen Grüßen / Tommi Enenkel / Escape Velocity" or AGB clauses into the markdown — the template renders them. Suppress signature with `--no-signature`. See AGENT_GUIDE.md → "Before rendering: cleanup pass".
- **Invoices require structured recipient flags.** `--to` alone is rejected. See AGENT_GUIDE.md → "Recipient flags".
- **Smart quotes:** markdown-it runs with `typographer: true` — straight quotes become curly. Intentional.
- **image.ts always templates:** All HTML input runs through Nunjucks before screenshotting. Safe to inject any variable even if the template doesn't use it.

---

## Conflict Resolution

1. Explicit user override → generate it, document as variant in `VARIANTS.md`
2. Known active variant → apply variant overrides from `VARIANTS.md`
3. Spec rule exists → apply it, note the decision
4. Spec gap → use judgment consistent with adjacent rules, then add rule to spec

When ambiguous: flag to user, don't silently choose.

---

## Ideation

No clear asset type, or want to concept something new? See BRAND_SPEC.md §14. Write prototype HTML to `scratch/`, render with `image.ts`, iterate with user. Optionally promote to `templates/` if reusable.

Composition shortcuts (format × color × alignment) documented in BRAND_SPEC.md §14.

---

→ Full spec: `BRAND_SPEC.md`  →  CLI reference: `AGENT_GUIDE.md`  →  Variants: `VARIANTS.md`
