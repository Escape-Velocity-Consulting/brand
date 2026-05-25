import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { BrowserPool } from '../src/core/browserPool.js'
import { resolveBrandPaths } from '../src/core/paths.js'
import { renderHtmlToPng } from '../src/core/image.js'

/**
 * Verifies that a single BrowserPool launches Chromium exactly once across
 * multiple renders. Renders 3 PNGs sequentially and reports timings.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')

async function main() {
  const paths = resolveBrandPaths(BRAND_DIR)
  const pool = new BrowserPool()

  // Patch chromium.launch to count calls
  const playwright = await import('playwright')
  const origLaunch = playwright.chromium.launch.bind(playwright.chromium)
  let launchCount = 0
  ;(playwright.chromium as any).launch = async (...args: any[]) => {
    launchCount++
    console.log(`[launch #${launchCount}]`)
    return origLaunch(...args)
  }

  const html = `<!DOCTYPE html><html><body style="background:#1A1814;color:#F5F3F0;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:48px;margin:0;height:100vh"><div>{{ LABEL }}</div></body></html>`

  const start = Date.now()
  for (let i = 1; i <= 3; i++) {
    const t0 = Date.now()
    const buf = await renderHtmlToPng({ html, vars: { LABEL: `Slide ${i}` } }, { width: 800, height: 400 }, paths, pool)
    writeFileSync(resolve(tmpdir(), `pool-test-${i}.png`), buf)
    console.log(`  render #${i}: ${Date.now() - t0}ms`)
  }
  console.log(`Total: ${Date.now() - start}ms`)
  console.log(`Launches observed: ${launchCount} (expected: 1)`)

  await pool.close()

  if (launchCount !== 1) {
    console.error(`FAIL: expected 1 launch, got ${launchCount}`)
    process.exit(1)
  }
  console.log('PASS')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
