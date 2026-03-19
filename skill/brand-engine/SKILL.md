---
name: brand-engine
description: Generate on-brand Escape Velocity assets — letters, offers, invoices, terms of service, LinkedIn banners, social graphics, logos, QR codes, and any other brand output. Use this skill whenever the user wants to create, generate, update, or export any asset using the Escape Velocity brand system. Trigger on requests like "write a letter to a client", "generate an offer", "create a LinkedIn banner", "regenerate the brand assets", "export the logo", "make a PDF", "update the banner", "generate an invoice", "create an OG image", "rebuild the skill" — even if the user doesn't say "brand" explicitly. Also use when the user asks about brand tokens, colors, fonts, or wants to check the CI guide.
---

# Brand Engine

You have access to the Escape Velocity brand system. All generators run from the `brand/` directory.

**When you start:** read `references/brand-reference.md` — it has the token table, decision tree, and generator cheatsheet. Read `references/agent-guide.md` if you need CLI details, template variables, or known quirks.

---

## What to do

### Step 1 — Identify the asset type

Use this decision tree:

```
User wants a document?
  Letter / correspondence / briefing → npm run pdf -- input.md --type letter
  Service offer with pricing         → npm run pdf -- input.md --type offer
  Client invoice                     → npm run pdf -- input.md --type invoice
  Terms of service / contract        → npm run pdf -- input.md --type tos

User wants a social or marketing graphic?
  LinkedIn banner                    → npm run image -- --input templates/social/linkedin-banner.html --type html --preset linkedin-banner
  Open Graph / website share         → npm run image -- --input templates/social/og.html --type html --preset og
  Square post                        → npm run image -- --input templates/social/og.html --type html --preset square

User wants a logo export?
  SVG → PNG                          → npm run image -- --input assets/logos/{name}.svg --type svg -o assets/raster/{name}.png --width {px}

User wants everything rebuilt?
  All raster assets + previews       → npm run export

User wants to update tokens and sync to website?
  After editing tokens.ts            → npm run build:tokens && npm run sync:website

User wants to package the skill?
  After SKILL.md is updated          → npm run build:skill
```

### Step 2 — Gather inputs

For documents:
- You need markdown content. If the user hasn't provided it, ask for it or offer to draft it based on their description.
- Ask for `--to` (recipient), `--ref` (reference number), `--subject` if not obvious from the content.
- Default language is German (`--lang de`). Ask if the user needs English.

For social graphics:
- No inputs required unless they want to change the template content first.
- If they want to update text/layout, edit the template, then generate.

### Step 3 — Run the generator

Run from the `brand/` directory. Use the `npm run` shortcuts — don't call `npx tsx` directly.

After generating, show the user the output file. For PDFs, also show the debug HTML if `--debug` was used.

### Step 4 — Check the output

Before delivering:
- [ ] Colors are from tokens (no hardcoded hex)
- [ ] Max 3 fonts used
- [ ] Print asset? No black backgrounds, white foregrounds use #fff not #F5F3F0
- [ ] Variant (deviates from spec)? Document in VARIANTS.md

---

## Working with the demo

To view the brand showcase, open `brand/demo/index.html` in a browser.

To regenerate all previews after changes:
```bash
cd brand && npm run export
```

The demo has 6 pages — each has one job. See `references/agent-guide.md` for what each page shows.

---

## Updating the skill itself

After making changes to `BRAND_SKILL.md` or `AGENT_GUIDE.md`:
```bash
cd brand && npm run build:skill
```

This rebuilds `dist/brand-engine.skill`. The user installs this file via Cowork.

After making changes to `SKILL.md` (this file): rebuild + reinstall.

---

## Conflict resolution

1. User explicitly asks to deviate → do it, document in `VARIANTS.md`
2. Asset is a known variant → apply overrides from `VARIANTS.md`
3. Spec rule exists → apply it
4. No rule exists → use judgment, then add the rule to `BRAND_SPEC.md`

When genuinely ambiguous: flag it to the user rather than silently choosing.

---

**Reference files:**
- `references/brand-reference.md` — token table, cheatsheet, template variables
- `references/agent-guide.md` — full CLI reference, document type map, known fragile areas
- `../BRAND_SPEC.md` — full specification with rationale
- `../VARIANTS.md` — active variants log
