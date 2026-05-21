import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync, copyFileSync } from 'node:fs'
import { resolve, dirname, basename, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { tmpdir } from 'node:os'
import { PDFDocument } from 'pdf-lib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')
const FONTS_DIR = existsSync(resolve(BRAND_DIR, 'fonts'))
  ? resolve(BRAND_DIR, 'fonts')
  : resolve(BRAND_DIR, '..', 'website', 'fonts')

// Carousel formats: each maps to a page size used for both PNG render and PDF page.
const FORMATS: Record<string, { width: number; height: number }> = {
  'linkedin-portrait': { width: 1080, height: 1350 },
  'linkedin-square':   { width: 1200, height: 1200 },
}

interface SlideSpec {
  template: string
  vars?: Record<string, string>
}

interface CarouselSpec {
  format?: string
  slides: SlideSpec[]
}

const NUMBERED_ITEM_TEMPLATE = 'carousel/numbered-item.html'

function isNumberedItem(templatePath: string): boolean {
  return templatePath.replace(/\\/g, '/').endsWith(NUMBERED_ITEM_TEMPLATE)
}

async function renderSlideToPng(
  templatePath: string,
  vars: Record<string, string>,
  width: number,
  height: number,
  outPng: string,
  debugHtmlPath?: string
): Promise<void> {
  const fontsUri = pathToFileURL(FONTS_DIR).href
  const nunjucks = await import('nunjucks')
  const env = nunjucks.default.configure(dirname(templatePath), { autoescape: false })
  const raw = readFileSync(templatePath, 'utf-8')
  const html = env.renderString(raw, { FONTS_URI: fontsUri, WIDTH: width, HEIGHT: height, ...vars })

  const tmpPath = debugHtmlPath ?? resolve(tmpdir(), `ev-carousel-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
  writeFileSync(tmpPath, html, 'utf-8')

  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.setViewportSize({ width, height })
    await page.goto(pathToFileURL(tmpPath).href, { waitUntil: 'networkidle' })
    await page.screenshot({ path: outPng, type: 'png' })
    await browser.close()
  } finally {
    if (!debugHtmlPath) {
      try { unlinkSync(tmpPath) } catch {}
    }
  }
}

async function buildPdf(pngPaths: string[], width: number, height: number, outPdf: string): Promise<void> {
  const doc = await PDFDocument.create()
  for (const png of pngPaths) {
    const bytes = readFileSync(png)
    const img = await doc.embedPng(bytes)
    const page = doc.addPage([width, height])
    page.drawImage(img, { x: 0, y: 0, width, height })
  }
  writeFileSync(outPdf, await doc.save())
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      spec:   { type: 'string' },
      output: { type: 'string', short: 'o' },
      debug:  { type: 'boolean', default: false },
    },
  })

  if (!values.spec || !values.output) {
    console.error('Usage: carousel.ts --spec <spec.json> -o <output.pdf> [--debug]')
    process.exit(1)
  }

  const specPath = resolve(process.cwd(), values.spec)
  const outputPath = resolve(process.cwd(), values.output)

  const spec: CarouselSpec = JSON.parse(readFileSync(specPath, 'utf-8'))
  if (!Array.isArray(spec.slides) || spec.slides.length === 0) {
    console.error('Spec must include a non-empty "slides" array')
    process.exit(1)
  }

  const formatName = spec.format ?? 'linkedin-portrait'
  const format = FORMATS[formatName]
  if (!format) {
    console.error(`Unknown format: ${formatName}. Available: ${Object.keys(FORMATS).join(', ')}`)
    process.exit(1)
  }

  // Sidecar dir next to the PDF: <output_dir>/<output_basename>/
  const outDir = dirname(outputPath)
  const outBase = basename(outputPath, extname(outputPath))
  const sidecarDir = join(outDir, outBase)
  mkdirSync(sidecarDir, { recursive: true })

  // Auto-progress: count numbered-item slides
  const total = spec.slides.filter((s) => isNumberedItem(s.template)).length
  let counter = 0

  const pngPaths: string[] = []
  for (let i = 0; i < spec.slides.length; i++) {
    const slide = spec.slides[i]
    const vars: Record<string, string> = { ...(slide.vars ?? {}) }

    if (isNumberedItem(slide.template)) {
      counter++
      if (vars.PROGRESS === undefined) {
        vars.PROGRESS = `${counter} / ${total}`
      }
    }

    // Resolve template relative to brand dir if not absolute
    const templatePath = resolve(BRAND_DIR, slide.template)
    if (!existsSync(templatePath)) {
      console.error(`Template not found: ${templatePath}`)
      process.exit(1)
    }

    const slideNum = String(i + 1).padStart(2, '0')
    const pngPath = join(sidecarDir, `slide-${slideNum}.png`)
    const debugHtml = values.debug ? join(sidecarDir, `slide-${slideNum}.html`) : undefined

    console.log(`  [${i + 1}/${spec.slides.length}] ${basename(slide.template)} → slide-${slideNum}.png`)
    await renderSlideToPng(templatePath, vars, format.width, format.height, pngPath, debugHtml)
    pngPaths.push(pngPath)
  }

  await buildPdf(pngPaths, format.width, format.height, outputPath)
  copyFileSync(specPath, join(sidecarDir, 'spec.json'))

  console.log(`\nDone: ${outputPath}`)
  console.log(`      ${pngPaths.length} PNGs + spec.json in ${sidecarDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
