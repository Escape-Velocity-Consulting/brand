/**
 * Brand-sin linter for `@type: html` slide fragments.
 *
 * Background: the v4 KI-Masterclass deck (May 2026) shipped four custom HTML
 * blocks — a multiplier row, an enablement spectrum, a process flow, a tier
 * ladder — each with 20–30 inline `style="..."` attributes hardcoding colors,
 * font sizes, font families, and padding. Even when authors reached for
 * `var(--color-terracotta)` they mixed it with raw `font-size: 88px` and
 * `width: 140px`. The output looked off-brand because the typography scale,
 * spacing rhythm, and color rules drift on every slide.
 *
 * The fix is twofold (this file is half of it):
 *   1. The presentation template ships an `.ev-*` utility palette covering the
 *      common patterns (canvas, h2, rule, lead, foot, flow, spectrum, tiers,
 *      multiplier). See `templates/presentation.html`.
 *   2. This linter scans every `@type: html` block and pushes a warning per
 *      inline-style sin into the render result's `warnings[]` channel. The
 *      agent sees them in the `render_slides` response and self-corrects on
 *      the next iteration.
 *
 * Non-blocking: the deck still renders. The linter is a feedback loop, not a
 * gate. Authors can ignore warnings if they really need a one-off — but they
 * see what's costing them brand consistency.
 */

export interface LintWarning {
  type: 'html_inline_style' | 'html_hardcoded_color' | 'html_low_contrast' | 'html_hardcoded_font' | 'html_redundant_tokens'
  slideIndex: number
  message: string
}

/** CSS properties whose inline use almost always reinvents a `.ev-*` class. */
const FORBIDDEN_INLINE_PROPS = ['color', 'font-family', 'font-size', 'font-weight', 'background', 'background-color']

/**
 * Scan one `@type: html` body for brand sins. Returns one warning per
 * distinct violation kind found (collapsed — we don't spam the agent with
 * 30 identical "inline color" warnings, one is enough to make the point).
 */
export function lintHtmlFragment(html: string, slideIndex: number): LintWarning[] {
  const warnings: LintWarning[] = []
  const seen = new Set<string>()

  function pushOnce(w: LintWarning) {
    if (seen.has(w.type)) return
    seen.add(w.type)
    warnings.push(w)
  }

  // 1. Inline style attributes containing forbidden properties.
  //    We allow inline `style` for geometry-only one-offs (position, width,
  //    height, transform, --at custom-properties for spectrum markers).
  const styleAttrMatches = html.matchAll(/style="([^"]*)"/g)
  const offendingProps = new Set<string>()
  for (const m of styleAttrMatches) {
    const decls = m[1].toLowerCase()
    for (const prop of FORBIDDEN_INLINE_PROPS) {
      if (new RegExp(`(^|;|\\s)${prop}\\s*:`).test(decls)) {
        offendingProps.add(prop)
      }
    }
  }
  if (offendingProps.size > 0) {
    pushOnce({
      type: 'html_inline_style',
      slideIndex,
      message: `Inline style attributes contain ${[...offendingProps].join(', ')}. Use .ev-* utility classes (.ev-h2, .ev-lead, .ev-foot, .ev-card, .ev-accent, .ev-flow, .ev-spectrum, .ev-tiers, .ev-mult-row) instead of inline color/font/size.`,
    })
  }

  // 2. Hardcoded hex colors outside SVG. SVG `fill="#abc"` etc. is legitimate.
  //    Strip <svg>...</svg> blocks before scanning.
  const withoutSvg = html.replace(/<svg[\s\S]*?<\/svg>/gi, '')
  const hexMatches = withoutSvg.match(/#[0-9a-fA-F]{3,8}\b/g)
  if (hexMatches && hexMatches.length > 0) {
    pushOnce({
      type: 'html_hardcoded_color',
      slideIndex,
      message: `Hardcoded hex color(s): ${[...new Set(hexMatches)].slice(0, 4).join(', ')}. Use token vars like var(--color-terracotta), var(--color-text), var(--color-cream).`,
    })
  }

  // 3. Known low-contrast token picks on cream.
  //    `--color-warm-gray-300` is too pale for thin connector lines or small
  //    text against the cream background — this was the visible-or-not bug
  //    on v4 slide 11 (Prozesse flow). Recommend a darker pick.
  if (/var\(--color-warm-gray-300\)/.test(html)) {
    pushOnce({
      type: 'html_low_contrast',
      slideIndex,
      message: `var(--color-warm-gray-300) is near-invisible on cream backgrounds. Use var(--color-text) with opacity (e.g. via .ev-rule or .ev-flow-line) or a darker warm-gray (-500 or above).`,
    })
  }

  // 4. Hardcoded font family literals.
  //    `font-family: 'Inter'` etc. should never appear in @type: html — the
  //    template injects var(--font-headline), var(--font-body), var(--font-ui).
  if (/font-family\s*:\s*['"]?(?:Inter|Space\s+Grotesk|Manrope|JetBrains)/i.test(html)) {
    pushOnce({
      type: 'html_hardcoded_font',
      slideIndex,
      message: `Hardcoded font-family. Use var(--font-headline) (Space Grotesk), var(--font-body) (Inter), var(--font-ui) (Manrope), or var(--font-mono) (JetBrains Mono).`,
    })
  }

  // 5. Redundant TOKENS_CSS re-injection. The presentation template already
  //    injects tokens at the document level — re-injecting inside an html
  //    fragment is harmless but wasteful and signals stale skill teaching.
  if (/TOKENS_CSS/.test(html) || /\{\{\s*TOKENS_CSS/.test(html)) {
    pushOnce({
      type: 'html_redundant_tokens',
      slideIndex,
      message: `{{ TOKENS_CSS }} is auto-injected at the slide level — remove from your @type: html block.`,
    })
  }

  return warnings
}
