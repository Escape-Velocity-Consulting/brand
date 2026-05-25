import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import type { BrowserPool } from './browserPool.js'
import { GeneratorError } from './errors.js'
import type { BrandPaths } from './paths.js'
import { renderStringTemplate } from './templates.js'

export const CAROUSEL_FORMATS: Record<string, { width: number; height: number }> = {
  'linkedin-portrait': { width: 1080, height: 1350 },
  'linkedin-square':   { width: 1200, height: 1200 },
}

const NUMBERED_ITEM_TEMPLATE = 'carousel/numbered-item.html'

export function isNumberedItem(templatePath: string): boolean {
  return templatePath.replace(/\\/g, '/').endsWith(NUMBERED_ITEM_TEMPLATE)
}

export interface SlideSpec {
  template: string
  vars?: Record<string, string>
}

export interface CarouselSpec {
  format?: string
  slides: SlideSpec[]
}

export interface RenderedCarouselSlide {
  index: number  // 1-based
  templateName: string
  pngBuffer: Buffer
  debugHtml?: string
}

export interface CarouselResult {
  pdfBuffer: Buffer
  slides: RenderedCarouselSlide[]
  width: number
  height: number
}

async function renderSlideToPng(
  templatePath: string,
  vars: Record<string, string>,
  dims: { width: number; height: number },
  paths: BrandPaths,
  pool: BrowserPool,
): Promise<{ pngBuffer: Buffer; html: string }> {
  const fontsUri = pathToFileURL(paths.fontsDir).href
  const raw = readFileSync(templatePath, 'utf-8')
  const html = renderStringTemplate(dirname(templatePath), raw, {
    FONTS_URI: fontsUri,
    WIDTH: dims.width,
    HEIGHT: dims.height,
    ...vars,
  })

  const tmpPath = resolve(tmpdir(), `ev-carousel-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
  writeFileSync(tmpPath, html, 'utf-8')

  const { page, context } = await pool.getPage({ width: dims.width, height: dims.height })
  try {
    await page.goto(pathToFileURL(tmpPath).href, { waitUntil: 'networkidle' })
    const pngBuffer = await page.screenshot({ type: 'png' })
    return { pngBuffer, html }
  } finally {
    await pool.release(context)
    try { unlinkSync(tmpPath) } catch {}
  }
}

async function buildCarouselPdf(pngBuffers: Buffer[], dims: { width: number; height: number }): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (const png of pngBuffers) {
    const img = await doc.embedPng(png)
    const page = doc.addPage([dims.width, dims.height])
    page.drawImage(img, { x: 0, y: 0, width: dims.width, height: dims.height })
  }
  return Buffer.from(await doc.save())
}

/**
 * Render a carousel from a spec. Returns PDF + per-slide PNGs as buffers.
 * The caller is responsible for writing files to disk and creating sidecar dirs.
 *
 * @param input.spec     The carousel spec object.
 * @param input.debug    If true, includes html alongside each slide PNG (in debugHtml).
 * @param input.onProgress Optional callback per slide (for CLI progress logs).
 */
export async function renderCarousel(
  input: { spec: CarouselSpec; debug?: boolean; onProgress?: (i: number, n: number, templateName: string) => void },
  paths: BrandPaths,
  pool: BrowserPool,
): Promise<CarouselResult> {
  const spec = input.spec
  if (!Array.isArray(spec.slides) || spec.slides.length === 0) {
    throw new GeneratorError('CAROUSEL_EMPTY', 'Spec must include a non-empty "slides" array')
  }

  const formatName = spec.format ?? 'linkedin-portrait'
  const format = CAROUSEL_FORMATS[formatName]
  if (!format) {
    throw new GeneratorError('UNKNOWN_FORMAT', `Unknown format: ${formatName}. Available: ${Object.keys(CAROUSEL_FORMATS).join(', ')}`)
  }

  const total = spec.slides.filter((s) => isNumberedItem(s.template)).length
  let counter = 0

  const slides: RenderedCarouselSlide[] = []
  for (let i = 0; i < spec.slides.length; i++) {
    const slide = spec.slides[i]
    const vars: Record<string, string> = { ...(slide.vars ?? {}) }

    if (isNumberedItem(slide.template)) {
      counter++
      if (vars.PROGRESS === undefined) vars.PROGRESS = `${counter} / ${total}`
    }

    const templatePath = resolve(paths.brandDir, slide.template)
    if (!existsSync(templatePath)) {
      throw new GeneratorError('TEMPLATE_NOT_FOUND', `Template not found: ${templatePath}`)
    }

    input.onProgress?.(i + 1, spec.slides.length, slide.template)
    const { pngBuffer, html } = await renderSlideToPng(templatePath, vars, format, paths, pool)
    slides.push({
      index: i + 1,
      templateName: slide.template,
      pngBuffer,
      debugHtml: input.debug ? html : undefined,
    })
  }

  const pdfBuffer = await buildCarouselPdf(slides.map((s) => s.pngBuffer), format)
  return { pdfBuffer, slides, width: format.width, height: format.height }
}
