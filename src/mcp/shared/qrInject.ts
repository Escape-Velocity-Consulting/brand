/**
 * QR code generator for the publication detail-page link baked onto a title
 * slide during `publish_artifact`.
 *
 * Output: a clean square PNG of the QR matrix (warm-black modules on a cream
 * quiet-zone). The slide template owns the "Get the slides!" caption styling
 * — this module ships pixels, not labels.
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import QRCode from 'qrcode'
import type { BrowserPool } from '../../core/browserPool.js'
import type { BrandPaths } from '../../core/paths.js'

// Brand colors — duplicated as literals here rather than imported from tokens
// because they're flowing into a raster (not a CSS-var context).
const CREAM = '#F9F7F4'
const WARM_BLACK = '#1E1C1A'

export interface QrOptions {
  /** Total PNG side length (square). Default 800. */
  size?: number
}

/** Strip protocol + trailing slash for the human-readable label. */
export function printableUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

/**
 * Render a clean square QR code PNG for the given URL. The image ships with
 * its own cream quiet-zone margin — callers do NOT need to add a border or
 * tinted background container. Pair with a CSS-styled caption ("Get the
 * slides!") in the slide template.
 */
export async function generateQrPng(url: string, opts: QrOptions = {}): Promise<Buffer> {
  const size = opts.size ?? 800
  const qrPng = await QRCode.toBuffer(url, {
    type: 'png',
    width: size,
    margin: 2,
    color: { dark: WARM_BLACK, light: CREAM },
  })
  return qrPng
}

/**
 * Marker emitted by the title slide at render time. Must match TITLE_QR_PLACEHOLDER
 * in slides.ts. NOTE: this regex is constructed fresh inside the bake function
 * rather than kept as a module constant — global regexes with `.test()` advance
 * `lastIndex` and the resulting state confused earlier versions of this code.
 * The current implementation uses `.replace()` once and inspects the return
 * value, side-stepping that footgun entirely.
 */
const QR_PLACEHOLDER_PATTERN = /<!--\s*ESCAPE_VELOCITY_QR_PLACEHOLDER\s*-->/g

const DEFAULT_SLIDE_W = 1920
const DEFAULT_SLIDE_H = 1080

/**
 * Find every `.slide--title` section's data-index in the rendered viewer HTML.
 * Used to identify which slides need re-rendering after the QR bake (those are
 * the slides that contain the baked-in QR image and would otherwise still
 * carry their stale pre-bake PNG / PDF page).
 */
function findTitleSlideIndices(html: string): number[] {
  const re = /<section[^>]*class="[^"]*slide--title[^"]*"[^>]*data-index="(\d+)"/g
  const out: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) out.push(parseInt(m[1], 10))
  return out
}

export interface BakeResult {
  baked: boolean
  reason?: string
  added: string[]
  updated: string[]
  /**
   * Soft failures collected during the bake. Empty when everything succeeded.
   * Examples: `pdf_swap_failed: ...`, `screenshot_failed: slide 5: ...`,
   * `qr_write_failed: ...`. Surfaced to the caller via `bakeStatus.warnings`
   * on the publish response so silent regressions like the May-2026
   * `lastIndex` bug can no longer hide.
   */
  warnings: string[]
}

/**
 * Bake a QR pointing to `detailUrl` into the title slide of a published deck.
 *
 * Steps (best-effort — any failure beyond the HTML patch is logged and skipped
 * rather than aborting the publish):
 *  1. Write `qr-title.png` next to `index.html`.
 *  2. Replace the title-slide placeholder marker in `index.html` with an <img>.
 *  3. Restage `index.html` + fonts + components in a temp dir so Playwright can
 *     load the deck with fonts resolving correctly.
 *  4. Screenshot the title slide → overwrite `slides/slide-01.png`.
 *  5. Use pdf-lib to swap page 1 of the existing PDF with the new title PNG;
 *     copy the remaining pages unchanged.
 */
