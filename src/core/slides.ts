/**
 * Multi-page render orchestrator. One function — `renderSlides` — that
 * handles every multi-page brand asset: slide decks (presentation-style,
 * markdown-driven) and image carousels (full-page templates).
 *
 * Output toggles let the caller pick any combination of:
 * - **viewer**: a self-contained HTML deck-viewer (markdown / fragment mode only)
 * - **pdf**:    a combined PDF (page.pdf of the viewer for fragment mode; pdf-lib assembly of PNGs for full-page mode)
 * - **pngs**:   per-page PNG buffers
 *
 * Replaces (in F5) the multi-output orchestration in `carousel.ts` and
 * `presentation.ts`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'
import MarkdownIt from 'markdown-it'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import type { BrowserPool } from './browserPool.js'
import { GeneratorError } from './errors.js'
import type { BrandPaths } from './paths.js'
import { renderHtmlToPng } from './render.js'
import { getTemplateEnv, renderStringTemplate } from './templates.js'
import { loadTokensCss } from './tokens.js'
import { lintHtmlFragment } from './htmlLint.js'

// ─── Dimension presets ─────────────────────────────────────────────────────

export const SLIDE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  'slide-16-9':         { width: 1920, height: 1080 },
  'slide-4-3':          { width: 1440, height: 1080 },
  'linkedin-portrait':  { width: 1080, height: 1350 },
  'linkedin-square':    { width: 1200, height: 1200 },
}

export type DimensionsInput = keyof typeof SLIDE_DIMENSIONS | { width: number; height: number }

function resolveDimensions(d: DimensionsInput): { width: number; height: number } {
  if (typeof d === 'string') {
    const preset = SLIDE_DIMENSIONS[d]
    if (!preset) throw new GeneratorError('UNKNOWN_DIMENSIONS', `Unknown dimensions preset: ${d}. Available: ${Object.keys(SLIDE_DIMENSIONS).join(', ')}`)
    return preset
  }
  return d
}

// ─── Markdown deck parser (lifted from presentation.ts) ────────────────────

const md = new MarkdownIt({ html: true, typographer: true })

interface ParsedFragment {
  type: string
  bg: string
  notes: string
  raw: string
  /** Arbitrary `<!-- @key: value -->` directives. Per-type renderers read what they need. */
  meta: Record<string, string>
}

interface RenderedFragment {
  type: string
  bg: string
  html: string
  /** Per-slide chrome directive ('none' to suppress slide-mark + slide-num). */
  chrome?: string
}

/**
 * Soft-fail diagnostic surfaced in `SlidesResult.warnings`. Non-blocking — the
 * deck always renders, but the agent (or human) sees what needed cleanup.
 *
 * Established types:
 *   - `title_misuse`        — `@type: title` used after slide 1; downgraded to section
 *   - `overflow`            — slide content exceeded the viewport height
 *   - `html_inline_style`   — `@type: html` block used inline style for color/font/size
 *   - `html_hardcoded_color`— hex color outside a token reference
 *   - `html_low_contrast`   — known bad token pick (e.g. `--color-warm-gray-300` on cream)
 *   - `html_hardcoded_font` — font-family literal like 'Inter' / 'Space Grotesk'
 *   - `html_redundant_tokens` — `{{ TOKENS_CSS }}` re-injected inside an html fragment
 */
export interface RenderWarning {
  type: string
  slideIndex: number
  message: string
}

/** Default author byline on title slides when no `<!-- @author: -->` directive is present. */
const DEFAULT_AUTHOR = 'Tommi Enenkel · Escape Velocity Consulting'

/** Marker used by publish_artifact to locate the title slide's QR slot and inject the baked-in image. */
const QR_PLACEHOLDER_MARKER = 'ESCAPE_VELOCITY_QR_PLACEHOLDER'

export const TITLE_QR_PLACEHOLDER = QR_PLACEHOLDER_MARKER

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function renderMarkdown(text: string): string { return md.render(text) }

