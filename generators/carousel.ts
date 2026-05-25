import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { BrowserPool } from '../src/core/browserPool.js'
import { resolveBrandPaths } from '../src/core/paths.js'
import { GeneratorError } from '../src/core/errors.js'
import { renderCarousel, type CarouselSpec } from '../src/core/carousel.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')

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

  const outDir = dirname(outputPath)
  const outBase = basename(outputPath, extname(outputPath))
  const sidecarDir = join(outDir, outBase)
  mkdirSync(sidecarDir, { recursive: true })

  const paths = resolveBrandPaths(BRAND_DIR)
  const pool = new BrowserPool()

  try {
    const result = await renderCarousel({
      spec,
      debug: !!values.debug,
      onProgress: (i, n, name) => console.log(`  [${i}/${n}] ${basename(name)} → slide-${String(i).padStart(2, '0')}.png`),
    }, paths, pool)

    for (const slide of result.slides) {
      const num = String(slide.index).padStart(2, '0')
      writeFileSync(join(sidecarDir, `slide-${num}.png`), slide.pngBuffer)
      if (slide.debugHtml) writeFileSync(join(sidecarDir, `slide-${num}.html`), slide.debugHtml, 'utf-8')
    }

    writeFileSync(outputPath, result.pdfBuffer)
    copyFileSync(specPath, join(sidecarDir, 'spec.json'))

    console.log(`\nDone: ${outputPath}`)
    console.log(`      ${result.slides.length} PNGs + spec.json in ${sidecarDir}`)
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
