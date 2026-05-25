import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { BrowserPool } from '../src/core/browserPool.js'
import { resolveBrandPaths } from '../src/core/paths.js'
import { GeneratorError } from '../src/core/errors.js'
import { renderSlides, type SlidePage } from '../src/core/slides.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')

const NUMBERED_ITEM_TEMPLATE = 'templates/carousel/numbered-item.html'

interface CarouselSpec {
  format?: 'linkedin-portrait' | 'linkedin-square'
  slides: Array<{ template: string; vars?: Record<string, string> }>
}

/**
 * Pre-fill PROGRESS vars for numbered-item slides so the auto-progress counter
 * works (1 / N, 2 / N, ...). Renders as a no-op for any slide that already
 * specifies PROGRESS manually.
 */
function withProgress(slides: CarouselSpec['slides']): SlidePage[] {
  const total = slides.filter((s) => s.template.replace(/\\/g, '/').endsWith(NUMBERED_ITEM_TEMPLATE)).length
  let counter = 0
  return slides.map((slide) => {
    const vars: Record<string, string> = { ...(slide.vars ?? {}) }
    if (slide.template.replace(/\\/g, '/').endsWith(NUMBERED_ITEM_TEMPLATE)) {
      counter++
      if (vars.PROGRESS === undefined) vars.PROGRESS = `${counter} / ${total}`
    }
    return { template: slide.template, vars }
  })
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      spec:   { type: 'string' },
      output: { type: 'string', short: 'o' },
    },
  })

  if (!values.spec || !values.output) {
    console.error('Usage: carousel.ts --spec <spec.json> -o <output.pdf>')
    process.exit(1)
  }

  const specPath = resolve(process.cwd(), values.spec)
  const outputPath = resolve(process.cwd(), values.output)
  const spec: CarouselSpec = JSON.parse(readFileSync(specPath, 'utf-8'))

  const outDir = dirname(outputPath)
  const outBase = basename(outputPath, extname(outputPath))
  const sidecarDir = join(outDir, outBase)
  mkdirSync(sidecarDir, { recursive: true })

  const paths = resolveBrandPaths(BRAND_DIR)
  const pool = new BrowserPool()

  try {
    const pages = withProgress(spec.slides)
    const result = await renderSlides({
      pages,
      dimensions: spec.format ?? 'linkedin-portrait',
      outputs: { pdf: true, pngs: true },
    }, paths, pool)

    if (!result.pdf) throw new GeneratorError('NO_PDF', 'renderSlides did not return a PDF')
    writeFileSync(outputPath, result.pdf)

    for (let i = 0; i < result.pngs.length; i++) {
      const num = String(i + 1).padStart(2, '0')
      writeFileSync(join(sidecarDir, `slide-${num}.png`), result.pngs[i])
    }
    copyFileSync(specPath, join(sidecarDir, 'spec.json'))

    console.log(`\nDone: ${outputPath}`)
    console.log(`      ${result.pngs.length} PNGs + spec.json in ${sidecarDir}`)
  } catch (err) {
    if (err instanceof GeneratorError) {
      console.error(`error [${err.code}]: ${err.message}`)
    } else {
      console.error(err)
    }
    process.exit(1)
  } finally {
    await pool.close()
  }
}

main()
