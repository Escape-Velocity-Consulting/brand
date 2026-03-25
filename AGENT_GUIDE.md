# Escape Velocity — Agent Guide

> Lookup reference. No prose. For rationale read BRAND_SPEC.md, for quick-start read BRAND_SKILL.md.

---

## Generator Quick-Reference

| Generator | What | npm shortcut |
|-----------|------|-------------|
| `pdf.ts` | Markdown → branded A4 PDF | `npm run pdf -- input.md [flags]` |
| `image.ts` | HTML or SVG → PNG | `npm run image -- --input file [flags]` |
| `export-assets.ts` | All raster exports + demo previews | `npm run export` |
| `generate_qr.py` | URL → branded QR PNG (legacy Python) | `python brand/generate_qr.py` |

Run all commands from the `brand/` directory.

---

## Document Type Map

| User wants | `--type` | Template | Meta strip |
|------------|----------|----------|------------|
| Letter / correspondence / briefing | `letter` | `templates/letter.html` | Optional |
| Service offer with pricing | `offer` | `templates/offer.html` | Optional |
| Client invoice | `invoice` | `templates/invoice.html` | Always shown |
| Terms of service / contract | `tos` | `templates/tos.html` | None |

---

## Template Variables

### All document templates

| Variable | Type | Required | Source |
|----------|------|----------|--------|
| `CONTENT` | HTML string | yes | Rendered from markdown by pdf.ts |
| `SUBJECT` | string | no | First H1 from markdown (auto); stripped from body after extraction |
| `RECIPIENT` | string | no | `--to` flag |
| `DATE` | string | no | `--date` flag or today in locale format |
| `REF` | string | no | `--ref` flag |
| `CONFIDENTIAL` | boolean | no | `--confidential` flag |
| `SHOW_META` | boolean | derived | True if RECIPIENT, REF, or CONFIDENTIAL present |
| `LANG` | "de" \| "en" | no | `--lang` flag, default "de" |
| `STRINGS` | object | auto | Injected by pdf.ts — do not pass manually |
| `FONTS_URI` | string | auto | Injected by pdf.ts — file:// path to website/fonts/ |

### social/linkedin-banner.html

`FONTS_URI` + optional `TAGLINE`, `CTA_LABEL`, `URL` — see Social Templates below.

---

## Social Templates

| Template | Preset | Key Vars |
|----------|--------|----------|
| `quote-card.html` | `linkedin-post` / `square` | `QUOTE`, `AUTHOR` |
| `stats-card.html` | `linkedin-post` | `STAT`, `UNIT`, `LABEL` |
| `announcement.html` | `og` / `linkedin-post` | `HEADLINE`, `EYEBROW`, `BODY` |
| `og.html` | `og` | `TITLE`, `SUBTITLE` |
| `linkedin-banner.html` | `linkedin-banner` | `TAGLINE`, `CTA_LABEL`, `URL` |
| `twitter-banner.html` | `twitter-banner` | `TAGLINE`, `CTA_LABEL`, `URL` |
| `youtube-banner.html` | `youtube-banner` | `BRAND`, `TAGLINE`, `URL` |

All social templates live in `templates/social/`. Pass variables via `--var "KEY=value"` (repeatable).

```bash
# Quote card
npm run image -- --input templates/social/quote-card.html --type html --preset linkedin-post --var "QUOTE=Your insight here" -o quote.png

# Stats graphic
npm run image -- --input templates/social/stats-card.html --type html --preset linkedin-post --var "STAT=17+" --var "LABEL=Jahre Erfahrung" -o stats.png

# OG image
npm run image -- --input templates/social/og.html --type html --preset og --var "TITLE=Page Title" -o og.png

# Announcement
npm run image -- --input templates/social/announcement.html --type html --preset og --var "HEADLINE=New Service" -o announce.png
```

---

## Common Invocations

```bash
# 1. Formal letter with full metadata
npm run pdf -- proposal.md --type letter \
  --to "Mag. Klaus Berger · Berger & Partner" \
  --ref "EV-2026-042" --subject "Prozess-Review Angebot" --lang de

# 2. Quick letter — subject auto-extracted from H1
npm run pdf -- briefing.md -o briefing.pdf

# 3. Inspect before PDF — write debug HTML alongside
npm run pdf -- input.md --type letter --debug -o /tmp/test.pdf

# 4. Regenerate LinkedIn banner after template edit
npm run image -- \
  --input templates/social/linkedin-banner.html \
  --type html --preset linkedin-banner \
  -o assets/raster/linkedin-banner.png

# 5. Export all assets + demo previews
npm run export
```

---

## Known Fragile Areas

| Area | Issue | Workaround |
|------|-------|------------|
| `generate_qr.py` | Depends on `SpaceGrotesk.ttf` in brand root — legacy Python dep | Don't delete that TTF until `qr.ts` is implemented |
| `svg.ts` | Not yet implemented | Use placeholder in demo; log as variant if needed |
| Demo business card section | Points to live site (`escapevelocity.consulting/hi/`) — won't render offline | Known gap; fix when `qr.ts` and offline mode is added |

---

## Known Quirks

- **H1 stripping:** pdf.ts always strips the first H1 from the markdown body and uses it as subject. Pass `--subject` to override the value — the H1 is still stripped from body regardless.
- **Smart quotes:** markdown-it runs with `typographer: true`. Straight quotes in markdown become curly in output. Intentional — do not disable.
- **image.ts always templates:** All HTML input is processed by Nunjucks before screenshotting. Safe to inject any variables even if the template doesn't reference them.

---

## Conflict Resolution

1. Explicit user override → generate it, document in `VARIANTS.md`
2. Active variant → apply overrides from `VARIANTS.md`, not spec defaults
3. Spec rule → apply it, note the decision
4. Spec gap → use judgment consistent with adjacent rules, add rule to spec afterward

When ambiguous: flag to user, don't silently choose.

---

## Adding New Things

| What | Where |
|------|-------|
| New asset (no clear type yet) | BRAND_SPEC.md §14 — ideation workflow. Write prototype to `scratch/`, iterate, optionally promote |
| New asset type | BRAND_SPEC.md §15 — follow the 6-step protocol |
| New document template | `templates/`, extend `_base.html`, document variables in spec §12 |
| New social template | `templates/social/`, standalone HTML, 1584×396 or standard preset |
| New generator | `generators/`, document CLI in spec §11 |
| New token | `tokens.ts` → `npm run build:tokens` → `npm run sync:website` |
| New variant | `VARIANTS.md` entry + files in `templates/variants/` — max 3 active |
| Update demo | Add section to relevant demo page, regenerate previews with `npm run export` |

---

## Skill Packaging

The brand skill is distributed as `dist/brand-engine.skill`, built from `skill/brand-engine/`.

**To rebuild after updating BRAND_SKILL.md or AGENT_GUIDE.md:**
```bash
npm run build:skill
```

This copies reference files, validates `SKILL.md` is not a placeholder, runs `package_skill.py`, and outputs `dist/brand-engine.skill`.

**To rebuild after updating SKILL.md itself:** same command — then reinstall the .skill file in Cowork.

**Never edit `skill/brand-engine/references/` directly** — those files are overwritten on every build. Edit `BRAND_SKILL.md` and `AGENT_GUIDE.md` (the sources) instead.

**Demo pages:** `demo/` is a 6-page static site. Pages: `index.html` (overview), `identity.html` (CI guide), `components.html` (component library), `documents.html` (document templates), `social.html` (social assets), `workflow.html` (system docs). Open any page directly in a browser — no server needed.