export function parseDeckMarkdown(source: string): { fragments: ParsedFragment[]; title: string } {
  const blocks = source.split(/^===\s*$/m).map((b) => b.trim()).filter(Boolean)
  const fragments: ParsedFragment[] = []
  let title = ''

  // Hyphenated keys like `qr-image` need to survive the regex; accept [\w-].
  const DIRECTIVE_RE = /^\s*<!--\s*@([\w-]+)\s*:\s*(.*?)\s*-->\s*$/

  for (const block of blocks) {
    const f: ParsedFragment = { type: 'content', bg: 'cream', notes: '', raw: '', meta: {} }
    const lines = block.split(/\r?\n/)
    const body: string[] = []
    for (const line of lines) {
      const m = line.match(DIRECTIVE_RE)
      if (m) {
        const key = m[1].toLowerCase()
        const val = m[2]
        if (key === 'type') f.type = val
        else if (key === 'bg') f.bg = val
        else if (key === 'notes') f.notes = val
        else f.meta[key] = val
        continue
      }
      body.push(line)
    }
    f.raw = body.join('\n').trim()
    if (!title) {
      // Accept either H1 or H2 for the deck-title heuristic — agents sometimes
      // use H2 for chapter slides and put the actual H1 later.
      const h = f.raw.match(/^#{1,2}\s+(.+)$/m)
      if (h) title = h[1].trim()
    }
    fragments.push(f)
  }
  return { fragments, title }
}

function renderTitleFragment(raw: string, meta: Record<string, string>): string {
  // Accepts either `# Title` or `## Title` as the headline. Lines starting with
  // `> ` become the eyebrow. Remaining non-empty lines become the subtitle.
  // `**accent**` inside the h1 renders as a terracotta-highlighted span.
  const lines = raw.split('\n').filter((l) => l.trim())
  let eyebrow = '', h1 = '', subtitle = ''
  for (const line of lines) {
    const hMatch = line.match(/^#{1,2}\s+(.+)$/)
    if (hMatch && !h1) { h1 = hMatch[1].trim(); continue }
    if (line.startsWith('> ')) { eyebrow = line.slice(2).trim(); continue }
    if (h1) subtitle += (subtitle ? '\n' : '') + line
  }

  const author = meta.author ?? DEFAULT_AUTHOR
  const date = meta.date ?? ''

  // Author dedup: if the user already wrote "Escape Velocity Consulting" or
  // the author's name into the subtitle, don't repeat it in the auto byline.
  // This catches the v4-deck mistake of "Tommi Enenkel, Escape Velocity
  // Consulting" appearing both in the markdown body AND in the auto byline.
  const authorTokens = author.split(/[·\s,]+/).filter((t) => t.length >= 4)
  const subtitleStripped = subtitle.split('\n')
    .filter((l) => {
      const low = l.toLowerCase()
      return !authorTokens.some((t) => low.includes(t.toLowerCase()))
    })
    .join('\n')
    .trim()

  const headlineHtml = h1 ? md.renderInline(h1) : ''
  const subHtml = subtitleStripped ? md.renderInline(subtitleStripped) : ''

  const byline = date ? `${author} · ${date}` : author

  const qrMode = (meta.qr ?? '').toLowerCase()
  const qrImage = meta['qr-image']
  const qrCaption = meta['qr-caption'] ?? 'Get the slides!'

  // Render-time QR options:
  //   <!-- @qr: none -->         → suppress the slot entirely
  //   <!-- @qr-image: <url> -->  → static image in the slot (e.g. project mark)
  //   <!-- @qr: <url> -->        → bake QR pointing to this URL right now
  //   (default)                  → emit placeholder; publish_artifact fills it
  let qrSlot = ''
  const wrapQr = (inner: string) => `
    <div class="title-qr-slot">
      ${inner}
      <div class="title-qr-caption">${escapeHtml(qrCaption)}</div>
    </div>
  `
  if (qrImage) {
    qrSlot = wrapQr(`<img src="${escapeHtml(qrImage)}" alt="" class="title-qr-image">`)
  } else if (qrMode === 'none') {
    qrSlot = ''
  } else if (qrMode && qrMode !== 'auto') {
    qrSlot = wrapQr(`<!-- ${QR_PLACEHOLDER_MARKER} -->`)
  } else {
    qrSlot = wrapQr(`<!-- ${QR_PLACEHOLDER_MARKER} -->`)
  }

  return `
    <div class="title-chrome">
      <div class="title-logo">Escape <span>Velocity</span></div>
    </div>
    <div class="title-body">
      ${eyebrow ? `<div class="eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
      <div class="accent-rule"></div>
      <h1>${headlineHtml}</h1>
      ${subHtml ? `<div class="subtitle">${subHtml}</div>` : ''}
    </div>
    ${qrSlot}
    <div class="title-author">${escapeHtml(byline)}</div>
  `
}

function renderSectionFragment(raw: string): string {
  // Accept both H1 (`# Title`) and H2 (`## Title`) — the agent commonly uses H2
  // for chapter slides since they often sit between H1 content slides.
  const lines = raw.split('\n').filter((l) => l.trim())
  let num = '', h1 = '', body = ''
  for (const line of lines) {
    const m = line.match(/^#{1,2}\s+(.+)$/)
    if (m && !h1) { h1 = m[1].trim(); continue }
    if (line.startsWith('> ')) { num = line.slice(2).trim(); continue }
    if (h1 && line.trim()) body += (body ? '\n' : '') + line
  }
  const bodyHtml = body ? md.renderInline(body) : ''
  return `
    ${num ? `<div class="section-num">${escapeHtml(num)}</div>` : ''}
    <h1>${escapeHtml(h1)}</h1>
    ${bodyHtml ? `<div class="section-sub">${bodyHtml}</div>` : ''}
  `
}

function renderQuoteFragment(raw: string, meta: Record<string, string>): string {
  // Three ways to attribute a quote, in priority order:
  //   1. <!-- @source: ... -->  (explicit directive — most discoverable)
  //   2. — Source · Attribution  (em-dash / en-dash / hyphen prefix on its own line)
  //   3. plain non-blockquote line treated as fall-through source if nothing else matched
  const lines = raw.split('\n')
  const quoteLines: string[] = []
  let attribution = meta.source ?? ''
  const tail: string[] = []
  for (const line of lines) {
    if (line.startsWith('> ')) { quoteLines.push(line.slice(2)); continue }
    if (!line.trim()) continue
    if (!attribution) {
      const m = line.match(/^\s*[—–-]+\s*(.+)$/)
      if (m) { attribution = m[1].trim(); continue }
    }
    tail.push(line)
  }
  // Final fallback: any plain tail line gets treated as the source. This catches
  // the common agent mistake of writing the source on its own line without an
  // em-dash prefix (and without using @source: either).
  if (!attribution && tail.length > 0) {
    attribution = tail.join(' ').trim()
  } else if (attribution && tail.length > 0) {
    // Keep the tail content inside the quote if the source was already set.
    quoteLines.push(...tail)
  }
  const inner = md.renderInline(quoteLines.join(' ').trim())
  return `
    <blockquote>${inner}</blockquote>
    ${attribution ? `<div class="attribution">${escapeHtml(attribution)}</div>` : ''}
  `
}

function renderImageFragment(raw: string, mdDir: string): string {
  // Two supported shapes:
  //   1. Standard image: `![caption](url)`  → fullscreen image, optional caption.
  //      Caption is suppressed when the alt-text is empty (`![](url)`) so meme
  //      slides aren't forced to carry a label.
  //   2. Emoji / headline-only: a single `# 🥋` or `## Some Headline` line
  //      with no markdown image — renders as a giant centered glyph, no caption.
  const mImg = raw.match(/!\[([^\]]*)\]\(([^)]+)\)/)
  if (mImg) {
    const caption = mImg[1]
    const src = mImg[2]
    let resolvedSrc = src
    if (!/^(https?:|data:|file:|\/)/i.test(src)) {
      const abs = resolve(mdDir, decodeURI(src))
      if (existsSync(abs)) resolvedSrc = pathToFileURL(abs).href
    }
    return `
      <div class="img-wrap"><img src="${resolvedSrc}" alt="${escapeHtml(caption)}"></div>
      ${caption ? `<div class="caption">${escapeHtml(caption)}</div>` : ''}
    `
  }
  const mHead = raw.match(/^#{1,2}\s+(.+)$/m)
  if (mHead) {
    return `<div class="img-headline">${escapeHtml(mHead[1].trim())}</div>`
  }
  return `<div class="img-wrap"><p>Invalid image syntax</p></div>`
}

function renderTwoColFragment(raw: string): string {
  const lines = raw.split('\n')
  let h2 = ''
  const body: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('## ') && !h2) { h2 = lines[i].slice(3).trim(); continue }
    body.push(lines[i])
  }
  const bodyText = body.join('\n').trim()
  const parts = bodyText.split(/^\s*:::\s*$/m)
  const left = (parts[0] || '').trim()
  const right = (parts[1] || '').trim()
  return `
    ${h2 ? `<h2>${escapeHtml(h2)}</h2><div class="accent-rule"></div>` : ''}
    <div class="columns">
      <div class="col md">${renderMarkdown(left)}</div>
      <div class="col md">${renderMarkdown(right)}</div>
    </div>
  `
}

