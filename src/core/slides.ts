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
import type { BrowserPool } from './browserPool.js'
import { GeneratorError } from './errors.js'
import type { BrandPaths } from './paths.js'
import { renderHtmlToPng } from './render.js'
import { getTemplateEnv, renderStringTemplate } from './templates.js'
import { loadTokensCss } from './tokens.js'

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
}

interface RenderedFragment {
  type: string
  bg: string
  html: string
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function renderMarkdown(text: string): string { return md.render(text) }

export function parseDeckMarkdown(source: string): { fragments: ParsedFragment[]; title: string } {
  const blocks = source.split(/^===\s*$/m).map((b) => b.trim()).filter(Boolean)
  const fragments: ParsedFragment[] = []
  let title = ''

  for (const block of blocks) {
    const f: ParsedFragment = { type: 'content', bg: 'cream', notes: '', raw: '' }
    const lines = block.split(/\r?\n/)
    const body: string[] = []
    for (const line of lines) {
      const m = line.match(/^\s*<!--\s*@(\w+)\s*:\s*(.*?)\s*-->\s*$/)
      if (m) {
        const key = m[1].toLowerCase()
        const val = m[2]
        if (key === 'type') f.type = val
        else if (key === 'bg') f.bg = val
        else if (key === 'notes') f.notes = val
        continue
      }
      body.push(line)
    }
    f.raw = body.join('\n').trim()
    if (!title) {
      const h1 = f.raw.match(/^#\s+(.+)$/m)
      if (h1) title = h1[1].trim()
    }
    fragments.push(f)
  }
  return { fragments, title }
}

function renderTitleFragment(raw: string): string {
  const lines = raw.split('\n').filter((l) => l.trim())
  let eyebrow = '', h1 = '', subtitle = ''
  for (const line of lines) {
    if (line.startsWith('# ')) { h1 = line.slice(2).trim(); continue }
    if (line.startsWith('> ')) { eyebrow = line.slice(2).trim(); continue }
    if (!subtitle && h1) subtitle += (subtitle ? '\n' : '') + line
  }
  const subHtml = subtitle ? md.renderInline(subtitle) : ''
  return `
    ${eyebrow ? `<div class="eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
    <div class="accent-rule"></div>
    <h1>${escapeHtml(h1)}</h1>
    ${subHtml ? `<div class="subtitle">${subHtml}</div>` : ''}
  `
}

function renderSectionFragment(raw: string): string {
  const lines = raw.split('\n').filter((l) => l.trim())
  let num = '', h1 = ''
  for (const line of lines) {
    if (line.startsWith('# ')) { h1 = line.slice(2).trim(); continue }
    if (line.startsWith('> ')) { num = line.slice(2).trim(); continue }
  }
  return `
    ${num ? `<div class="section-num">${escapeHtml(num)}</div>` : ''}
    <h1>${escapeHtml(h1)}</h1>
  `
}

function renderQuoteFragment(raw: string): string {
  const lines = raw.split('\n')
  const quoteLines: string[] = []
  let attribution = ''
  for (const line of lines) {
    const m = line.match(/^\s*[—–-]+\s*(.+)$/)
    if (m && !line.trim().startsWith('>')) { attribution = m[1].trim(); continue }
    if (line.startsWith('> ')) quoteLines.push(line.slice(2))
    else if (line.trim()) quoteLines.push(line)
  }
  const inner = md.renderInline(quoteLines.join(' ').trim())
  return `
    <blockquote>${inner}</blockquote>
    ${attribution ? `<div class="attribution">${escapeHtml(attribution)}</div>` : ''}
  `
}

function renderImageFragment(raw: string, mdDir: string): string {
  const m = raw.match(/!\[([^\]]*)\]\(([^)]+)\)/)
  if (!m) return `<div class="img-wrap"><p>Invalid image syntax</p></div>`
  const caption = m[1]
  const src = m[2]
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

function renderFragment(f: ParsedFragment, mdDir: string): RenderedFragment {
  const html = (() => {
    switch (f.type) {
      case 'title':   return renderTitleFragment(f.raw)
      case 'section': return renderSectionFragment(f.raw)
      case 'quote':   return renderQuoteFragment(f.raw)
      case 'image':   return renderImageFragment(f.raw, mdDir)
      case 'two-col': return renderTwoColFragment(f.raw)
      case 'html':    return f.raw
      case 'content':
      default:        return renderContentFragment(f.raw)
    }
  })()
  return { type: f.type, bg: f.bg, html }
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
  slideCount: number
  width: number
  height: number
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
  const renderedFragments = parsed.map((f) => renderFragment(f, mdDir))

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
      slideCount: renderedFragments.length,
      width: dims.width,
      height: dims.height,
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
      const { page, context } = await pool.getPage({ width: dims.width, height: dims.height }, { deviceScaleFactor: 2 })
      try {
        for (let i = 0; i < renderedFragments.length; i++) {
          await page.goto(pathToFileURL(viewerPath).href + `?slide=${i + 1}`, { waitUntil: 'networkidle' })
          await page.addStyleTag({ content: '.hud,.hud-hint{display:none !important} body{background:transparent !important} .slide{box-shadow:none !important} .slide.is-active{transform:translate(-50%,-50%) scale(1) !important}' })
          await page.waitForTimeout(100)
          const handle = await page.$('.slide.is-active')
          if (handle) {
            const buf = await handle.screenshot({ omitBackground: false })
            result.pngs.push(buf)
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

  const result: SlidesResult = {
    pngs: flags.wantPngs ? pngs : [],
    slideCount: pages.length,
    width: dims.width,
    height: dims.height,
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
