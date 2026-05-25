import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { BrowserPool } from '../src/core/browserPool.js'
import { resolveBrandPaths } from '../src/core/paths.js'
import { GeneratorError } from '../src/core/errors.js'
import { renderSlides, type DimensionsInput } from '../src/core/slides.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')

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

  const stem = basename(absInput, '.md')
  const outDir = values.output
    ? resolve(process.cwd(), values.output)
    : resolve(process.cwd(), stem)

  const dimensions: DimensionsInput = values.ratio === '4-3' ? 'slide-4-3' : 'slide-16-9'

  const paths = resolveBrandPaths(BRAND_DIR)
  const pool = new BrowserPool()

  try {
    const markdown = readFileSync(absInput, 'utf-8')
    const result = await renderSlides({
      markdown,
      markdownDir: dirname(absInput),
      dimensions,
      outputs: { viewer: true, pdf: !!values.pdf, pngs: !!values.png },
      title: values.title,
      theme: values.theme,
    }, paths, pool)

    if (!result.viewer) throw new GeneratorError('NO_VIEWER', 'renderSlides did not return a viewer bundle')

    // Copy the staged bundle (index.html + fonts/ + components/) into outDir.
    mkdirSync(outDir, { recursive: true })
    if (result.viewer.bundleDir) {
      cpSync(result.viewer.bundleDir, outDir, { recursive: true })
      try { rmSync(result.viewer.bundleDir, { recursive: true, force: true }) } catch {}
    } else {
      // Fallback if bundleDir is missing — just write index.html
      writeFileSync(resolve(outDir, 'index.html'), result.viewer.html, 'utf-8')
    }
    console.log(`Viewer: ${resolve(outDir, 'index.html')}`)

    if (result.pdf) {
      const pdfPath = resolve(outDir, `${stem}.pdf`)
      writeFileSync(pdfPath, result.pdf)
      console.log(`PDF: ${pdfPath}`)
    }

    if (result.pngs.length > 0) {
      const pngDir = resolve(outDir, 'slides')
      mkdirSync(pngDir, { recursive: true })
      for (let i = 0; i < result.pngs.length; i++) {
        const num = String(i + 1).padStart(2, '0')
        const pngPath = resolve(pngDir, `slide-${num}.png`)
        writeFileSync(pngPath, result.pngs[i])
        console.log(`PNG: ${pngPath}`)
      }
    }

    console.log(`Done: ${result.slideCount} slides, ratio ${values.ratio}`)
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
