import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import MarkdownIt from 'markdown-it'
import type { BrowserPool } from './browserPool.js'
import { GeneratorError } from './errors.js'
import type { BrandPaths } from './paths.js'
import { getTemplateEnv } from './templates.js'
import { loadTokensCss } from './tokens.js'

export const PRESENTATION_RATIOS: Record<string, { w: number; h: number }> = {
  '16-9': { w: 1920, h: 1080 },
  '4-3':  { w: 1440, h: 1080 },
}

interface ParsedSlide {
  type: string
  bg: string
  notes: string
  raw: string
}

interface RenderedSlide {
  type: string
  bg: string
  html: string
}

const md = new MarkdownIt({ html: true, typographer: true })

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function renderMarkdown(text: string): string { return md.render(text) }

function parseDeck(source: string): { slides: ParsedSlide[]; title: string } {
  const blocks = source.split(/^===\s*$/m).map((b) => b.trim()).filter(Boolean)
  const slides: ParsedSlide[] = []
  let title = ''

  for (const block of blocks) {
    const slide: ParsedSlide = { type: 'content', bg: 'cream', notes: '', raw: '' }
    const lines = block.split(/\r?\n/)
    const body: string[] = []
    for (const line of lines) {
      const m = line.match(/^\s*<!--\s*@(\w+)\s*:\s*(.*?)\s*-->\s*$/)
      if (m) {
        const key = m[1].toLowerCase()
        const val = m[2]
        if (key === 'type') slide.type = val
        else if (key === 'bg') slide.bg = val
        else if (key === 'notes') slide.notes = val
        continue
      }
      body.push(line)
    }
    slide.raw = body.join('\n').trim()
    if (!title) {
      const h1 = slide.raw.match(/^#\s+(.+)$/m)
      if (h1) title = h1[1].trim()
    }
    slides.push(slide)
  }
  return { slides, title }
}

function renderTitle(raw: string): string {
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

function renderSection(raw: string): string {
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

function renderQuote(raw: string): string {
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

function renderImage(raw: string, mdDir: string): string {
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

function renderTwoCol(raw: string): string {
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

function renderContent(raw: string): string {
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

function renderSlide(slide: ParsedSlide, mdDir: string): RenderedSlide {
  const html = (() => {
    switch (slide.type) {
      case 'title':   return renderTitle(slide.raw)
      case 'section': return renderSection(slide.raw)
      case 'quote':   return renderQuote(slide.raw)
      case 'image':   return renderImage(slide.raw, mdDir)
      case 'two-col': return renderTwoCol(slide.raw)
      case 'html':    return slide.raw
      case 'content':
      default:        return renderContent(slide.raw)
    }
  })()
  return { type: slide.type, bg: slide.bg, html }
}

export interface RenderPresentationInput {
  /** Markdown source string. Either source or mdPath must be provided. */
  source?: string
  /** Markdown source file path. Used to resolve relative image refs. */
  mdPath?: string
  /** Output directory (must be writeable; created if missing). */
  outputDir: string
  /** Default filename stem for PDF output. */
  stem?: string
  ratio?: '16-9' | '4-3'
  theme?: string
  title?: string
  /** Generate <stem>.pdf alongside index.html. */
  pdf?: boolean
  /** Generate slides/slide-NN.png alongside index.html. */
  png?: boolean
  debug?: boolean
  /** Logger for progress (defaults to no-op). */
  log?: (msg: string) => void
}

export interface PresentationResult {
  outputDir: string
  htmlPath: string
  pdfPath?: string
  pngPaths?: string[]
  slideCount: number
}

export async function renderPresentation(
  input: RenderPresentationInput,
  paths: BrandPaths,
  pool: BrowserPool,
): Promise<PresentationResult> {
  const log = input.log ?? (() => {})

  const ratioKey = input.ratio ?? '16-9'
  const ratio = PRESENTATION_RATIOS[ratioKey]
  if (!ratio) {
    throw new GeneratorError('UNKNOWN_RATIO', `Unknown ratio: ${ratioKey}. Available: ${Object.keys(PRESENTATION_RATIOS).join(', ')}`)
  }

  let source: string
  let mdDir: string
  let defaultStem: string
  if (input.source !== undefined) {
    source = input.source
    mdDir = input.outputDir
    defaultStem = input.stem ?? 'deck'
  } else if (input.mdPath) {
    if (!existsSync(input.mdPath)) {
      throw new GeneratorError('INPUT_NOT_FOUND', `Input not found: ${input.mdPath}`)
    }
    source = readFileSync(input.mdPath, 'utf-8')
    mdDir = dirname(input.mdPath)
    defaultStem = basename(input.mdPath, '.md')
  } else {
    throw new GeneratorError('NO_INPUT', 'renderPresentation: provide source or mdPath')
  }

  const { slides: parsed, title: parsedTitle } = parseDeck(source)
  const title = input.title || parsedTitle || defaultStem
  const stem = input.stem ?? defaultStem
  const renderedSlides = parsed.map((s) => renderSlide(s, mdDir))

  const outDir = input.outputDir
  mkdirSync(outDir, { recursive: true })

  const outComponentsDir = resolve(outDir, 'components')
  mkdirSync(outComponentsDir, { recursive: true })
  if (existsSync(paths.componentsDir)) {
    cpSync(paths.componentsDir, outComponentsDir, { recursive: true })
  }

  const outFontsDir = resolve(outDir, 'fonts')
  mkdirSync(outFontsDir, { recursive: true })
  if (existsSync(paths.fontsDir)) {
    cpSync(paths.fontsDir, outFontsDir, { recursive: true })
  }

  const tokensCss = loadTokensCss(paths)
  const env = getTemplateEnv(paths.templatesDir)
  const html = env.render('presentation.html', {
    TITLE: title,
    LANG: 'de',
    SLIDE_W: ratio.w,
    SLIDE_H: ratio.h,
    FONTS_URI: './fonts',
    TOKENS_CSS: tokensCss,
    SLIDES: renderedSlides,
  })

  const htmlPath = resolve(outDir, 'index.html')
  writeFileSync(htmlPath, html, 'utf-8')
  log(`Viewer: ${htmlPath}`)

  if (input.debug) {
    const debugPath = resolve(outDir, 'debug.html')
    writeFileSync(debugPath, html.replace(/<\/body>/, '<style>.slide{display:block !important;position:relative;top:0;left:0;transform:none !important;margin:20px auto;}</style></body>'), 'utf-8')
    log(`Debug: ${debugPath}`)
  }

  const result: PresentationResult = {
    outputDir: outDir,
    htmlPath,
    slideCount: renderedSlides.length,
  }

  if (input.pdf || input.png) {
    if (input.pdf) {
      const pdfPath = resolve(outDir, `${stem}.pdf`)
      const { page, context } = await pool.getPage({ width: ratio.w, height: ratio.h })
      try {
        await page.goto(pathToFileURL(htmlPath).href + '?print=1', { waitUntil: 'networkidle' })
        await page.emulateMedia({ media: 'print' })
        await page.pdf({
          path: pdfPath,
          width: `${ratio.w}px`,
          height: `${ratio.h}px`,
          printBackground: true,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          pageRanges: '',
        })
        result.pdfPath = pdfPath
        log(`PDF: ${pdfPath}`)
      } finally {
        await pool.release(context)
      }
    }

    if (input.png) {
      const pngDir = resolve(outDir, 'slides')
      mkdirSync(pngDir, { recursive: true })
      const pngPaths: string[] = []
      const { page, context } = await pool.getPage({ width: ratio.w, height: ratio.h }, { deviceScaleFactor: 2 })
      try {
        for (let i = 0; i < renderedSlides.length; i++) {
          await page.goto(pathToFileURL(htmlPath).href + `?slide=${i + 1}`, { waitUntil: 'networkidle' })
          await page.addStyleTag({ content: '.hud,.hud-hint{display:none !important} body{background:transparent !important} .slide{box-shadow:none !important} .slide.is-active{transform:translate(-50%,-50%) scale(1) !important}' })
          await page.waitForTimeout(100)
          const num = String(i + 1).padStart(2, '0')
          const pngPath = resolve(pngDir, `slide-${num}.png`)
          const handle = await page.$('.slide.is-active')
          if (handle) await handle.screenshot({ path: pngPath, omitBackground: false })
          pngPaths.push(pngPath)
          log(`PNG: ${pngPath}`)
        }
        result.pngPaths = pngPaths
      } finally {
        await pool.release(context)
      }
    }
  }

  log(`Done: ${renderedSlides.length} slides, ratio ${ratioKey}`)
  return result
}
