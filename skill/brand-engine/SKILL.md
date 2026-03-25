---
name: brand-engine
description: Generate on-brand Escape Velocity assets — letters, offers, invoices, terms of service, LinkedIn banners, social graphics, logos, QR codes, and any other brand output. Use this skill whenever the user wants to create, generate, update, or export any asset using the Escape Velocity brand system. Trigger on requests like "write a letter to a client", "generate an offer", "create a LinkedIn banner", "regenerate the brand assets", "export the logo", "make a PDF", "update the banner", "generate an invoice", "create an OG image", "rebuild the skill" — even if the user doesn't say "brand" explicitly. Also use when the user asks about brand tokens, colors, fonts, or wants to check the CI guide.
---

# Brand Engine

You have access to the Escape Velocity brand system. This skill is self-contained — all generators, templates, fonts, and logos are included.

---

## Bootstrap (run once)

**Before running any generator**, check if `${CLAUDE_SKILL_DIR}/node_modules/` exists. If not, run:

```bash
bash ${CLAUDE_SKILL_DIR}/setup.sh
```

This installs npm dependencies and Playwright's Chromium. Only needed once after skill installation.

---

## What to do

### Step 0 — Route: known asset or ideation?

If the user has a clear asset type (letter, banner, invoice, etc.) → skip to Step 1.

If the user wants to brainstorm, concept, or design something new without a clear type:

1. **Clarify** — Pick composition: **format** × **color** × **alignment**

   Formats: `linkedin-landscape` (1200×627) · `linkedin-post` (1200×1200) · `linkedin-portrait` (1080×1350) · `og` (1200×630) · `linkedin-banner` (1584×396) · custom w×h

   Colors: **dark** (default) · **cream** · **terracotta** — see BRAND_SPEC §14 for token mapping

   Alignment: **left** (default) · **center** · **right**
2. **Draft** — Content elements: text, visual structure, what could become variables later
3. **Prototype** — Write standalone HTML to `scratch/<name>.html` **in the user's working directory** (not inside the skill dir). Conventions:
   - Inline styles, `{{ FONTS_URI }}` for brand fonts, fixed pixel dimensions, `overflow: hidden`, no JS
   - JetBrains Mono for URL display: add `<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">` (not self-hosted)
   - Bottom bar pattern: wordmark (Space Grotesk 700) left, URL (JetBrains Mono, terracotta) right — no separator line. Wordmark text: "Escape" in `light` (`#F5F3F0`), "Velocity" in `accent` (`#E8865A`) — always the full word, not just the "V".
   - Accent word in headlines: use `accent` (`#E8865A`) on dark bg for emphasis (like "Velocity" in logo)
   - After rendering, **always tell the user the output file path**

   Render with `image.ts`:
   ```bash
   npx --prefix ${CLAUDE_SKILL_DIR} tsx ${CLAUDE_SKILL_DIR}/generators/image.ts --input scratch/<name>.html --type html --width <w> --height <h> -o <name>.png
   ```
4. **Iterate** — Show screenshot, user reacts, adjust, re-render. Repeat until locked.
5. **Lock** — Two outcomes:
   - **One-off:** Deliver the final PNG/PDF. Done.
   - **Reusable template:** Move to `templates/` (any category), parameterize into Nunjucks vars, document variables, update decision tree below, rebuild skill.

---

### Step 1 — Identify the asset type

Use this decision tree:

```
User wants a document?
  Letter / correspondence / briefing → pdf.ts --type letter
  Service offer with pricing         → pdf.ts --type offer
  Client invoice                     → pdf.ts --type invoice
  Terms of service / contract        → pdf.ts --type tos

User wants a social or marketing graphic?
  LinkedIn banner      → --preset linkedin-banner --input templates/social/linkedin-banner.html
  Twitter/X banner     → --preset twitter-banner --input templates/social/twitter-banner.html
  YouTube banner       → --preset youtube-banner --input templates/social/youtube-banner.html
  OG image             → --preset og --input templates/social/og.html
  Quote card           → --preset linkedin-post --input templates/social/quote-card.html
  Stats card           → --preset linkedin-post --input templates/social/stats-card.html
  Announcement         → --preset og --input templates/social/announcement.html
  LinkedIn landscape   → --preset linkedin-landscape (use ideation, Step 0)
  LinkedIn portrait    → --preset linkedin-portrait (use ideation, Step 0)
  Instagram post       → --preset instagram-post (use any template)
  Instagram story      → --preset instagram-story (use any template)

User wants a logo export?
  SVG → PNG            → image.ts --input assets/logos/{name}.svg --type svg

User wants everything rebuilt?
  All raster assets    → export-assets.ts

User wants to update tokens?
  After editing tokens.ts → build-tokens.ts
```

