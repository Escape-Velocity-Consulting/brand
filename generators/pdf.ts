import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { tmpdir } from 'node:os'
import nunjucks from 'nunjucks'
import MarkdownIt from 'markdown-it'
import { chromium } from 'playwright'
import { PDFDocument } from 'pdf-lib'
import { colors } from '../tokens.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')
const FONTS_DIR = existsSync(resolve(BRAND_DIR, 'fonts'))
  ? resolve(BRAND_DIR, 'fonts')
  : resolve(BRAND_DIR, '..', 'website', 'fonts')
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

// --- Header ---

function headerTemplate(subject: string, dateStr: string, recipient?: string): string {
  const right = [dateStr, recipient].filter(Boolean).join(' · ')
  return `
<div style="width: 100%; font-family: 'Inter', sans-serif; font-size: 9px;
            color: #9A948D; display: flex; justify-content: space-between;
            align-items: center; padding: 0 25mm 6px;">
  <span>${escapeHtml(subject)}</span>
  <span>${escapeHtml(right)}</span>
</div>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

// --- Footer ---

function footerTemplate(lang: string, docType = 'letter', subject = ''): string {
  const pageLabel = STRINGS[lang].page_label
  const pageSpan = `<span style="font-weight: 500; color: #9A948D;">${pageLabel} <span class="pageNumber"></span> / <span class="totalPages"></span></span>`

  if (docType === 'report') {
    return `
<div style="width: 100%; font-family: 'Inter', sans-serif; font-size: 10px;
            color: #9A948D; display: flex; justify-content: space-between;
            align-items: center; padding: 12px 25mm 0; border-top: 0.5px solid #EEEAE4;">
  <span>${escapeHtml(subject)}</span>
  ${pageSpan}
</div>`
  }

  if (docType === 'tos') {
    return `
<div style="width: 100%; font-family: 'Inter', sans-serif; font-size: 10px;
            color: #9A948D; display: flex; justify-content: flex-end;
            align-items: center; padding: 12px 25mm 0; border-top: 0.5px solid #EEEAE4;">
  ${pageSpan}
</div>`
  }

  if (docType === 'offer' || docType === 'invoice') {
    const sep = `<span style="border-right: 0.5px solid #DDDAD4; height: 10px; margin: 0 8px;"></span>`
    return `
<div style="width: 100%; font-family: 'Inter', sans-serif; font-size: 9px;
            color: #9A948D; display: flex; justify-content: space-between;
            align-items: center; padding: 12px 25mm 0; border-top: 0.5px solid #EEEAE4;">
  <div style="display: flex; align-items: center;">
    <span>Thomas Enenkel GmbH</span>${sep}<span>FN 570703w</span>${sep}<span>UID ATU77669024</span>
  </div>
  <div style="display: flex; align-items: center;">
    <span>IBAN AT03 3266 7000 0003 8695</span>
    <span style="border-right: 0.5px solid #DDDAD4; height: 10px; margin: 0 8px;"></span>
    ${pageSpan}
  </div>
</div>`
  }

  // letter (default)
  return `
<div style="width: 100%; font-family: 'Inter', sans-serif; font-size: 10px;
            color: #9A948D; display: flex; justify-content: space-between;
            align-items: center; padding: 12px 25mm 0; border-top: 0.5px solid #EEEAE4;">
  <span>${escapeHtml(subject)}</span>
  ${pageSpan}
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

function mdToHtml(mdPath: string, keepTitle = false): { body: string; title: string } {
  const text = readFileSync(mdPath, 'utf-8')
  const title = extractTitle(text)

  // Strip the first H1 to avoid double-rendering (unless keepTitle is set)
  let cleaned = text
  if (title && !keepTitle) {
    cleaned = text.replace(new RegExp(`^#\\s+${escapeRegex(title)}\\s*$`, 'm'), '')
  }

  const md = new MarkdownIt({ html: true, typographer: true })
  let body = md.render(cleaned)

  // Resolve relative image srcs. Local SVGs inline (so they inherit page fonts);
  // other formats get absolute file:// URLs (PDF renders from tmpdir).
  const mdDir = dirname(mdPath)
  body = body.replace(/<img([^>]*?)\ssrc="([^"]+)"([^>]*)>/g, (match, pre, src, post) => {
    if (/^(https?:|data:|file:|\/)/i.test(src)) return match
    const decoded = decodeURI(src)
    const absPath = resolve(mdDir, decoded)
    if (absPath.toLowerCase().endsWith('.svg') && existsSync(absPath)) {
      const svgRaw = readFileSync(absPath, 'utf-8')
      // Strip XML declaration and doctype; keep the <svg> element as-is
      const svgEl = svgRaw.replace(/<\?xml[^?]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').trim()
      return `<span class="inline-svg">${svgEl}</span>`
    }
    const fileUrl = pathToFileURL(absPath).href
    return `<img${pre} src="${fileUrl}"${post}>`
  })

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
  report: 'report.html',
}

