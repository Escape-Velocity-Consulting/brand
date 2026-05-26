/**
 * Generic HTML → PNG / HTML → PDF rendering primitives.
 *
 * These are the workhorses that power every render path in the system:
 * - `renderHtmlToPng` — single PNG from raw HTML (used by image generators, social templates, carousel slides)
 * - `renderHtmlToPdf` — single (multi-page) PDF from raw HTML (used by documents, presentations, ad-hoc PDF tools)
 *
 * Both:
 * - Auto-inject `FONTS_URI` + `TOKENS_CSS` into Nunjucks vars before templating
 * - Write HTML to a temp file, navigate via `file://` URL, screenshot/pdf, clean up
 * - Are transport-agnostic (return Buffer; caller routes through OutputSink)
 *
 * Higher-level functions (`renderDocumentHtml` in document.ts, `renderSlides` in
 * slides.ts) compose these primitives with brand-specific glue (templates,
 * footers, slide viewers, etc.).
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import type { BrowserPool } from './browserPool.js'
import type { BrandPaths } from './paths.js'
import { renderStringTemplate } from './templates.js'
import { loadTokensCss } from './tokens.js'

// ─── Shared input shape ────────────────────────────────────────────────────

export interface HtmlInput {
  /** Inline HTML string. Required unless `htmlPath` is given. */
  html?: string
  /** Path to an HTML file on disk. Alternative to `html`. */
  htmlPath?: string
  /** Directory used as the Nunjucks file loader root (for `{% include %}`). Defaults to brandDir. */
  rootDir?: string
  /** Extra Nunjucks variables. `FONTS_URI` and `TOKENS_CSS` are auto-injected. */
  vars?: Record<string, string>
  /** Skip Nunjucks templating entirely. Use when HTML is already fully composed. */
  skipTemplating?: boolean
}

// ─── PDF options ───────────────────────────────────────────────────────────

export interface PdfOptions {
  /** Page format name OR custom width/height (px). Defaults to 'A4'. */
  format?: 'A4' | 'A3' | 'Letter' | 'Legal' | { width: number; height: number }
  /** Page margins. Defaults to 0 unless `format` is a paper size, in which case A4 doc defaults apply. */
  margin?: { top?: string; right?: string; bottom?: string; left?: string }
  /** Print backgrounds (colors / images). Default: true. */
  printBackground?: boolean
  /** Optional Playwright header HTML template (e.g. for page numbers). */
  headerTemplate?: string
  /** Optional Playwright footer HTML template. */
  footerTemplate?: string
  /** Landscape orientation. Default: false. */
  landscape?: boolean
}

// ─── Internals ─────────────────────────────────────────────────────────────

function resolveHtml(input: HtmlInput, paths: BrandPaths): { raw: string; rootDir: string } {
  if (input.htmlPath) {
    return {
      raw: readFileSync(input.htmlPath, 'utf-8'),
      rootDir: dirname(input.htmlPath),
    }
  }
  if (input.html !== undefined) {
    return {
      raw: input.html,
      rootDir: input.rootDir ?? paths.brandDir,
    }
  }
  throw new Error('HtmlInput: provide html or htmlPath')
}

function templateHtml(raw: string, rootDir: string, paths: BrandPaths, input: HtmlInput): string {
  if (input.skipTemplating) return raw
  const fontsUri = pathToFileURL(paths.fontsDir).href
  const tokensCss = loadTokensCss(paths, fontsUri)
  return renderStringTemplate(rootDir, raw, {
    FONTS_URI: fontsUri,
    TOKENS_CSS: tokensCss,
    ...(input.vars ?? {}),
  })
}

