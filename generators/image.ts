import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { tmpdir } from 'node:os'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')
const FONTS_DIR = resolve(BRAND_DIR, '..', 'website', 'fonts')

const PRESETS: Record<string, { width: number; height: number }> = {
  'og':              { width: 1200, height: 630 },
  'linkedin-banner': { width: 1584, height: 396 },
  'linkedin-post':   { width: 1200, height: 1200 },
  'square':          { width: 1000, height: 1000 },
}

// --- SVG → PNG ---

async function svgToPng(input: string, output: string, width: number, height: number): Promise<void> {
  await sharp(input)
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(output)
}

// --- HTML → PNG ---

async function htmlToPng(input: string, output: string, width: number, height: number): Promise<void> {
  const fontsUri = pathToFileURL(FONTS_DIR).href

  // Always run Nunjucks rendering — no-op if template has no variables
  const nunjucks = await import('nunjucks')
  const env = nunjucks.default.configure(dirname(input), { autoescape: false })
  const raw = readFileSync(input, 'utf-8')
  const html = env.renderString(raw, { FONTS_URI: fontsUri })

  const tmpPath = resolve(tmpdir(), `ev-img-${Date.now()}.html`)
  writeFileSync(tmpPath, html, 'utf-8')

  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.setViewportSize({ width, height })
    await page.goto(pathToFileURL(tmpPath).href, { waitUntil: 'networkidle' })
    await page.screenshot({ path: output, type: 'png' })
    await browser.close()
  } finally {
    try { unlinkSync(tmpPath) } catch {}
  }
}

// --- CLI ---

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      input:  { type: 'string' },
      type:   { type: 'string' },
      output: { type: 'string', short: 'o' },
      preset: { type: 'string' },
      width:  { type: 'string' },
      height: { type: 'string' },
    },
  })

  if (!values.input || !values.type || !values.output) {
    console.error('Usage: image.ts --input <file> --type <html|svg> -o <output.png> [--preset <name>] [--width <px>] [--height <px>]')
    process.exit(1)
  }

  const inputPath = resolve(process.cwd(), values.input)
  const outputPath = resolve(process.cwd(), values.output)

  // Resolve dimensions
  let width: number
  let height: number

  if (values.preset) {
    const preset = PRESETS[values.preset]
    if (!preset) {
      console.error(`Unknown preset: ${values.preset}. Available: ${Object.keys(PRESETS).join(', ')}`)
      process.exit(1)
    }
    width = preset.width
    height = preset.height
  } else if (values.width && values.height) {
    width = parseInt(values.width, 10)
    height = parseInt(values.height, 10)
  } else {
    console.error('Provide either --preset or both --width and --height')
    process.exit(1)
  }

  if (values.type === 'svg') {
    await svgToPng(inputPath, outputPath, width, height)
  } else if (values.type === 'html') {
    await htmlToPng(inputPath, outputPath, width, height)
  } else {
    console.error(`Unknown type: ${values.type}. Use "html" or "svg".`)
    process.exit(1)
  }

  console.log(`Done: ${outputPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
