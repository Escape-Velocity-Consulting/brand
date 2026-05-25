# Escape Velocity — Brand Reference

> Token table + CSS vars + layout patterns. Authoring reference only — no
> workflow guidance (that lives in `SKILL.md`). Shipped in the
> escape-velocity-brand skill as `references/brand-reference.md`.

---

## Color tokens

All colors live in `tokens.ts` → emitted to `tokens.css` as CSS custom
properties. Use the CSS var name when writing HTML; the hex column is for
reference only.

| Token name | CSS var | Hex | Use |
|------------|---------|-----|-----|
| `cream` | `var(--color-cream)` | `#F9F7F4` | Default background (light mode) |
| `black` | `var(--color-black)` | `#1E1C1A` | Dark sections, hero, nav, dark backgrounds |
| `terracotta` | `var(--color-terracotta)` | `#D4784A` | Primary accent — CTAs, borders, eyebrows, key data |
| `terracottaHover` | `var(--color-terracotta-hover)` | `#C2653A` | Button / link hover state |
| `accent` | `var(--color-accent)` | `#E8865A` | Light accent on dark bg (e.g. "Velocity" in logo) |
| `light` | `var(--color-light)` | `#F5F3F0` | Primary text on dark bg |
| `muted` | `var(--color-muted)` | `#C4BEB8` | Secondary text on dark bg |
| `subtle` | `var(--color-subtle)` | `#807A74` | Tertiary text, labels, captions |
| `body` | `var(--color-body)` | `#5C5650` | Body copy on light bg |
| `text` | `var(--color-text)` | `#1A1816` | Headings on light bg |

Need the live values at runtime? Call `get_tokens` (returns parsed
`tokens.json`).

---

## Type tokens

| Family | CSS var | Weights | Use |
|--------|---------|---------|-----|
| Space Grotesk | `var(--font-headline)` | 700 | Headlines, big numbers, title slides |
| Manrope | `var(--font-ui)` | 600 | UI, labels, CTAs, button text |
| Inter | `var(--font-body)` | 400 | Body copy, paragraphs |
| JetBrains Mono | `var(--font-mono)` | 400 | URL display only (rare — avoid otherwise) |

**Type-system rules**
- Max 3 fonts per asset (the 4th, mono, is reserved for URLs).
- Headlines: always Space Grotesk 700.
- UI / button / label: Manrope 600.
- Body: Inter 400.
- Line-height: 1.0 for big numbers, 1.15 for headlines, 1.5 for body.

---

## Hard rules (never break these)

1. **Never hardcode hex values or font-family strings.** Always `var(--color-X)` / `var(--font-X)`.
2. **Inject `{{ TOKENS_CSS | safe }}`** at the top of any `<style>` block in HTML you author. The MCP auto-fills this when you call render tools.
3. **No black backgrounds on print assets** — PDFs render with light mode (`--color-cream` background). Dark mode is for screen / social only.
4. **White on dark = `#fff`, not `--color-light`** — on truly black backgrounds, use `#fff` for max contrast. `--color-light` (`#F5F3F0`) is for the standard dark-mode panel, not absolute black.
5. **Max 3 fonts per asset.** Mixing 4 fonts is a brand violation.

---

## Layout patterns

### Vertical rhythm
- **Spacing scale**: multiples of 8px (8, 16, 24, 32, 48, 64, 96, 128).
- **Accent rule**: 4px-wide terracotta vertical bar, 60–80px tall, common as a left-side delimiter on hero text:
  ```html
  <div class="accent-rule" style="width:4px;height:80px;background:var(--color-terracotta);"></div>
  ```

### Eyebrow
- Small uppercase label above a headline, usually terracotta.
- Letter-spacing 0.05em, font Manrope 600, font-size 14–18px.

### Big number
- The headline pattern for stats cards / carousel titles.
- Space Grotesk 700, 200–280px, color `var(--color-terracotta)`.
- Pair with a short label (Manrope 600, uppercase, `--color-body` or `--color-subtle`).

### Card / panel
- Light bg → `var(--color-cream)`, rounded 16px, 32–48px inner padding.
- Dark bg → `var(--color-black)`, same radius/padding, foreground in `var(--color-light)`.

### CTA button
- Background `var(--color-terracotta)`, text `#fff`, padding 16px 32px.
- Font Manrope 600, letter-spacing 0.02em.
- Hover: `var(--color-terracotta-hover)`.

### Hero / banner
- Eyebrow (terracotta) → accent rule → big headline (Space Grotesk 700) → optional subtitle (Inter 400, `--color-body`).
- For social banners with the brand wordmark, position it at top-left, 48–72px from edge.

---

## Voice & content rules

- **German default.** All client-facing copy is German unless explicitly English. Headlines use German typography rules (capitalize nouns, "ß" not "ss", curly quotes).
- **Sentence case** for headlines and labels — not Title Case (English convention).
- **No emoji** in client-facing assets. Use icons or accent colors for emphasis.
- **No exclamation marks** in formal documents (letters, offers, invoices, ToS).
- **Active voice**, present tense. "Wir liefern" not "geliefert wird".

---

## Tone of voice anchors

| Adjective | What it means | Anti-pattern |
|-----------|---------------|--------------|
| **Clear** | One idea per sentence. No jargon without explanation. | "Wir orchestrieren end-to-end Digital Transformation." |
| **Concrete** | Numbers, names, timelines. No "innovative solutions." | "Wir machen Sie zukunftsfähig." |
| **Calm** | No urgency theatre, no all-caps, no "exclusive offer." | "JETZT NUR BIS FREITAG: 20% RABATT!!!" |
| **Direct** | Say what you mean. No corporate hedging. | "Möglicherweise könnten wir eventuell evaluieren..." |

---

## Reference: known templates

These ship in the registry — see the `list_templates` MCP tool for the
authoritative list with required vars + dimensions.

**Documents (PDF, A4 + branded footer):**
- `letter`, `offer`, `invoice`, `tos`, `report`

**Social (PNG):**
- `social/og` (1200×630) — website / blog OG
- `social/linkedin-banner` (1584×396) — LinkedIn profile banner
- `social/twitter-banner` (1500×500) — X / Twitter banner
- `social/youtube-banner` (2560×1440, safe area 1546×423)
- `social/announcement` (1200×630) — announcement post
- `social/quote-card` (1200×1200) — quote + attribution
- `social/stats-card` (1200×1200) — big number + label

**Carousel slides (PNG, LinkedIn portrait 1080×1350):**
- `carousel/title` — opening slide
- `carousel/numbered-item` — list item with auto-progress
- `carousel/cta` — closing CTA slide

---

## Files in the repo

- `tokens.ts` → emits `tokens.css` + `tokens.json` (single source of truth).
- `templates.meta.ts` — registry for the MCP tools (dims, required vars, tags).
- `templates/` — HTML templates rendered by `render_template`.
- `BRAND_SPEC.md` — full normative spec (rules, design rationale, history).
