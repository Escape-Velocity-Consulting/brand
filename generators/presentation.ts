import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, cpSync, unlinkSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { tmpdir } from 'node:os'
import nunjucks from 'nunjucks'
import MarkdownIt from 'markdown-it'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')
const FONTS_DIR = existsSync(resolve(BRAND_DIR, 'fonts'))
  ? resolve(BRAND_DIR, 'fonts')
  : resolve(BRAND_DIR, '..', 'website', 'fonts')
const TEMPLATES_DIR = resolve(BRAND_DIR, 'templates')
const COMPONENTS_DIR = resolve(BRAND_DIR, 'components')
const TOKENS_CSS_PATH = resolve(BRAND_DIR, 'tokens.css')

const RATIOS: Record<string, { w: number; h: number }> = {
  '16-9': { w: 1920, h: 1080 },
  '4-3':  { w: 1440, h: 1080 },
}

interface ParsedSlide {
  type: string
  bg: string
  notes: string
  raw: string  // body content (post-directive)
}

interface RenderedSlide {
  type: string
  bg: string
  html: string
}

const md = new MarkdownIt({ html: true, typographer: true })

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

function renderMarkdown(text: string): string {
  return md.render(text)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function renderSlide(slide: ParsedSlide, mdDir: string): RenderedSlide {
  const html = (() => {
    switch (slide.type) {
      case 'title':   return renderTitle(slide.raw)
      case 'section': return renderSection(slide.raw)
      case 'quote':   return renderQuote(slide.raw)
      case 'image':   return renderImage(slide.raw, mdDir)
      case 'two-col': return renderTwoCol(slide.raw)
      case 'html':    return slide.raw  // passthrough
      case 'content':
      default:        return renderContent(slide.raw)
    }
  })()
  return { type: slide.type, bg: slide.bg, html }
}

function renderTitle(raw: string): string {
  const lines = raw.split('\n').filter((l) => l.trim())
  let eyebrow = ''
  let h1 = ''
  let subtitle = ''
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
  let num = ''
  let h1 = ''
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
  // Markdown blockquote(s); attribution = line starting with —
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
  // Expect: ![caption](path)
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
  // Heading (H2) + optional rule, then split body on ':::' for left/right
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

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      output: { type: 'string', short: 'o' },
      pdf:    { type: 'boolean', default: false },
      png:    { type: 'boolean', default: false },
      ratio:  { type: 'string', default: '16-9' },
      theme:  { type: 'string', default: 'cream' },
      title:  { type: 'string' },
      debug:  { type: 'boolean', default: false },
    },
    allowPositionals: true,
  })

  const inputPath = positionals[0]
  if (!inputPath) {
    console.error('Usage: presentation.ts <input.md> [--pdf] [--png] [--ratio 16-9|4-3] [--theme cream|black]')
    process.exit(1)
  }

  const absInput = resolve(process.cwd(), inputPath)
  if (!existsSync(absInput)) {
    console.error(`Input not found: ${absInput}`)
    process.exit(1)
  }

  const ratio = RATIOS[values.ratio ?? '16-9']
  if (!ratio) {
    console.error(`Unknown ratio: ${values.ratio}. Available: ${Object.keys(RATIOS).join(', ')}`)
    process.exit(1)
  }

  const source = readFileSync(absInput, 'utf-8')
  const { slides: parsed, title: parsedTitle } = parseDeck(source)
  const title = values.title || parsedTitle || basename(absInput, '.md')
  const mdDir = dirname(absInput)
  const slides = parsed.map((s) => renderSlide(s, mdDir))

  // Output path
  const stem = basename(absInput, '.md')
  const outDir = values.output
    ? resolve(process.cwd(), values.output)
    : resolve(process.cwd(), stem)
  mkdirSync(outDir, { recursive: true })

  // Copy components/ next to the output so radar.js loads via relative path
  const outComponentsDir = resolve(outDir, 'components')
  mkdirSync(outComponentsDir, { recursive: true })
  if (existsSync(COMPONENTS_DIR)) {
    cpSync(COMPONENTS_DIR, outComponentsDir, { recursive: true })
  }

  // Copy fonts next to output so the viewer is self-contained when served standalone
  const outFontsDir = resolve(outDir, 'fonts')
  mkdirSync(outFontsDir, { recursive: true })
  if (existsSync(FONTS_DIR)) {
    cpSync(FONTS_DIR, outFontsDir, { recursive: true })
  }

  // Load tokens.css — single source of truth for color/font CSS vars.
  // Generated from tokens.ts via `npm run build:tokens`. Fail loudly if missing.
  if (!existsSync(TOKENS_CSS_PATH)) {
    console.error(`tokens.css not found at ${TOKENS_CSS_PATH}. Run: npm run build:tokens`)
    process.exit(1)
  }
  const tokensCss = readFileSync(TOKENS_CSS_PATH, 'utf-8')

  // Render
  const env = nunjucks.configure(TEMPLATES_DIR, { autoescape: false, throwOnUndefined: false })
  // Use relative ./fonts so the HTML works whether opened via file:// or served
  const html = env.render('presentation.html', {
    TITLE: title,
    LANG: 'de',
    SLIDE_W: ratio.w,
    SLIDE_H: ratio.h,
    FONTS_URI: './fonts',
    TOKENS_CSS: tokensCss,
    SLIDES: slides,
  })

  const htmlPath = resolve(outDir, 'index.html')
  writeFileSync(htmlPath, html, 'utf-8')
  console.log(`Viewer: ${htmlPath}`)

  if (values.debug) {
    const debugPath = resolve(outDir, 'debug.html')
    writeFileSync(debugPath, html.replace(/<\/body>/, '<style>.slide{display:block !important;position:relative;top:0;left:0;transform:none !important;margin:20px auto;}</style></body>'), 'utf-8')
    console.log(`Debug: ${debugPath}`)
  }

  if (values.pdf || values.png) {
    const browser = await chromium.launch()
    try {
      if (values.pdf) {
        const pdfPath = resolve(outDir, `${stem}.pdf`)
        const page = await browser.newPage({ viewport: { width: ratio.w, height: ratio.h } })
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
        console.log(`PDF: ${pdfPath}`)
        await page.close()
      }

      if (values.png) {
        const pngDir = resolve(outDir, 'slides')
        mkdirSync(pngDir, { recursive: true })
        // 2x device pixel ratio → PNGs render at 3840×2160 for 16:9.
        // Crisp on 4K screens and good enough for print (~360 DPI on a 10" slide).
        // PDF + HTML viewer are vector-based and unaffected.
        const page = await browser.newPage({ viewport: { width: ratio.w, height: ratio.h }, deviceScaleFactor: 2 })
        for (let i = 0; i < slides.length; i++) {
          await page.goto(pathToFileURL(htmlPath).href + `?slide=${i + 1}`, { waitUntil: 'networkidle' })
          // Hide HUD for clean PNG
          await page.addStyleTag({ content: '.hud,.hud-hint{display:none !important} body{background:transparent !important} .slide{box-shadow:none !important} .slide.is-active{transform:translate(-50%,-50%) scale(1) !important}' })
          // Wait a frame for the scale recalc
          await page.waitForTimeout(100)
          const num = String(i + 1).padStart(2, '0')
          const pngPath = resolve(pngDir, `slide-${num}.png`)
          // Screenshot the active slide directly
          const handle = await page.$('.slide.is-active')
          if (handle) await handle.screenshot({ path: pngPath, omitBackground: false })
          console.log(`PNG: ${pngPath}`)
        }
        await page.close()
      }
    } finally {
      await browser.close()
    }
  }

  console.log(`Done: ${slides.length} slides, ratio ${values.ratio}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