function renderTemplate(
  templateFile: string,
  bodyHtml: string,
  opts: {
    to?: string
    date: string
    ref?: string
    subject?: string
    eyebrow?: string
    cover?: string
    confidential: boolean
    lang: string
    showAbout: boolean
  },
): string {
  const fontsUri = pathToFileURL(FONTS_DIR).href
  const showMeta = !!(opts.to || opts.ref || opts.confidential)

  return env.render(templateFile, {
    CONTENT: bodyHtml,
    COVER: opts.cover || '',
    EYEBROW: opts.eyebrow || '',
    FONTS_URI: fontsUri,
    LANG: opts.lang,
    STRINGS: STRINGS[opts.lang],
    RECIPIENT: opts.to || '',
    DATE: opts.date,
    REF: opts.ref || '',
    SUBJECT: opts.subject || '',
    CONFIDENTIAL: opts.confidential,
    SHOW_META: showMeta,
    SHOW_ABOUT: opts.showAbout,
  })
}

function loadCoverAsset(coverPath: string): string {
  const abs = resolve(process.cwd(), coverPath)
  if (!existsSync(abs)) {
    console.error(`Cover asset not found: ${abs}`)
    process.exit(1)
  }
  if (abs.toLowerCase().endsWith('.svg')) {
    const svgRaw = readFileSync(abs, 'utf-8')
    const svgEl = svgRaw.replace(/<\?xml[^?]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').trim()
    return `<span class="inline-svg">${svgEl}</span>`
  }
  const url = pathToFileURL(abs).href
  return `<img src="${url}" alt="">`
}

// --- PDF ---

async function htmlToPdf(
  html: string,
  outputPath: string,
  lang: string,
  docType = 'letter',
  opts: { subject?: string; date?: string; recipient?: string } = {},
): Promise<void> {
  const tmpPath = resolve(tmpdir(), `ev-pdf-${Date.now()}.html`)
  writeFileSync(tmpPath, html, 'utf-8')

  const header = '<div></div>'
  const topMargin = '12mm'

  try {
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.goto(pathToFileURL(tmpPath).href, { waitUntil: 'networkidle' })
    await page.pdf({
      path: outputPath,
      format: 'A4',
      margin: { top: topMargin, right: '25mm', bottom: '20mm', left: '25mm' },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: header,
      footerTemplate: footerTemplate(lang, docType, opts.subject),
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
      cover:        { type: 'string' },
      eyebrow:      { type: 'string' },
      attach:       { type: 'string' },
      'no-about':   { type: 'boolean', default: false },
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
  const { body, title } = mdToHtml(resolve(process.cwd(), inputPath), docType === 'tos')

  // Resolve options
  const subject = values.subject || title || undefined
  const dateStr = values.date || dateToday(lang)
  const outputPath = values.output
    ? resolve(process.cwd(), values.output)
    : resolve(process.cwd(), inputPath.replace(/\.md$/, '.pdf'))

  mkdirSync(dirname(outputPath), { recursive: true })

  // Cover asset (report type)
  const coverHtml = values.cover ? loadCoverAsset(values.cover) : undefined

  // Render
  const fullHtml = renderTemplate(templateFile, body, {
    to: values.to,
    date: dateStr,
    ref: values.ref,
    subject,
    eyebrow: values.eyebrow,
    cover: coverHtml,
    confidential: values.confidential ?? false,
    lang,
    showAbout: !(values['no-about'] ?? false),
  })

  // Debug HTML
  if (values.debug) {
    const debugPath = outputPath.replace(/\.pdf$/, '.debug.html')
    writeFileSync(debugPath, fullHtml, 'utf-8')
    console.log(`Debug HTML: ${debugPath}`)
  }

  // Generate PDF
  await htmlToPdf(fullHtml, outputPath, lang, docType, {
    subject,
    date: dateStr,
    recipient: values.to,
  })

  // Attach additional PDF (e.g. AGB)
  if (values.attach) {
    const attachPath = resolve(process.cwd(), values.attach)
    if (!existsSync(attachPath)) {
      console.error(`Attachment not found: ${attachPath}`)
      process.exit(1)
    }
    const mainBytes = readFileSync(outputPath)
    const attachBytes = readFileSync(attachPath)
    const mainDoc = await PDFDocument.load(mainBytes)
    const attachDoc = await PDFDocument.load(attachBytes)
    const copiedPages = await mainDoc.copyPages(attachDoc, attachDoc.getPageIndices())
    for (const page of copiedPages) {
      mainDoc.addPage(page)
    }
    const merged = await mainDoc.save()
    writeFileSync(outputPath, merged)
  }

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
