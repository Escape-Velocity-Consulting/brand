import { existsSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { BrowserPool } from '../src/core/browserPool.js'
import { resolveBrandPaths } from '../src/core/paths.js'
import { GeneratorError } from '../src/core/errors.js'
import { renderPresentation } from '../src/core/presentation.js'

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

  const paths = resolveBrandPaths(BRAND_DIR)
  const pool = new BrowserPool()

  try {
    await renderPresentation({
      mdPath: absInput,
      outputDir: outDir,
      stem,
      ratio: (values.ratio ?? '16-9') as '16-9' | '4-3',
      theme: values.theme,
      title: values.title,
      pdf: !!values.pdf,
      png: !!values.png,
      debug: !!values.debug,
      log: (msg) => console.log(msg),
    }, paths, pool)
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