function renderContentFragment(raw: string): string {
  const lines = raw.split('\n')
  let h2 = ''
  const body: string[] = []
  for (const line of lines) {
    if (line.startsWith('## ') && !h2) { h2 = line.slice(3).trim(); continue }
    body.push(line)
  }
  return `
    ${h2 ? `<h2>${escapeHtml(h2)}</h2><div class="accent-rule"></div>` : ''}
    <div class="md">${renderMarkdown(body.join('\n').trim())}</div>
  `
}

// ─── Cards (auto-grid from a markdown bullet list) ─────────────────────────
//
// Bullets in the form `**Title** — body` become cards. Plain bullets get a
// title-less card. Grid columns are picked from item count:
//   1–3 items  → 3-col          4 items  → 2x2          5 items  → 3-col
//   6 items    → 3x2            7 items  → 4-col        8 items  → 4x2
function renderCardsFragment(raw: string): string {
  const lines = raw.split('\n')
  let h2 = ''
  const cards: { title: string; body: string }[] = []
  for (const line of lines) {
    if (line.startsWith('## ') && !h2) { h2 = line.slice(3).trim(); continue }
    const item = line.match(/^\s*[-*]\s+(.+)$/)
    if (!item) continue
    const text = item[1]
    const split = text.match(/^\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/) ?? text.match(/^\*\*(.+?)\*\*\s*(.*)$/)
    if (split) cards.push({ title: split[1].trim(), body: (split[2] ?? '').trim() })
    else cards.push({ title: '', body: text.trim() })
  }
  const n = cards.length
  const cols = n <= 3 ? n || 1 : n === 4 ? 2 : n <= 6 ? 3 : 4
  const cardsHtml = cards.map((c) => `
    <div class="ev-card">
      ${c.title ? `<div class="ev-card-title">${md.renderInline(c.title)}</div>` : ''}
      ${c.body ? `<div class="ev-card-body">${md.renderInline(c.body)}</div>` : ''}
    </div>
  `).join('')
  return `
    ${h2 ? `<h2>${escapeHtml(h2)}</h2><div class="accent-rule"></div>` : ''}
    <div class="cards-grid" data-cols="${cols}">${cardsHtml}</div>
  `
}