function writeTempHtml(html: string, hint: string): string {
  const tmpPath = resolve(tmpdir(), `ev-${hint}-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
  writeFileSync(tmpPath, html, 'utf-8')
  return tmpPath
}

// ─── HTML → PNG ────────────────────────────────────────────────────────────

/**
 * Render HTML to a PNG via Playwright. Variables in the HTML are filled via
 * Nunjucks before rendering (FONTS_URI + TOKENS_CSS are auto-injected).
 *
 * @param input  HTML source (string or file path) + optional vars
 * @param dims   Viewport dimensions for the screenshot
 * @param paths  Resolved brand paths (fonts, tokens, templates)
 * @param pool   Shared BrowserPool
 */
export async function renderHtmlToPng(
  input: HtmlInput,
  dims: { width: number; height: number; deviceScaleFactor?: number },
  paths: BrandPaths,
  pool: BrowserPool,
): Promise<Buffer> {
  const { raw, rootDir } = resolveHtml(input, paths)
  const html = templateHtml(raw, rootDir, paths, input)
  const tmpPath = writeTempHtml(html, 'img')

  const { page, context } = await pool.getPage(
    { width: dims.width, height: dims.height },
    dims.deviceScaleFactor ? { deviceScaleFactor: dims.deviceScaleFactor } : undefined,
  )
  try {
    await page.goto(pathToFileURL(tmpPath).href, { waitUntil: 'networkidle' })
    return await page.screenshot({ type: 'png' })
  } finally {
    await pool.release(context)
    try { unlinkSync(tmpPath) } catch {}
  }
}

// ─── HTML → PDF ────────────────────────────────────────────────────────────

/**
 * Render HTML to a PDF via Playwright. Variables in the HTML are filled via
 * Nunjucks before rendering (FONTS_URI + TOKENS_CSS are auto-injected unless
 * `skipTemplating: true`).
 *
 * Use the `format`, `margin`, `headerTemplate`, `footerTemplate` opts to
 * control the output. A custom `{width, height}` format lets you render
 * fixed-pixel-size pages (used by slide deck PDFs).
 *
 * @param input  HTML source (string or file path) + optional vars
 * @param opts   PDF page options
 * @param paths  Resolved brand paths
 * @param pool   Shared BrowserPool
 */
export async function renderHtmlToPdf(
  input: HtmlInput,
  opts: PdfOptions,
  paths: BrandPaths,
  pool: BrowserPool,
): Promise<Buffer> {
  const { raw, rootDir } = resolveHtml(input, paths)
  const html = templateHtml(raw, rootDir, paths, input)
  const tmpPath = writeTempHtml(html, 'pdf')

  const format = opts.format ?? 'A4'
  const isCustomSize = typeof format === 'object'

  const { page, context } = await pool.getPage(
    isCustomSize ? { width: format.width, height: format.height } : undefined,
  )
  try {
    await page.goto(pathToFileURL(tmpPath).href, { waitUntil: 'networkidle' })
    if (isCustomSize) {
      // Custom-size pages: emulate print so @media print rules apply
      await page.emulateMedia({ media: 'print' })
    }
    const hasFooter = !!opts.footerTemplate || !!opts.headerTemplate
    const pdfOpts: Parameters<typeof page.pdf>[0] = {
      printBackground: opts.printBackground ?? true,
      landscape: opts.landscape ?? false,
    }
    if (isCustomSize) {
      pdfOpts.width = `${format.width}px`
      pdfOpts.height = `${format.height}px`
    } else {
      pdfOpts.format = format
    }
    if (opts.margin) {
      pdfOpts.margin = {
        top: opts.margin.top ?? '0',
        right: opts.margin.right ?? '0',
        bottom: opts.margin.bottom ?? '0',
        left: opts.margin.left ?? '0',
      }
    } else if (isCustomSize) {
      pdfOpts.margin = { top: '0', right: '0', bottom: '0', left: '0' }
    }
    if (hasFooter) {
      pdfOpts.displayHeaderFooter = true
      pdfOpts.headerTemplate = opts.headerTemplate ?? '<div></div>'
      pdfOpts.footerTemplate = opts.footerTemplate ?? '<div></div>'
    }
    return await page.pdf(pdfOpts)
  } finally {
    await pool.release(context)
    try { unlinkSync(tmpPath) } catch {}
  }
}
