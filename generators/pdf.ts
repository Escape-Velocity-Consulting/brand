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
    tagline: 'Digitalisierung · Automatisierung · KI',
    uid_label: 'UID:',
    private_label: 'Privatkunde',
    signature_closing: 'Mit freundlichen Grüßen,',
    signature_name: 'Tommi Enenkel',
    signature_org: 'Escape Velocity',
  },
  en: {
    to_label: 'To:',
    subject_label: 'Subject',
    confidential_label: 'Confidential',
    page_label: 'Page',
    tagline: 'Digitization · Automation · AI',
    uid_label: 'VAT ID:',
    private_label: 'Private customer',
    signature_closing: 'Kind regards,',
    signature_name: 'Tommi Enenkel',
    signature_org: 'Escape Velocity',
  },
}

// --- Footer ---

function footerTemplate(lang: string, docType = 'letter'): string {
  const pageLabel = STRINGS[lang].page_label
  const pageSpan = `<span style="font-weight: 500; color: #9A948D;">${pageLabel} <span class="pageNumber"></span> / <span class="totalPages"></span></span>`

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
  <div style="display: flex; align-items: center;">
    <span>+43 664 6522083</span>
    <span style="border-right: 0.5px solid #DDDAD4; height: 10px; margin: 0 12px;"></span>
    <span>tommi.enenkel@escapevelocity.consulting</span>
    <span style="border-right: 0.5px solid #DDDAD4; height: 10px; margin: 0 12px;"></span>
    <span>escapevelocity.consulting</span>
  </div>
  ${pageSpan}
</div>`
}

// --- Dates ---

const DE_MONTHS = [
  'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]
const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatDate(d: Date, lang: string): string {
  const day = d.getDate()
  const year = d.getFullYear()
  const month = d.getMonth()
  if (lang === 'en') return `${day} ${EN_MONTHS[month]} ${year}`
  return `${day}. ${DE_MONTHS[month]} ${year}`
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse a date string in ISO (YYYY-MM-DD), German ("20. Mai 2026" / "20 Mai 2026"), or English form. Returns null if unparseable. */
function parseDate(input: string): Date | null {
  if (!input) return null
  // ISO
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim())
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  // German or English: "DD[.] Month YYYY"
  const named = /^(\d{1,2})\.?\s+([A-Za-zÄäÖöÜü]+)\.?\s+(\d{4})$/.exec(input.trim())
  if (named) {
    const day = Number(named[1])
    const monthName = named[2]
    const year = Number(named[3])
    let m = DE_MONTHS.findIndex((n) => n.toLowerCase() === monthName.toLowerCase())
    if (m < 0) m = EN_MONTHS.findIndex((n) => n.toLowerCase() === monthName.toLowerCase())
    if (m >= 0) return new Date(year, m, day)
  }
  return null
}

// --- Markdown ---

function extractTitle(text: string): string {
  const match = text.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : ''
}

function mdToHtml(mdPath: string, keepTitle = false): { body: string; title: string } {
  const text = readFileSync(mdPath, 'utf-8')
  const title = extractTitle(text)

  let cleaned = text
  if (title && !keepTitle) {
    cleaned = text.replace(new RegExp(`^#\\s+${escapeRegex(title)}\\s*$`, 'm'), '')
  }

  const md = new MarkdownIt({ html: true, typographer: true })
  const body = md.render(cleaned)
  return { body, title }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// --- Slug / filename ---

function slugForFilename(s: string, maxLen = 40): string {
  return s
    .replace(/&/g, ' und ')
    .replace(/·/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
    .trim()
}

// --- Recipient ---

interface Recipient {
  name?: string
  company?: string
  address?: string  // newlines allowed
  uid?: string
  private?: boolean
  extra_lines?: string[]
}

function buildRecipient(values: Record<string, any>): Recipient | null {
  const hasStructured = values['to-name'] || values['to-company'] || values['to-address'] || values['to-uid'] || values['to-private']
  if (hasStructured) {
    return {
      name: values['to-name'],
      company: values['to-company'],
      address: values['to-address']?.replace(/\\n/g, '\n'),
      uid: values['to-uid'],
      private: values['to-private'] ?? false,
    }
  }
  if (values.to) {
    // Backward-compat fallback: split on " · "
    const parts = String(values.to).split(' · ')
    return {
      name: parts[0],
      extra_lines: parts.slice(1),
    }
  }
  return null
}

function validateForInvoice(rec: Recipient | null, values: Record<string, any>): string | null {
  if (values.to) {
    return 'Invoice does not accept --to. Use --to-name, --to-company, --to-address, and --to-uid (or --to-private).'
  }
  if (!rec) {
    return 'Invoice requires structured recipient flags: --to-name (or --to-company), --to-address, --to-uid (or --to-private).'
  }
  if (!rec.name && !rec.company) {
    return 'Invoice requires --to-name or --to-company.'
  }
  if (!rec.address) {
    return 'Invoice requires --to-address (multi-line allowed via \\n).'
  }
  if (rec.uid && rec.private) {
    return '--to-uid and --to-private are mutually exclusive.'
  }
  if (!rec.uid && !rec.private) {
    return 'Invoice requires either --to-uid (business) or --to-private (private customer acknowledgement).'
  }
  if (rec.uid && !/^[A-Z]{2}[A-Z0-9]+$/.test(rec.uid)) {
    return `--to-uid must be an EU VAT ID (e.g. ATU12345678). Got: ${rec.uid}`
  }
  return null
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
    recipient: Recipient | null
    date: string
    ref?: string
    subject?: string
    confidential: boolean
    lang: string
    showAbout: boolean
    showSignature: boolean
  },
): string {
  const fontsUri = pathToFileURL(FONTS_DIR).href
  const showMeta = !!(opts.recipient || opts.ref || opts.confidential)
  // Compose legacy RECIPIENT string for any reference to {{ RECIPIENT }}
  const rec = opts.recipient
  const legacyRecipient = rec
    ? [rec.company, rec.name, rec.address, ...(rec.extra_lines ?? [])].filter(Boolean).join(' · ')
    : ''

  return env.render(templateFile, {
    CONTENT: bodyHtml,
    FONTS_URI: fontsUri,
    LANG: opts.lang,
    STRINGS: STRINGS[opts.lang],
    RECIPIENT: legacyRecipient,
    RECIPIENT_OBJ: rec ?? {},
    HAS_RECIPIENT: !!rec,
    DATE: opts.date,
    REF: opts.ref || '',
    SUBJECT: opts.subject || '',
    CONFIDENTIAL: opts.confidential,
    SHOW_META: showMeta,
    SHOW_ABOUT: opts.showAbout,
    SHOW_SIGNATURE: opts.showSignature,
  })
}

