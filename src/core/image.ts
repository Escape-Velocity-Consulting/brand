import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import type { BrowserPool } from './browserPool.js'
import type { BrandPaths } from './paths.js'
import { renderStringTemplate } from './templates.js'

export const IMAGE_PRESETS: Record<string, { width: number; height: number }> = {
  'og':                 { width: 1200, height: 630 },
  'linkedin-banner':    { width: 1584, height: 396 },
  'linkedin-post':      { width: 1200, height: 1200 },
  'linkedin-landscape': { width: 1200, height: 627 },
  'linkedin-portrait':  { width: 1080, height: 1350 },
  'square':             { width: 1000, height: 1000 },
  'twitter-banner':     { width: 1500, height: 500 },
  'youtube-banner':     { width: 2560, height: 1440 },
  'instagram-post':     { width: 1080, height: 1080 },
  'instagram-story':    { width: 1080, height: 1920 },
  'a4':                 { width: 794, height: 1123 },
}

/**
 * SVG → PNG via sharp. No browser needed.
 */
export async function renderSvgToPng(input: { svgPath: string }, dims: { width: number; height: number }): Promise<Buffer> {
  return sharp(input.svgPath)
    .resize(dims.width, dims.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

/**
 * HTML → PNG via Playwright. The HTML may be a file path or an inline string.
 * Nunjucks variable substitution always runs (no-op if template has none).
 */
export async function renderHtmlToPng(
  input: { htmlPath?: string; html?: string; rootDir?: string; vars?: Record<string, string> },
  dims: { width: number; height: number },
  paths: BrandPaths,
  pool: BrowserPool,
): Promise<Buffer> {
  const fontsUri = pathToFileURL(paths.fontsDir).href

  let raw: string
  let rootDir: string
  if (input.htmlPath) {
    raw = readFileSync(input.htmlPath, 'utf-8')
    rootDir = dirname(input.htmlPath)
  } else if (input.html !== undefined) {
    raw = input.html
    rootDir = input.rootDir ?? paths.brandDir
  } else {
    throw new Error('renderHtmlToPng: provide htmlPath or html')
  }

  const html = renderStringTemplate(rootDir, raw, { FONTS_URI: fontsUri, ...(input.vars ?? {}) })

  const tmpPath = resolve(tmpdir(), `ev-img-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
  writeFileSync(tmpPath, html, 'utf-8')

  const { page, context } = await pool.getPage({ width: dims.width, height: dims.height })
  try {
    await page.goto(pathToFileURL(tmpPath).href, { waitUntil: 'networkidle' })
    const buffer = await page.screenshot({ type: 'png' })
    return buffer
  } finally {
    await pool.release(context)
    try { unlinkSync(tmpPath) } catch {}
  }
}
