// Generate a printable A4 swatch sheet (PDF) from tokens.json + tokens.css.
// Token-sourced per brand/CLAUDE.md rule: never hardcode hex.
//
// Usage: tsx scripts/generate-palette-pdf.ts [-o output.pdf]

import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { tmpdir } from 'node:os'
import { writeFileSync, unlinkSync } from 'node:fs'
import nunjucks from 'nunjucks'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')
const TOKENS_CSS_PATH = resolve(BRAND_DIR, 'tokens.css')
const TOKENS_JSON_PATH = resolve(BRAND_DIR, 'tokens.json')
const TEMPLATE_PATH = resolve(BRAND_DIR, 'templates', 'palette-sheet.html')
const FONTS_DIR = existsSync(resolve(BRAND_DIR, 'fonts'))
  ? resolve(BRAND_DIR, 'fonts')
  : resolve(BRAND_DIR, '..', 'website', 'fonts')

const { values } = parseArgs({
  options: { output: { type: 'string', short: 'o' } },
})
const outputPath = resolve(values.output ?? resolve(BRAND_DIR, 'dist', 'palette.pdf'))

if (!existsSync(TOKENS_CSS_PATH)) {
  console.error(`Missing ${TOKENS_CSS_PATH} — run \`npm run build:tokens\` first.`)
  process.exit(1)
}
if (!existsSync(TOKENS_JSON_PATH)) {
  console.error(`Missing ${TOKENS_JSON_PATH} — run \`npm run build:tokens\` first.`)
  process.exit(1)
}

const tokensCss = readFileSync(TOKENS_CSS_PATH, 'utf8')
const tokens = JSON.parse(readFileSync(TOKENS_JSON_PATH, 'utf8')) as {
  colors: Record<string, string>
  secondaryColors: Record<string, string>
}

// --- Color helpers --------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function rgbString(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
  return `${r} ${g} ${b}`
}

// Naive sRGB → CMYK conversion. Approximation only — for true print fidelity
// you'd want an ICC profile; the kit notes this explicitly.
function rgbToCmyk(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
  const rf = r / 255, gf = g / 255, bf = b / 255
  const k = 1 - Math.max(rf, gf, bf)
  if (k === 1) return '0 0 0 100'
  const c = (1 - rf - k) / (1 - k)
  const m = (1 - gf - k) / (1 - k)
  const y = (1 - bf - k) / (1 - k)
  return `${Math.round(c * 100)} ${Math.round(m * 100)} ${Math.round(y * 100)} ${Math.round(k * 100)}`
}

// --- Color metadata -------------------------------------------------------
// Names + roles are editorial; values come from tokens.json.

type ColorMeta = { key: string; name: string; role: string }
type Category = { label: string; entries: ColorMeta[] }

const CATEGORIES: Category[] = [
  {
    label: 'Foundation',
    entries: [
      { key: 'cream',      name: 'Warm Cream',   role: 'Primary canvas. Page backgrounds, large surfaces.' },
      { key: 'black',      name: 'Warm Black',   role: 'Primary ink. Headlines, dark surfaces, logo on light.' },
      { key: 'terracotta', name: 'Terracotta',   role: 'Brand accent. CTAs, eyebrows, highlights.' },
    ],
  },
  {
    label: 'Accents',
    entries: [
      { key: 'terracottaHover', name: 'Terracotta Hover', role: 'Hover/active state for Terracotta.' },
      { key: 'accent',          name: 'Accent',           role: 'Lighter terracotta variant for subtle emphasis.' },
    ],
  },
  {
    label: 'Neutrals',
    entries: [
      { key: 'light',  name: 'Light',  role: 'Card surfaces on cream, subtle fills.' },
      { key: 'muted',  name: 'Muted',  role: 'Dividers, disabled elements.' },
      { key: 'subtle', name: 'Subtle', role: 'Captions, helper text.' },
      { key: 'body',   name: 'Body',   role: 'Default body copy color.' },
      { key: 'text',   name: 'Text',   role: 'High-contrast body / headlines on cream.' },
    ],
  },
  {
    label: 'Document Neutrals',
    entries: [
      { key: 'docText',   name: 'Doc Text',   role: 'Print body copy on letter/offer/invoice.' },
      { key: 'docBorder', name: 'Doc Border', role: 'Hairline borders on meta strips & tables.' },
    ],
  },
]

const SECONDARY: Category = {
  label: 'Secondary (Tags)',
  entries: [
    { key: 'blue',  name: 'Blue',  role: '"Kommt" tags — upcoming / inbound.' },
    { key: 'green', name: 'Green', role: '"Tun" tags — action / outbound.' },
  ],
}

function buildCategory(cat: Category, source: Record<string, string>) {
  return {
    label: cat.label,
    colors: cat.entries
      .filter((e) => source[e.key])
      .map((e) => {
        const hex = source[e.key]
        return { name: e.name, role: e.role, hex, rgb: rgbString(hex), cmyk: rgbToCmyk(hex) }
      }),
  }
}

const renderedCategories = [
  ...CATEGORIES.map((c) => buildCategory(c, tokens.colors)),
  buildCategory(SECONDARY, tokens.secondaryColors),
]

// --- Render template ------------------------------------------------------

const today = new Date()
const isoDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

const template = readFileSync(TEMPLATE_PATH, 'utf8')
nunjucks.configure({ autoescape: false })
const html = nunjucks.renderString(template, {
  TOKENS_CSS: tokensCss,
  FONTS_URI: pathToFileURL(FONTS_DIR).href,
  CATEGORIES: renderedCategories,
  DATE: isoDate,
  VERSION: '1.0',
})

// --- Render PDF via Playwright -------------------------------------------

const tmpHtml = resolve(tmpdir(), `palette-sheet-${process.pid}.html`)
writeFileSync(tmpHtml, html)

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: 'networkidle' })
await page.pdf({
  path: outputPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '18mm', right: '18mm', bottom: '16mm', left: '18mm' },
})
await browser.close()

try { unlinkSync(tmpHtml) } catch {}

console.log(`Wrote ${outputPath}`)