export async function bakeQrIntoPublishedDeck(opts: {
  itemDir: string
  detailUrl: string
  pool: BrowserPool
  paths: BrandPaths
  slideWidth?: number
  slideHeight?: number
}): Promise<BakeResult> {
  const { itemDir, detailUrl, pool, paths } = opts
  const slideW = opts.slideWidth ?? DEFAULT_SLIDE_W
  const slideH = opts.slideHeight ?? DEFAULT_SLIDE_H
  const warnings: string[] = []

  const htmlPath = join(itemDir, 'index.html')
  if (!existsSync(htmlPath)) {
    return { baked: false, reason: 'no_index_html', added: [], updated: [], warnings }
  }
  const originalHtml = readFileSync(htmlPath, 'utf-8')

  // 1+2. Single-pass replace: build the patched HTML and check whether it
  //   actually changed. Avoids the global-regex `lastIndex` footgun that
  //   bit the May-2026 publish of `VAXBoXUg4Q` — `.test()` advances
  //   `lastIndex`, and any code path that then called `.replace()` on the
  //   same regex instance could skip matches.
  const QR_IMG_TAG = '<img src="qr-title.png" alt="" class="title-qr-image">'
  const patchedHtml = originalHtml.replace(new RegExp(QR_PLACEHOLDER_PATTERN.source, 'g'), QR_IMG_TAG)
  if (patchedHtml === originalHtml) {
    return { baked: false, reason: 'no_qr_placeholder', added: [], updated: [], warnings }
  }

  // QR PNG first (must exist before the HTML write — viewers that race the
  // file system would otherwise serve a broken <img>).
  try {
    const qrPng = await generateQrPng(detailUrl)
    writeFileSync(join(itemDir, 'qr-title.png'), qrPng)
  } catch (err) {
    return {
      baked: false,
      reason: 'qr_generate_failed',
      added: [],
      updated: [],
      warnings: [`qr_generate_failed: ${err instanceof Error ? err.message : String(err)}`],
    }
  }
  writeFileSync(htmlPath, patchedHtml)

  const added = ['qr-title.png']
  const updated = ['index.html']

  // 3. Restage the deck so Playwright can navigate to it with fonts +
  // components + the QR image all resolved relative to index.html.
  const stageDir = mkdtempSync(join(tmpdir(), 'qr-bake-'))
  let titleIndices: number[] = []
  const slidePngs = new Map<number, Buffer>()
  try {
    copyFileSync(htmlPath, join(stageDir, 'index.html'))
    copyFileSync(join(itemDir, 'qr-title.png'), join(stageDir, 'qr-title.png'))
    if (existsSync(paths.fontsDir)) {
      cpSync(paths.fontsDir, join(stageDir, 'fonts'), { recursive: true })
    }
    if (existsSync(paths.componentsDir)) {
      cpSync(paths.componentsDir, join(stageDir, 'components'), { recursive: true })
    }

    // 4. Re-screenshot every title slide. The bake replaced placeholders on
    // ALL title slides (closing slides typically also carry a QR), so a
    // single slide-01 re-render is insufficient — the closing slide's PNG
    // and PDF page would still be stale.
    titleIndices = findTitleSlideIndices(patchedHtml)
    const { page, context } = await pool.getPage({ width: slideW, height: slideH }, { deviceScaleFactor: 2 })
    try {
      for (const idx of titleIndices) {
        try {
          const url = pathToFileURL(join(stageDir, 'index.html')).href + `?slide=${idx}`
          await page.goto(url, { waitUntil: 'networkidle' })
          await page.addStyleTag({ content: '.hud,.hud-hint{display:none !important} body{background:transparent !important} .slide{box-shadow:none !important} .slide.is-active{transform:translate(-50%,-50%) scale(1) !important}' })
          await page.waitForTimeout(150)
          const handle = await page.$('.slide.is-active')
          if (!handle) {
            warnings.push(`screenshot_failed: slide ${idx}: no .slide.is-active element`)
            continue
          }
          const slidePng = await handle.screenshot({ omitBackground: false })
          slidePngs.set(idx, slidePng)

          const num = String(idx).padStart(2, '0')
          const slidePath = join(itemDir, 'slides', `slide-${num}.png`)
          if (existsSync(dirname(slidePath))) {
            writeFileSync(slidePath, slidePng)
            updated.push(`slides/slide-${num}.png`)
          }
        } catch (err) {
          // Per-slide isolation: one bad title slide can't take out the rest.
          // The HTML viewer already has the new <img> from step 1; the worst
          // outcome is a stale PNG/PDF page for this one slide.
          warnings.push(`screenshot_failed: slide ${idx}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    } finally {
      await pool.release(context)
    }

    // 5. PDF page swap. Replace each title-slide page in the existing PDF
    // with the freshly-rendered PNG; copy all other pages through unchanged.
    if (slidePngs.size > 0) {
      const pdfFile = readdirSync(itemDir).find((f) => f.toLowerCase().endsWith('.pdf'))
      if (pdfFile) {
        const pdfPath = join(itemDir, pdfFile)
        try {
          const oldPdfBytes = readFileSync(pdfPath)
          const oldDoc = await PDFDocument.load(oldPdfBytes)
          const newDoc = await PDFDocument.create()
          const pageCount = oldDoc.getPageCount()
          for (let i = 1; i <= pageCount; i++) {
            const swap = slidePngs.get(i)
            if (swap) {
              const img = await newDoc.embedPng(swap)
              const p = newDoc.addPage([slideW, slideH])
              p.drawImage(img, { x: 0, y: 0, width: slideW, height: slideH })
            } else {
              const [copied] = await newDoc.copyPages(oldDoc, [i - 1])
              newDoc.addPage(copied)
            }
          }
          writeFileSync(pdfPath, Buffer.from(await newDoc.save()))
          updated.push(pdfFile)
        } catch (err) {
          // PDF swap is best-effort — the HTML viewer already has the QR.
          // Still record what went wrong so the publish response surfaces it.
          warnings.push(`pdf_swap_failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
  } finally {
    try { rmSync(stageDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }

  return { baked: true, added, updated, warnings }
}

/** File metadata used to refresh meta.json after a bake. */
export interface FileSizeInfo {
  relativeName: string
  bytes: number
}

/** Walk the item directory and return current file sizes for known relative names. */
export function readFileSizes(itemDir: string, relativeNames: string[]): FileSizeInfo[] {
  const out: FileSizeInfo[] = []
  for (const name of relativeNames) {
    const p = join(itemDir, name)
    if (existsSync(p)) out.push({ relativeName: name, bytes: statSync(p).size })
  }
  return out
}