// --- PDF ---

async function htmlToPdf(html: string, outputPath: string, lang: string, docType = 'letter'): Promise<void> {
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
      footerTemplate: footerTemplate(lang, docType),
    })
    await browser.close()
  } finally {
    try { unlinkSync(tmpPath) } catch {}
  }
}

// --- Canonical filename ---

function canonicalFilename(opts: {
  docType: string
  ref?: string
  date: Date
  recipient: Recipient | null
  subject?: string
  inputStem: string
}): string {
  const { docType, ref, date, recipient, subject, inputStem } = opts
  if (docType !== 'invoice' && docType !== 'offer') {
    return `${inputStem}.pdf`
  }
  const iso = isoDate(date)
  const customer = recipient ? (recipient.company || recipient.name || '') : ''
  const customerSlug = slugForFilename(customer, 50)
  const subjectSlug = subject ? slugForFilename(subject, 50) : ''
  let refStr = (ref || '').trim()

  if (docType === 'invoice') {
    if (refStr && !/^AR\b/i.test(refStr)) refStr = `AR ${refStr}`
    const parts = [refStr, iso, customerSlug, subjectSlug].filter(Boolean)
    return parts.join(' - ') + '.pdf'
  }
  // offer
  const parts = [refStr, iso, customerSlug, subjectSlug].filter(Boolean)
  return parts.join(' - ') + '.pdf'
}

// --- CLI ---

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      output:        { type: 'string', short: 'o' },
      'output-dir':  { type: 'string' },
      type:          { type: 'string', default: 'letter' },
      to:            { type: 'string' },
      'to-name':     { type: 'string' },
      'to-company':  { type: 'string' },
      'to-address':  { type: 'string' },
      'to-uid':      { type: 'string' },
      'to-private':  { type: 'boolean', default: false },
      date:          { type: 'string' },
      ref:           { type: 'string' },
      subject:       { type: 'string' },
      confidential:  { type: 'boolean', default: false },
      lang:          { type: 'string', default: 'de' },
      template:      { type: 'string' },
      attach:        { type: 'string' },
      'no-about':    { type: 'boolean', default: false },
      'no-signature':{ type: 'boolean', default: false },
      debug:         { type: 'boolean', default: false },
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

  // Recipient
  const recipient = buildRecipient(values)

  // Invoice validation
  if (docType === 'invoice') {
    const err = validateForInvoice(recipient, values)
    if (err) {
      console.error(`error: ${err}`)
      process.exit(1)
    }
  } else if (values.to && (values['to-name'] || values['to-company'] || values['to-address'] || values['to-uid'] || values['to-private'])) {
    console.error('error: --to is mutually exclusive with --to-name / --to-company / --to-address / --to-uid / --to-private.')
    process.exit(1)
  }

  // Resolve template
  let templateFile: string
  if (values.template) {
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

  // Date
  const parsedDate = values.date ? parseDate(values.date) : null
  const effectiveDate = parsedDate ?? new Date()
  const dateStr = values.date && parsedDate
    ? formatDate(parsedDate, lang)
    : (values.date && !parsedDate ? values.date : formatDate(new Date(), lang))

  // Parse markdown
  const { body, title } = mdToHtml(resolve(process.cwd(), inputPath), docType === 'tos')

  // Subject
  const subject = values.subject || title || undefined

  // Output path
  const inputStem = inputPath.replace(/\.md$/, '').split(/[\\/]/).pop() || 'output'
  const outputDir = values['output-dir']
    ? resolve(process.cwd(), values['output-dir'])
    : process.cwd()

  let outputPath: string
  if (values.output) {
    outputPath = resolve(process.cwd(), values.output)
  } else {
    const filename = canonicalFilename({
      docType,
      ref: values.ref,
      date: effectiveDate,
      recipient,
      subject,
      inputStem,
    })
    outputPath = resolve(outputDir, filename)
  }

  mkdirSync(dirname(outputPath), { recursive: true })

  // Render
  const fullHtml = renderTemplate(templateFile, body, {
    recipient,
    date: dateStr,
    ref: values.ref,
    subject,
    confidential: values.confidential ?? false,
    lang,
    showAbout: !(values['no-about'] ?? false),
    showSignature: !(values['no-signature'] ?? false),
  })

  // Debug HTML
  if (values.debug) {
    const debugPath = outputPath.replace(/\.pdf$/, '.debug.html')
    writeFileSync(debugPath, fullHtml, 'utf-8')
    console.log(`Debug HTML: ${debugPath}`)
  }

  await htmlToPdf(fullHtml, outputPath, lang, docType)

  // Attach
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

  if (values.template) {
    try { unlinkSync(resolve(TEMPLATES_DIR, templateFile)) } catch {}
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
