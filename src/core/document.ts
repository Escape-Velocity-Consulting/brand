import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import type { BrowserPool } from './browserPool.js'
import { GeneratorError } from './errors.js'
import type { BrandPaths } from './paths.js'
import { renderHtmlToPdf } from './render.js'
import { getTemplateEnv } from './templates.js'
import { loadTokensCss } from './tokens.js'

export type DocumentType = 'letter' | 'offer' | 'invoice' | 'tos' | 'report'

export const TEMPLATE_MAP: Record<DocumentType, string> = {
  letter: 'letter.html',
  offer: 'offer.html',
  invoice: 'invoice.html',
  tos: 'tos.html',
  report: 'report.html',
}

export interface Recipient {
  name?: string
  company?: string
  address?: string  // newlines allowed
  uid?: string
  private?: boolean
  extra_lines?: string[]
}

export const STRINGS: Record<string, Record<string, string>> = {
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

const DE_MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function formatDate(d: Date, lang: string): string {
  const day = d.getDate()
  const year = d.getFullYear()
  const month = d.getMonth()
  if (lang === 'en') return `${day} ${EN_MONTHS[month]} ${year}`
  return `${day}. ${DE_MONTHS[month]} ${year}`
}

export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDate(input: string): Date | null {
  if (!input) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim())
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
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

export function slugForFilename(s: string, maxLen = 40): string {
  return s
    .replace(/&/g, ' und ')
    .replace(/·/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
    .trim()
}

export function canonicalFilename(opts: {
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
  const parts = [refStr, iso, customerSlug, subjectSlug].filter(Boolean)
  return parts.join(' - ') + '.pdf'
}

export function validateForInvoice(rec: Recipient | null, hasLegacyTo: boolean): string | null {
  if (hasLegacyTo) {
    return 'Invoice does not accept --to. Use --to-name, --to-company, --to-address, and --to-uid (or --to-private).'
  }
  if (!rec) {
    return 'Invoice requires structured recipient: name (or company), address, uid (or private).'
  }
  if (!rec.name && !rec.company) {
    return 'Invoice requires name or company.'
  }
  if (!rec.address) {
    return 'Invoice requires address (multi-line allowed via \\n).'
  }
  if (rec.uid && rec.private) {
    return 'uid and private are mutually exclusive.'
  }
  if (!rec.uid && !rec.private) {
    return 'Invoice requires either uid (business) or private (private customer acknowledgement).'
  }
  if (rec.uid && !/^[A-Z]{2}[A-Z0-9]+$/.test(rec.uid)) {
    return `uid must be an EU VAT ID (e.g. ATU12345678). Got: ${rec.uid}`
  }
  return null
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export function footerTemplate(lang: string, docType = 'letter', subject = ''): string {
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

  return `
<div style="width: 100%; font-family: 'Inter', sans-serif; font-size: 10px;
            color: #9A948D; display: flex; justify-content: space-between;
            align-items: center; padding: 12px 25mm 0; border-top: 0.5px solid #EEEAE4;">
  <span>${escapeHtml(subject)}</span>
  ${pageSpan}
</div>`
}

export function loadCoverAssetFromPath(coverPath: string): string {
  if (!existsSync(coverPath)) {
    throw new GeneratorError('COVER_NOT_FOUND', `Cover asset not found: ${coverPath}`)
  }
  if (coverPath.toLowerCase().endsWith('.svg')) {
    const svgRaw = readFileSync(coverPath, 'utf-8')
    const svgEl = svgRaw.replace(/<\?xml[^?]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').trim()
    return `<span class="inline-svg">${svgEl}</span>`
  }
  const url = pathToFileURL(coverPath).href
  return `<img src="${url}" alt="">`
}

export interface RenderDocumentInput {
  /** Document body markdown (raw text). Either body or bodyHtml must be provided. */
  bodyHtml: string
  /** Already-extracted title (from H1); used for subject default. */
  title?: string
  /** Document type — determines template. */
  type: DocumentType
  recipient?: Recipient | null
  /** Formatted date string (display only). Use formatDate() to build. */
  date: string
  ref?: string
  subject?: string
  eyebrow?: string
  /** Pre-built cover HTML (use loadCoverAssetFromPath). */
  coverHtml?: string
  confidential?: boolean
  lang?: string
  showAbout?: boolean
  showSignature?: boolean
  /** Optional path to a custom template file overriding TEMPLATE_MAP[type]. */
  customTemplatePath?: string
}

/**
 * Render a document HTML by combining body + template + tokens. Returns the
 * full HTML string ready for Playwright; doesn't touch the browser.
 */
export function renderDocumentHtml(input: RenderDocumentInput, paths: BrandPaths): string {
  const lang = input.lang ?? 'de'
  const fontsUri = pathToFileURL(paths.fontsDir).href
  const tokensCss = loadTokensCss(paths, fontsUri)
  const showMeta = !!(input.recipient || input.ref || input.confidential)
  const rec = input.recipient ?? null
  const legacyRecipient = rec
    ? [rec.company, rec.name, rec.address, ...(rec.extra_lines ?? [])].filter(Boolean).join(' · ')
    : ''

  let templateFile: string
  let env = getTemplateEnv(paths.templatesDir)
  let tempTemplateName: string | null = null

  if (input.customTemplatePath) {
    const tplContent = readFileSync(input.customTemplatePath, 'utf-8')
    tempTemplateName = `_custom-${Date.now()}-${Math.random().toString(36).slice(2)}.html`
    writeFileSync(resolve(paths.templatesDir, tempTemplateName), tplContent, 'utf-8')
    templateFile = tempTemplateName
    env = getTemplateEnv(paths.templatesDir)
  } else {
    templateFile = TEMPLATE_MAP[input.type]
    if (!templateFile) {
      throw new GeneratorError('UNKNOWN_DOC_TYPE', `Unknown document type: ${input.type}. Available: ${Object.keys(TEMPLATE_MAP).join(', ')}`)
    }
  }

  try {
    return env.render(templateFile, {
      CONTENT: input.bodyHtml,
      COVER: input.coverHtml || '',
      EYEBROW: input.eyebrow || '',
      FONTS_URI: fontsUri,
      TOKENS_CSS: tokensCss,
      LANG: lang,
      STRINGS: STRINGS[lang],
      RECIPIENT: legacyRecipient,
      RECIPIENT_OBJ: rec ?? {},
      HAS_RECIPIENT: !!rec,
      DATE: input.date,
      REF: input.ref || '',
      SUBJECT: input.subject || '',
      CONFIDENTIAL: !!input.confidential,
      SHOW_META: showMeta,
      SHOW_ABOUT: input.showAbout ?? true,
      SHOW_SIGNATURE: input.showSignature ?? true,
    })
  } finally {
    if (tempTemplateName) {
      try { unlinkSync(resolve(paths.templatesDir, tempTemplateName)) } catch {}
    }
  }
}

/**
 * Render a fully-composed HTML document to PDF via Playwright. Returns the
 * PDF as a Buffer. Caller writes to disk.
 *
 * Thin wrapper around `renderHtmlToPdf` that bakes in the A4 / branded-footer
 * defaults for the 5 brand document types. The HTML is assumed to be already
 * fully composed by `renderDocumentHtml` (no further Nunjucks templating).
 */
export async function htmlToPdf(
  html: string,
  pool: BrowserPool,
  opts: { lang: string; docType: DocumentType; subject?: string },
  paths: BrandPaths,
): Promise<Buffer> {
  return renderHtmlToPdf(
    { html, skipTemplating: true },
    {
      format: 'A4',
      margin: { top: '12mm', right: '25mm', bottom: '20mm', left: '25mm' },
      printBackground: true,
      footerTemplate: footerTemplate(opts.lang, opts.docType, opts.subject),
    },
    paths,
    pool,
  )
}

/**
 * Merge an attachment PDF into the end of the main PDF. Returns merged bytes.
 */
export async function attachPdf(mainBytes: Buffer | Uint8Array, attachBytes: Buffer | Uint8Array): Promise<Uint8Array> {
  const mainDoc = await PDFDocument.load(mainBytes)
  const attachDoc = await PDFDocument.load(attachBytes)
  const copiedPages = await mainDoc.copyPages(attachDoc, attachDoc.getPageIndices())
  for (const page of copiedPages) mainDoc.addPage(page)
  return mainDoc.save()
}
