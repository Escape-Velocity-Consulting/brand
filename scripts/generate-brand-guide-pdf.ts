// Generate a single multi-page brand-guide PDF by printing each Brand Site
// page via Playwright and concatenating with pdf-lib.
//
// The Brand Site IS the brand guide — this just packages it for offline reading.
// Requires `npm run build:site` to have produced dist/site/ first.
//
// Usage: tsx scripts/generate-brand-guide-pdf.ts [-o output.pdf]

import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { resolve, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { chromium } from 'playwright'
import { PDFDocument } from 'pdf-lib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')
const DIST_SITE = resolve(BRAND_DIR, 'dist', 'site')

const { values } = parseArgs({
  options: { output: { type: 'string', short: 'o' } },
})
const outputPath = resolve(values.output ?? resolve(BRAND_DIR, 'dist', 'brand-guide.pdf'))

if (!existsSync(DIST_SITE)) {
  console.error(`Missing ${DIST_SITE} — run \`npm run build:site\` first.`)
  process.exit(1)
}

// Load the same nav config the Brand Site uses, so the guide tracks the site.
const require = createRequire(import.meta.url)
const nav = require(resolve(BRAND_DIR, 'site', '_data', 'nav.cjs')) as { slug: string; label: string }[]

// --- Tiny static server -------------------------------------------------
// The Brand Site uses pathPrefix `/brand/`, so its <link href="/brand/tokens.css">
// only resolves when served over HTTP. We host dist/site/ at /brand/ on a
// random port for the duration of the render.

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff':  'font/woff',
  '.pdf':  'application/pdf',
  '.md':   'text/markdown; charset=utf-8',
}

const server = createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  if (urlPath.startsWith('/brand/')) urlPath = urlPath.slice('/brand'.length)
  let filePath = join(DIST_SITE, urlPath)
  try {
    if (statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html')
    const body = readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
})

await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const port = (server.address() as AddressInfo).port
const baseUrl = `http://127.0.0.1:${port}/brand`
console.log(`Serving ${DIST_SITE} at ${baseUrl}/`)

// --- Render + concat -----------------------------------------------------

function pageUrl(slug: string): string {
  return slug === '' ? `${baseUrl}/` : `${baseUrl}/${slug}/`
}

const browser = await chromium.launch()
const merged = await PDFDocument.create()

for (const item of nav) {
  const url = pageUrl(item.slug)
  const page = await browser.newPage()
  await page.emulateMedia({ media: 'print' })
  const response = await page.goto(url, { waitUntil: 'networkidle' })
  if (!response || !response.ok()) {
    console.warn(`Skipping ${item.label || 'Overview'}: ${url} returned ${response?.status() ?? 'no response'}`)
    await page.close()
    continue
  }
  const pdfBytes = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' },
  })
  await page.close()

  const sectionPdf = await PDFDocument.load(pdfBytes)
  const copied = await merged.copyPages(sectionPdf, sectionPdf.getPageIndices())
  for (const p of copied) merged.addPage(p)
  console.log(`Appended: ${item.label || 'Overview'} (${sectionPdf.getPageCount()} page${sectionPdf.getPageCount() === 1 ? '' : 's'})`)
}

await browser.close()
server.close()

const mergedBytes = await merged.save()
writeFileSync(outputPath, mergedBytes)
console.log(`Wrote ${outputPath} (${merged.getPageCount()} pages)`)
