import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { tmpdir } from 'node:os'
import nunjucks from 'nunjucks'
import MarkdownIt from 'markdown-it'
import { chromium } from 'playwright'
import { colors } from '../tokens.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')
const FONTS_DIR = resolve(BRAND_DIR, '..', 'website', 'fonts')
const TEMPLATES_DIR = resolve(BRAND_DIR, 'templates')

// --- i18n ---

const STRINGS: Record<string, Record<string, string>> = {
  de: {
    to_label: 'An:',
    subject_label: 'Betreff',
    confidential_label: 'Vertraulich',
    page_label: 'Seite',
  },
  en: {
    to_label: 'To:',
    subject_label: 'Subject',
    confidential_label: 'Confidential',
    page_label: 'Page',
  },
}

// --- Footer ---

function footerTemplate(lang: string): string {
  const pageLabel = STRINGS[lang].page_label
  return `
<div style="width: 100%; font-family: 'Inter', sans-serif; font-size: 10px;
            color: #9A948D; display: flex; justify-content: space-between;
            align-items: center; padding: 12px 25mm 0; border-top: 0.5px solid #EEEAE4;">
  <div style="display: flex; align-items: center;">
    <span>+43 664 6522083</span>
    <span style="border-right: 0.5px solid #DDDAD4; height: 10px; margin: 0 12px;"></span>
    <span>tommi.enenkel@escapevelocity.consulting</span>
    <span style="border-right: 0.5px solid #DDDAD4; height: 10px; margin: 0 12px;"></span>
    <span>escapevelocity.consulting</span>
  </div>
  <span style="font-weight: 500; color: #9A948D;">${pageLabel} <span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>`
}

// --- Date ---

function dateToday(lang: string): string {
  const today = new Date()
  const day = today.getDate()
  const year = today.getFullYear()
  const month = today.getMonth()

  if (lang === 'en') {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]
    return `${day} ${months[month]} ${year}`
  }

  const months = [
    'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ]
  return `${day}. ${months[month]} ${year}`
}

// --- Markdown ---

function extractTitle(text: string): string {
  const match = text.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : ''
}

function mdToHtml(mdPath: string): { body: string; title: string } {
  const text = readFileSync(mdPath, 'utf-8')
  const title = extractTitle(text)

  // Strip the first H1 to avoid double-rendering
  let cleaned = text
  if (title) {
    cleaned = text.replace(new RegExp(`^#\\s+${escapeRegex(title)}\\s*$`, 'm'), '')
  }

  const md = new MarkdownIt({ html: true, typographer: true })
  const body = md.render(cleaned)
  return { body, title }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// --- Template ---

const env = nunjucks.configure(TEMPLATES_DIR, {
  autoescape: false,
  throwOnUndefined: false,
})

const TEMPLATE_MAP: Record<string, string> = {
  letter: 'letter.html',
  offer: 'offer.html',
  invoice: 'invoice.html',
  tos: 'tos.html',
}

function renderTemplate(
  templateFile: string,
  bodyHtml: string,
  opts: {
    to?: string
    date: string
    ref?: string
    subject?: string
    confidential: boolean
    lang: string
  },
): string {
  const fontsUri = pathToFileURL(FONTS_DIR).href
  const showMeta = !!(opts.to || opts.ref || opts.confidential)

  return env.render(templateFile, {
    CONTENT: bodyHtml,
    FONTS_URI: fontsUri,
    LANG: opts.lang,
    STRINGS: STRINGS[opts.lang],
    RECIPIENT: opts.to || '',
    DATE: opts.date,
    REF: opts.ref || '',
    SUBJECT: opts.subject || '',
    CONFIDENTIAL: opts.confidential,
    SHOW_META: showMeta,
  })
}

// --- PDF ---

async function htmlToPdf(html: string, outputPath: string, lang: string): Promise<void> {
  const tmpPath = resolve(tmpdir(), `ev-pdf-${Date.now()}.html`)
  writeFileSync(tmpPath, html, 'utf-8')

  try {
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.goto(pathToFileURL(tmpPath).href, { waitUntil: 'networkidle' })
    await page.pdf({
      path: outputPath,
      format: 'A4',
      margin: { top: '12mm', right: '25mm', bottom: '20mm', left: '25mm' },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: footerTemplate(lang),
    })
    await browser.close()
  } finally {
    try { unlinkSync(tmpPath) } catch {}
  }
}

// --- CLI ---

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      output:       { type: 'string', short: 'o' },
      type:         { type: 'string', default: 'letter' },
      to:           { type: 'string' },
      date:         { type: 'string' },
      ref:          { type: 'string' },
      subject:      { type: 'string' },
      confidential: { type: 'boolean', default: false },
      lang:         { type: 'string', default: 'de' },
      template:     { type: 'string' },
      debug:        { type: 'boolean', default: false },
    },
    allowPositionals: true,
  })

  const inputPath = positionals[0]
  if (!inputPath) {
    console.error('Usage: pdf.ts <input.md> [options]')
    process.exit(1)
  }

  const lang = values.lang ?? 'de'
  const docType = values.type ?? 'letter'

  // Resolve template
  let templateFile: string
  if (values.template) {
    // Direct template override — resolve relative to cwd, render from string
    const tplContent = readFileSync(resolve(process.cwd(), values.template), 'utf-8')
    const tmpTpl = `_custom-${Date.now()}.html`
    writeFileSync(resolve(TEMPLATES_DIR, tmpTpl), tplContent, 'utf-8')
    templateFile = tmpTpl
  } else {
    templateFile = TEMPLATE_MAP[docType]
    if (!templateFile) {
      console.error(`Unknown document type: ${docType}. Available: ${Object.keys(TEMPLATE_MAP).join(', ')}`)
      process.exit(1)
    }
  }

  // Parse markdown
  const { body, title } = mdToHtml(resolve(process.cwd(), inputPath))

  // Resolve options
  const subject = values.subject || title || undefined
  const dateStr = values.date || dateToday(lang)
  const outputPath = values.output
    ? resolve(process.cwd(), values.output)
    : resolve(process.cwd(), inputPath.replace(/\.md$/, '.pdf'))

  mkdirSync(dirname(outputPath), { recursive: true })

  // Render
  const fullHtml = renderTemplate(templateFile, body, {
    to: values.to,
    date: dateStr,
    ref: values.ref,
    subject,
    confidential: values.confidential ?? false,
    lang,
  })

  // Debug HTML
  if (values.debug) {
    const debugPath = outputPath.replace(/\.pdf$/, '.debug.html')
    writeFileSync(debugPath, fullHtml, 'utf-8')
    console.log(`Debug HTML: ${debugPath}`)
  }

  // Generate PDF
  await htmlToPdf(fullHtml, outputPath, lang)
  console.log(`Done: ${outputPath}`)

  // Clean up custom template if created
  if (values.template) {
    try { unlinkSync(resolve(TEMPLATES_DIR, templateFile)) } catch {}
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