// ─── Big number (huge accent number + body copy) ───────────────────────────
function renderBigNumberFragment(raw: string): string {
  const lines = raw.split('\n')
  let eyebrow = '', number = ''
  const body: string[] = []
  for (const line of lines) {
    if (line.startsWith('> ') && !eyebrow) { eyebrow = line.slice(2).trim(); continue }
    const m = line.match(/^#{1,2}\s+(.+)$/)
    if (m && !number) { number = m[1].trim(); continue }
    body.push(line)
  }
  const bodyMd = renderMarkdown(body.join('\n').trim())
  return `
    ${eyebrow ? `<div class="eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
    <div class="big-number">${escapeHtml(number)}</div>
    ${bodyMd ? `<div class="big-number-body md">${bodyMd}</div>` : ''}
  `
}

// ─── Comparison (opinionated A vs B — muted left, terracotta-accented right) ─
//
// Same `:::` separator as `two-col`. The first H3 in each column is the lane
// label; everything else is body markdown.
function renderComparisonFragment(raw: string): string {
  const lines = raw.split('\n')
  let h2 = ''
  const body: string[] = []
  for (const line of lines) {
    if (line.startsWith('## ') && !h2) { h2 = line.slice(3).trim(); continue }
    body.push(line)
  }
  const bodyText = body.join('\n').trim()
  const parts = bodyText.split(/^\s*:::\s*$/m)
  const left = (parts[0] || '').trim()
  const right = (parts[1] || '').trim()
  return `
    ${h2 ? `<h2>${escapeHtml(h2)}</h2><div class="accent-rule"></div>` : ''}
    <div class="comparison">
      <div class="comparison-col comparison-muted md">${renderMarkdown(left)}</div>
      <div class="comparison-col comparison-accent md">${renderMarkdown(right)}</div>
    </div>
  `
}

// ─── HTML passthrough with leading heading extraction + canvas auto-wrap ──
//
// Markdown is NOT parsed inside `@type: html` blocks. To let authors mix a
// proper styled heading with their custom HTML, we peel a single leading
// `## Title` (or `# Title`) line off the top and render it with `.ev-h2` +
// `.ev-rule` above the body.
//
// New in this round (v4 feedback): the body is auto-wrapped in
// `<div class="ev-canvas">…</div>` UNLESS the author already opens with one.
// `.ev-canvas` owns the standard 64–80px padding + body font + body color,
// so the agent no longer needs to ship its own `.wrap { padding: … }`
// boilerplate on every slide. The body is also fed through `lintHtmlFragment`
// to surface inline-style sins on the warnings channel.
function renderHtmlFragment(raw: string, ctx: { slideIndex: number; warnings: RenderWarning[] }): string {
  const lines = raw.split('\n')
  let heading = ''
  let startIdx = 0
  // Skip leading blank lines.
  while (startIdx < lines.length && !lines[startIdx].trim()) startIdx++
  if (startIdx < lines.length) {
    const m = lines[startIdx].match(/^#{1,2}\s+(.+)$/)
    if (m) {
      heading = m[1].trim()
      startIdx++
    }
  }
  const body = lines.slice(startIdx).join('\n').trim()

  // Lint the original body (pre-wrap). Authors see warnings for their
  // markup, not for the canvas we add around it.
  for (const w of lintHtmlFragment(body, ctx.slideIndex)) {
    ctx.warnings.push(w)
  }

  // Auto-wrap in .ev-canvas unless the author already opened with one.
  const alreadyCanvas = /^\s*<div[^>]*class="[^"]*\bev-canvas\b/.test(body)
  const wrappedBody = alreadyCanvas ? body : `<div class="ev-canvas">${body}</div>`

  return `
    ${heading ? `<h2 class="ev-h2">${escapeHtml(heading)}<span class="ev-rule"></span></h2>` : ''}
    ${wrappedBody}
  `
}

function renderFragment(
  f: ParsedFragment,
  mdDir: string,
  ctx: { slideIndex: number; warnings: RenderWarning[] },
): RenderedFragment {
  const html = (() => {
    switch (f.type) {
      case 'title':       return renderTitleFragment(f.raw, f.meta)
      case 'section':     return renderSectionFragment(f.raw)
      case 'quote':       return renderQuoteFragment(f.raw, f.meta)
      case 'image':       return renderImageFragment(f.raw, mdDir)
      case 'two-col':     return renderTwoColFragment(f.raw)
      case 'cards':       return renderCardsFragment(f.raw)
      case 'big-number':  return renderBigNumberFragment(f.raw)
      case 'comparison':  return renderComparisonFragment(f.raw)
      case 'html':        return renderHtmlFragment(f.raw, ctx)
      // ctx is threaded so renderHtmlFragment can push lint warnings later;
      // unused by other renderers today.
      case 'content':
      default:            return renderContentFragment(f.raw)
    }
  })()
  return { type: f.type, bg: f.bg, html, chrome: f.meta.chrome }
}

// ─── Public types ──────────────────────────────────────────────────────────

export interface SlidePage {
  /** Path under brand/ to a full-page HTML template (e.g. `templates/carousel/title.html`). */
  template?: string
  /** Raw HTML for this page (alternative to `template`). */
  html?: string
  /** Nunjucks variables. FONTS_URI, TOKENS_CSS, WIDTH, HEIGHT are auto-injected. */
  vars?: Record<string, string>
}

export interface SlidesInput {
  /** Markdown deck source with `===` separators. Mutually exclusive with `pages`. */
  markdown?: string
  /** Directory used to resolve relative refs (image paths) in the markdown. Defaults to the brand root. */
  markdownDir?: string
  /** Explicit pages — full-HTML templates or raw HTML. Mutually exclusive with `markdown`. */
  pages?: SlidePage[]
  /** Output dimensions: preset name (e.g. 'linkedin-portrait', 'slide-16-9') or {width, height}. */
  dimensions: DimensionsInput
  /** Which outputs to produce. */
  outputs: { viewer?: boolean; pdf?: boolean; pngs?: boolean }
  /** Optional deck title (used in viewer + as filename stem default). */
  title?: string
  /** Theme name for the viewer / printable PDF (passed to presentation.html). Default 'cream'. */
  theme?: string
}

export interface SlidesResult {
  /** Self-contained viewer HTML (only when outputs.viewer was true AND mode is markdown). */
  viewer?: { html: string; mode: 'standalone' | 'bundle'; bundleDir?: string }
  pdf?: Buffer
  pngs: Buffer[]
  /** Thumbnail PNGs (640×proportional). Parallel array with pngs. Always generated alongside pngs. */
  thumbs: Buffer[]
  slideCount: number
  width: number
  height: number
  /**
   * Soft-fail diagnostics — title misuse, overflow, html-mode brand sins.
   * Always present (empty array when clean). Non-blocking: the deck is still
   * rendered; warnings are the agent's feedback loop.
   */
  warnings: RenderWarning[]
}

// ─── Main entry ────────────────────────────────────────────────────────────

/**
 * Render N slides → toggleable {viewer, pdf, pngs}.
 *
 * Two input modes:
 * - **markdown**: parsed into slide fragments (presentation-style). Supports viewer.
 * - **pages**:    explicit full-page HTML per slide (carousel-style). PDF is assembled via pdf-lib from PNGs.
 *
 * The caller is responsible for routing the result through OutputSink (local
 * mode: writes files to disk; remote mode: artifact store + signed URLs).
 */
export async function renderSlides(
  input: SlidesInput,
  paths: BrandPaths,
  pool: BrowserPool,
): Promise<SlidesResult> {
  const dims = resolveDimensions(input.dimensions)
  const wantViewer = !!input.outputs.viewer
  const wantPdf = !!input.outputs.pdf
  const wantPngs = !!input.outputs.pngs

  if (!wantViewer && !wantPdf && !wantPngs) {
    throw new GeneratorError('NO_OUTPUTS', 'renderSlides: outputs must include at least one of {viewer, pdf, pngs}')
  }

  // Detect mode
  const hasMarkdown = input.markdown !== undefined
  const hasPages = !!input.pages && input.pages.length > 0
  if (!hasMarkdown && !hasPages) {
    throw new GeneratorError('NO_INPUT', 'renderSlides: provide markdown or pages')
  }
  if (hasMarkdown && hasPages) {
    throw new GeneratorError('AMBIGUOUS_INPUT', 'renderSlides: provide either markdown or pages, not both')
  }

  if (hasMarkdown) {
    return renderFromMarkdown(input, paths, pool, dims, { wantViewer, wantPdf, wantPngs })
  }
  return renderFromPages(input, paths, pool, dims, { wantViewer, wantPdf, wantPngs })
}

// ─── Markdown mode (presentation-style) ────────────────────────────────────

async function renderFromMarkdown(
  input: SlidesInput,
  paths: BrandPaths,
  pool: BrowserPool,
  dims: { width: number; height: number },
  flags: { wantViewer: boolean; wantPdf: boolean; wantPngs: boolean },
): Promise<SlidesResult> {
  const mdDir = input.markdownDir ?? paths.brandDir
  const { fragments: parsed, title: parsedTitle } = parseDeckMarkdown(input.markdown!)
  const title = input.title || parsedTitle || 'deck'

  // Title slide is slide-1-only. Agents in the v4 deck (May-2026) reached for
  // `@type: title` for every chapter divider (Enablement, Strategie,
  // Werkzeuge, Tipp #1–#7, Bonus, closing) — 13 slides per deck — pulling in
  // the title chrome (logo + byline + QR slot + "Get the slides!" caption)
  // every time. Downgrade subsequent titles to section and warn so the agent
  // self-corrects on the next iteration.
  const warnings: RenderWarning[] = []
  let titleEmitted = false
  const renderedFragments = parsed.map((f, i) => {
    const slideIndex = i + 1
    let effective = f
    if (f.type === 'title') {
      if (titleEmitted) {
        warnings.push({
          type: 'title_misuse',
          slideIndex,
          message: `@type: title used on slide ${slideIndex} — downgraded to @type: section. Title chrome (logo, byline, QR) is reserved for slide 1. Use @type: section for chapter dividers.`,
        })
        effective = { ...f, type: 'section' }
      } else {
        titleEmitted = true
      }
    }
    return renderFragment(effective, mdDir, { slideIndex, warnings })
  })

  // Build viewer HTML (used for ALL three outputs in this mode)
  const tokensCss = loadTokensCss(paths, './fonts')
  const env = getTemplateEnv(paths.templatesDir)
  const viewerHtml = env.render('presentation.html', {
    TITLE: title,
    LANG: 'de',
    SLIDE_W: dims.width,
    SLIDE_H: dims.height,
    FONTS_URI: './fonts',
    TOKENS_CSS: tokensCss,
    SLIDES: renderedFragments,
  })

  // For viewer/pdf/pngs that need the viewer file accessible on disk (Playwright
  // navigates via file://, and the viewer expects fonts/ and components/ next to it),
  // stage the viewer in a temp dir.
  const stageDir = resolve(tmpdir(), `ev-slides-${Date.now()}-${randomBytes(4).toString('hex')}`)
  mkdirSync(stageDir, { recursive: true })
  try {
    const fontsDir = resolve(stageDir, 'fonts')
    const componentsDir = resolve(stageDir, 'components')
    mkdirSync(fontsDir, { recursive: true })
    mkdirSync(componentsDir, { recursive: true })
    if (existsSync(paths.fontsDir)) cpSync(paths.fontsDir, fontsDir, { recursive: true })
    if (existsSync(paths.componentsDir)) cpSync(paths.componentsDir, componentsDir, { recursive: true })

    const viewerPath = resolve(stageDir, 'index.html')
    writeFileSync(viewerPath, viewerHtml, 'utf-8')

    const result: SlidesResult = {
      pngs: [],
      thumbs: [],
      slideCount: renderedFragments.length,
      width: dims.width,
      height: dims.height,
      warnings,
    }

    if (flags.wantViewer) {
      // Bundle mode: the viewer HTML is in a directory alongside fonts/components.
      // Caller can either copy the whole stageDir somewhere (local mode) or
      // inline assets and ship a single HTML (remote mode — done by the MCP tool).
      result.viewer = { html: viewerHtml, mode: 'bundle', bundleDir: stageDir }
    }

    if (flags.wantPdf) {
      const { page, context } = await pool.getPage({ width: dims.width, height: dims.height })
      try {
        await page.goto(pathToFileURL(viewerPath).href + '?print=1', { waitUntil: 'networkidle' })
        await page.emulateMedia({ media: 'print' })
        const pdfBuffer = await page.pdf({
          width: `${dims.width}px`,
          height: `${dims.height}px`,
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
        })
        result.pdf = pdfBuffer
      } finally {
        await pool.release(context)
      }
    }

    if (flags.wantPngs) {
      const thumbW = 640
      const thumbH = Math.round(640 * dims.height / dims.width)
      const { page, context } = await pool.getPage({ width: dims.width, height: dims.height }, { deviceScaleFactor: 2 })
      try {
        for (let i = 0; i < renderedFragments.length; i++) {
          const slideIndex = i + 1
          await page.goto(pathToFileURL(viewerPath).href + `?slide=${slideIndex}`, { waitUntil: 'networkidle' })
          await page.addStyleTag({ content: '.hud,.hud-hint{display:none !important} body{background:transparent !important} .slide{box-shadow:none !important} .slide.is-active{transform:translate(-50%,-50%) scale(1) !important}' })
          await page.waitForTimeout(100)

          // Overflow check — content exceeding the slide viewport is the v4
          // bug behind slide 12 ("Operationalisierung") and slide 15 (long
          // meme headline). Non-blocking; surfaces as a warning so the agent
          // can split or shrink on the next iteration.
          try {
            const overflowed: boolean = await page.evaluate(() => {
              const active = document.querySelector('.slide.is-active')
              if (!active) return false
              const inner = active.querySelector('.slide-inner') ?? active
              return inner.scrollHeight > inner.clientHeight + 4 || inner.scrollWidth > inner.clientWidth + 4
            })
            if (overflowed) {
              warnings.push({
                type: 'overflow',
                slideIndex,
                message: `Slide ${slideIndex} content exceeds viewport — split into multiple slides, shorten, or move to @type: cards / @type: html with .ev-canvas.`,
              })
            }
          } catch { /* overflow detection is best-effort */ }

          const handle = await page.$('.slide.is-active')
          if (handle) {
            const buf = await handle.screenshot({ omitBackground: false })
            result.pngs.push(buf)
            const thumbBuf = await sharp(buf).resize(thumbW, thumbH).png().toBuffer()
            result.thumbs.push(thumbBuf)
          }
        }
      } finally {
        await pool.release(context)
      }
    }

    return result
  } finally {
    // Only clean up if viewer wasn't requested — viewer mode hands the bundleDir
    // back to the caller who's responsible for cleanup.
    if (!flags.wantViewer) {
      try {
        // Cleanup is best-effort
        const { rmSync } = await import('node:fs')
        rmSync(stageDir, { recursive: true, force: true })
      } catch { /* ignore */ }
    }
  }
}

// ─── Pages mode (carousel-style) ───────────────────────────────────────────

async function renderFromPages(
  input: SlidesInput,
  paths: BrandPaths,
  pool: BrowserPool,
  dims: { width: number; height: number },
  flags: { wantViewer: boolean; wantPdf: boolean; wantPngs: boolean },
): Promise<SlidesResult> {
  if (flags.wantViewer) {
    throw new GeneratorError('VIEWER_NOT_SUPPORTED', 'renderSlides: viewer output is only supported with markdown input, not pages')
  }

  const pages = input.pages!
  const pngs: Buffer[] = []
  for (const page of pages) {
    let html: string
    if (page.template) {
      const templatePath = resolve(paths.brandDir, page.template)
      if (!existsSync(templatePath)) {
        throw new GeneratorError('TEMPLATE_NOT_FOUND', `Template not found: ${templatePath}`)
      }
      const raw = readFileSync(templatePath, 'utf-8')
      const fontsUri = pathToFileURL(paths.fontsDir).href
      const tokensCss = loadTokensCss(paths, fontsUri)
      html = renderStringTemplate(dirname(templatePath), raw, {
        FONTS_URI: fontsUri,
        TOKENS_CSS: tokensCss,
        WIDTH: dims.width,
        HEIGHT: dims.height,
        ...(page.vars ?? {}),
      })
    } else if (page.html !== undefined) {
      html = page.html
    } else {
      throw new GeneratorError('PAGE_EMPTY', 'Each page must provide either `template` or `html`')
    }

    const pngBuffer = await renderHtmlToPng(
      { html, vars: { WIDTH: String(dims.width), HEIGHT: String(dims.height), ...(page.vars ?? {}) } },
      dims,
      paths,
      pool,
    )
    pngs.push(pngBuffer)
  }

  const thumbs: Buffer[] = []
  if (flags.wantPngs) {
    const thumbW = 640
    const thumbH = Math.round(640 * dims.height / dims.width)
    for (const buf of pngs) {
      thumbs.push(await sharp(buf).resize(thumbW, thumbH).png().toBuffer())
    }
  }

  const result: SlidesResult = {
    pngs: flags.wantPngs ? pngs : [],
    thumbs,
    slideCount: pages.length,
    width: dims.width,
    height: dims.height,
    warnings: [], // pages mode skips html-mode lint + title-misuse
  }

  if (flags.wantPdf) {
    const doc = await PDFDocument.create()
    for (const png of pngs) {
      const img = await doc.embedPng(png)
      const p = doc.addPage([dims.width, dims.height])
      p.drawImage(img, { x: 0, y: 0, width: dims.width, height: dims.height })
    }
    result.pdf = Buffer.from(await doc.save())
  }

  return result
}
