/**
 * Build the canonical reference deck (previews/decks/reference-deck.md →
 * previews/decks/reference-deck/) — the worked example linked from SKILL.md
 * and shipped as the visual reference for the slide system.
 *
 * Doubles as an end-to-end smoke test of the QR bake flow:
 *
 *   renderSlides (core)  →  stage into a temp dir mimicking the published layout
 *                        →  bakeQrIntoPublishedDeck()
 *                        →  assertions on the patched files
 *                        →  copy out to previews/decks/reference-deck/
 *
 * Run with `npm run build:reference-deck`.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { BrowserPool } from '../src/core/browserPool.js'
import { resolveBrandPaths } from '../src/core/paths.js'
import { renderSlides } from '../src/core/slides.js'
import { bakeQrIntoPublishedDeck } from '../src/mcp/shared/qrInject.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')

function assert(cond: any, msg: string) {
  if (!cond) { console.error('FAIL: ' + msg); process.exit(1) }
  console.log('  ok  ' + msg)
}

async function main() {
  const paths = resolveBrandPaths(BRAND_DIR)
  const pool = new BrowserPool()

  const tag = randomBytes(4).toString('hex')
  const itemDir = resolve(tmpdir(), `bake-direct-${tag}`)
  mkdirSync(itemDir, { recursive: true })
  mkdirSync(join(itemDir, 'slides'), { recursive: true })

  try {
    console.log('\n=== render the smoke-test deck ===')
    const md = readFileSync(resolve(BRAND_DIR, 'previews/decks/reference-deck.md'), 'utf-8')
    const result = await renderSlides({
      markdown: md,
      markdownDir: resolve(BRAND_DIR, 'previews/decks'),
      dimensions: 'slide-16-9',
      outputs: { viewer: true, pdf: true, pngs: true },
      title: 'Reference Deck',
    }, paths, pool)

    console.log('  slides=' + result.slideCount + '  pngs=' + result.pngs.length + '  hasPdf=' + !!result.pdf + '  warnings=' + result.warnings.length)
    assert(result.slideCount === 17, 'rendered 17 slides')
    assert(result.pngs.length === 17, 'got 17 slide PNGs')
    assert(!!result.pdf, 'got PDF')
    assert(!!result.viewer, 'got viewer')
    // The canonical reference deck must lint clean — no inline-style spam,
    // no title misuse, no overflow. If this fails, somebody broke a recipe
    // in SKILL.md or shipped a layout regression.
    if (result.warnings.length > 0) {
      console.log('  warnings: ' + JSON.stringify(result.warnings, null, 2))
    }
    assert(result.warnings.length === 0, 'reference deck renders with zero warnings')

    // Stage files in itemDir as if publish had just run.
    writeFileSync(join(itemDir, 'index.html'), result.viewer!.html, 'utf-8')
    writeFileSync(join(itemDir, 'reference-deck.pdf'), result.pdf!)
    for (let i = 0; i < result.pngs.length; i++) {
      const n = String(i + 1).padStart(2, '0')
      writeFileSync(join(itemDir, 'slides', `slide-${n}.png`), result.pngs[i])
    }
    // Source markdown — committed alongside the rendered output so the
    // skill bundle can link reference-deck.md as a copy-from example.
    copyFileSync(resolve(BRAND_DIR, 'previews/decks/reference-deck.md'), join(itemDir, 'source.md'))

    const idxBefore = readFileSync(join(itemDir, 'index.html'), 'utf-8')
    assert(idxBefore.includes('ESCAPE_VELOCITY_QR_PLACEHOLDER'), 'pre-bake: title slide has the placeholder marker')

    const slide01BytesBefore = statSync(join(itemDir, 'slides/slide-01.png')).size
    const pdfBytesBefore = statSync(join(itemDir, 'reference-deck.pdf')).size
    const pdfBefore = await PDFDocument.load(readFileSync(join(itemDir, 'reference-deck.pdf')))
    const pageCountBefore = pdfBefore.getPageCount()
    console.log('  pre-bake PDF pages=' + pageCountBefore + '  slide01=' + slide01BytesBefore + 'B  pdf=' + pdfBytesBefore + 'B')

    console.log('\n=== bakeQrIntoPublishedDeck ===')
    const bake = await bakeQrIntoPublishedDeck({
      itemDir,
      detailUrl: 'https://mcp.escapevelocity.consulting/published/SmokeAbc123',
      pool,
      paths,
    })
    console.log('  baked=' + bake.baked + '  added=' + JSON.stringify(bake.added) + '  updated=' + JSON.stringify(bake.updated) + '  warnings=' + bake.warnings.length)
    if (bake.warnings.length > 0) {
      console.log('  bake warnings: ' + JSON.stringify(bake.warnings, null, 2))
    }
    assert(bake.baked, 'bake reported success')
    assert(bake.warnings.length === 0, 'bake completed without warnings')
    assert(bake.added.includes('qr-title.png'), 'qr-title.png reported as added')
    assert(bake.updated.includes('index.html'), 'index.html reported as updated')
    assert(bake.updated.includes('slides/slide-01.png'), 'slide-01.png reported as updated')
    assert(bake.updated.some((f) => f.endsWith('.pdf')), 'PDF reported as updated')

    console.log('\n=== verify on-disk artifacts ===')
    assert(existsSync(join(itemDir, 'qr-title.png')), 'qr-title.png file on disk')
    const qrSize = statSync(join(itemDir, 'qr-title.png')).size
    assert(qrSize > 2_000 && qrSize < 200_000, `qr-title.png reasonable size (${qrSize}B)`)

    const idxAfter = readFileSync(join(itemDir, 'index.html'), 'utf-8')
    assert(!idxAfter.includes('ESCAPE_VELOCITY_QR_PLACEHOLDER'), 'post-bake: placeholder marker is gone from HTML')
    assert(idxAfter.includes('<img src="qr-title.png"'), 'post-bake: HTML embeds <img src="qr-title.png">')

    const slide01BytesAfter = statSync(join(itemDir, 'slides/slide-01.png')).size
    console.log('  slide-01 before=' + slide01BytesBefore + 'B  after=' + slide01BytesAfter + 'B')
    assert(slide01BytesAfter !== slide01BytesBefore, 'slide-01.png re-rendered (bytes differ)')
    assert(slide01BytesAfter > 50_000, 'slide-01.png re-rendered with reasonable size')

    const pdfAfter = await PDFDocument.load(readFileSync(join(itemDir, 'reference-deck.pdf')))
    const pageCountAfter = pdfAfter.getPageCount()
    console.log('  PDF pages before=' + pageCountBefore + '  after=' + pageCountAfter)
    assert(pageCountAfter === pageCountBefore, 'PDF still has all pages after page-1 swap')
    const pdfBytesAfter = statSync(join(itemDir, 'reference-deck.pdf')).size
    assert(pdfBytesAfter !== pdfBytesBefore, 'PDF bytes changed (page 1 swapped)')

    console.log('\n=== copy artifacts to inspectable preview dir ===')
    const previewDir = resolve(BRAND_DIR, 'previews/decks/reference-deck')
    mkdirSync(previewDir, { recursive: true })
    mkdirSync(join(previewDir, 'slides'), { recursive: true })
    copyFileSync(join(itemDir, 'index.html'), join(previewDir, 'index.html'))
    copyFileSync(join(itemDir, 'qr-title.png'), join(previewDir, 'qr-title.png'))
    copyFileSync(join(itemDir, 'reference-deck.pdf'), join(previewDir, 'reference-deck.pdf'))
    for (let i = 0; i < 17; i++) {
      const n = String(i + 1).padStart(2, '0')
      const src = join(itemDir, 'slides', `slide-${n}.png`)
      if (existsSync(src)) copyFileSync(src, join(previewDir, 'slides', `slide-${n}.png`))
    }
    // Copy fonts + components so the HTML viewer is self-contained when
    // double-clicked / served from any static host.
    const { cpSync } = await import('node:fs')
    if (existsSync(paths.fontsDir)) cpSync(paths.fontsDir, join(previewDir, 'fonts'), { recursive: true })
    if (existsSync(paths.componentsDir)) cpSync(paths.componentsDir, join(previewDir, 'components'), { recursive: true })
    console.log('  written: ' + previewDir)

    console.log('\n========================================')
    console.log('ALL BAKE-FLOW CHECKS PASSED')
    console.log('Inspect: ' + previewDir)
    console.log('========================================')
  } finally {
    await pool.close()
  }
}

main().catch((e) => { console.error('SMOKE FAIL:', e); process.exit(1) })