### Step 2 — Gather inputs

For documents:
- You need markdown content. If the user hasn't provided it, ask for it or offer to draft it based on their description.
- Ask for `--to` (recipient), `--ref` (reference number), `--subject` if not obvious from the content.
- Default language is German (`--lang de`). Ask if the user needs English.

For social graphics:
- Ask what content/text the user wants on the graphic.
- Pass content via `--var "KEY=value"` flags (repeatable for multiple variables).
- Show them the available variables for the chosen template (see `references/brand-reference.md` for the full table).
- If they want to update layout beyond variable changes, edit the template HTML, then generate.

**Sizing rule for social templates:** Templates render at full pixel dimensions (1200–1584px), not scaled up from smaller viewports. Font sizes must be proportionally large — web-scale sizes (16–52px) will look tiny. Use these calibrated ranges:

| Element | Banner (1584×396 / 1500×500) | Square card (1200×1200) | OG (1200×630) | Landscape (1200×627) | Portrait (1080×1350) |
|---------|------------------------------|------------------------|---------------|---------------------|---------------------|
| Headline / quote | 52–62px | 72–78px | 64–72px | 58–66px | 64–72px |
| Wordmark | 46–48px | 48–51px | 38–42px | 38–42px | 42–46px |
| Stat number | — | 200–260px | — | — | — |
| Author / label | — | 45–48px | — | — | — |
| Subtitle / CTA | 24px | 28–36px | 24–28px | 22–26px | 26–32px |
| Domain / URL | 24px | 28–30px | 18–22px | 18–22px | 24–28px |
| Footer wordmark | — | 48–51px | — | — | — |
| Footer domain | — | 28–30px | — | — | — |

When creating new templates or prototyping in `scratch/`, start with these ranges. If in doubt, go bigger — it's easier to scale down than to iterate up from undersized type.

**Contrast rule for social graphics:** These assets are rendered at full resolution (1200–1584px) but displayed much smaller in feeds (often 500–600px wide). Fine lines and subtle opacity values that look clear at 100% zoom disappear at feed scale. For grid lines, chart scaffolding, and structural elements on dark backgrounds, use `rgba(255,255,255,0.4–0.5)` — not the `0.06–0.12` you'd use on a website. Same principle applies to thin strokes: use 1.5–2px minimum, not 1px.

### Step 3 — Run the generator

**All commands use `${CLAUDE_SKILL_DIR}` for paths and `npx --prefix ${CLAUDE_SKILL_DIR}` for execution.** Output goes to the user's current working directory.

#### Documents (Markdown → PDF)

```bash
npx --prefix ${CLAUDE_SKILL_DIR} tsx ${CLAUDE_SKILL_DIR}/generators/pdf.ts input.md --type letter -o output.pdf
```

Full options:
```
  -o, --output <path>       Output PDF path (default: input with .pdf extension)
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

#### Social / Marketing Graphics (HTML → PNG)

```bash
npx --prefix ${CLAUDE_SKILL_DIR} tsx ${CLAUDE_SKILL_DIR}/generators/image.ts --input ${CLAUDE_SKILL_DIR}/templates/social/quote-card.html --type html --preset linkedin-post --var "QUOTE=Your text here" -o quote.png
```

#### Logo Export (SVG → PNG)

```bash
npx --prefix ${CLAUDE_SKILL_DIR} tsx ${CLAUDE_SKILL_DIR}/generators/image.ts --input ${CLAUDE_SKILL_DIR}/assets/logos/ev-wordmark.svg --type svg --preset og -o wordmark.png
```

#### Batch Export

```bash
npx --prefix ${CLAUDE_SKILL_DIR} tsx ${CLAUDE_SKILL_DIR}/scripts/export-assets.ts
```

### Step 4 — Check the output

Before delivering:
- [ ] Colors are from tokens (no hardcoded hex)
- [ ] Max 3 fonts used
- [ ] Print asset? No black backgrounds, white foregrounds use #fff not #F5F3F0
- [ ] Variant (deviates from spec)? Document in VARIANTS.md

---

## Reference files

Read these when you need details:
- `${CLAUDE_SKILL_DIR}/references/brand-reference.md` — token table, cheatsheet, template variables
- `${CLAUDE_SKILL_DIR}/references/agent-guide.md` — full CLI reference, document type map, known fragile areas

---

## Conflict resolution

1. User explicitly asks to deviate → do it, note the deviation
2. Spec rule exists → apply it
3. No rule exists → use judgment, flag ambiguity to the user
