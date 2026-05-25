import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { BrowserPool } from '../src/core/browserPool.js'
import { resolveBrandPaths } from '../src/core/paths.js'
import { IMAGE_PRESETS, renderHtmlToPng, renderSvgToPng } from '../src/core/image.js'
import { GeneratorError } from '../src/core/errors.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')

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
      var:    { type: 'string', multiple: true, short: 'v' },
    },
  })

  if (!values.input || !values.type || !values.output) {
    console.error('Usage: image.ts --input <file> --type <html|svg> -o <output.png> [--preset <name>] [--width <px>] [--height <px>]')
    process.exit(1)
  }

  const inputPath = resolve(process.cwd(), values.input)
  const outputPath = resolve(process.cwd(), values.output)

  let width: number
  let height: number
  if (values.preset) {
    const preset = IMAGE_PRESETS[values.preset]
    if (!preset) {
      console.error(`Unknown preset: ${values.preset}. Available: ${Object.keys(IMAGE_PRESETS).join(', ')}`)
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

  const vars: Record<string, string> = {}
  for (const v of (values.var ?? [])) {
    const eq = v.indexOf('=')
    if (eq === -1) { console.error(`Invalid --var: ${v} (expected KEY=VALUE)`); process.exit(1) }
    vars[v.slice(0, eq)] = v.slice(eq + 1)
  }

  const paths = resolveBrandPaths(BRAND_DIR)
  const pool = new BrowserPool()

  try {
    let buffer: Buffer
    if (values.type === 'svg') {
      buffer = await renderSvgToPng({ svgPath: inputPath }, { width, height })
    } else if (values.type === 'html') {
      buffer = await renderHtmlToPng({ htmlPath: inputPath, vars }, { width, height }, paths, pool)
    } else {
      console.error(`Unknown type: ${values.type}. Use "html" or "svg".`)
      process.exit(1)
    }
    writeFileSync(outputPath, buffer)
    console.log(`Done: ${outputPath}`)
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
