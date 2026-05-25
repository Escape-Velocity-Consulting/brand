import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { BrowserPool } from '../src/core/browserPool.js'
import { resolveBrandPaths } from '../src/core/paths.js'
import { GeneratorError } from '../src/core/errors.js'
import {
  type DocumentType,
  type Recipient,
  TEMPLATE_MAP,
  attachPdf,
  canonicalFilename,
  formatDate,
  htmlToPdf,
  loadCoverAssetFromPath,
  parseDate,
  renderDocumentHtml,
  validateForInvoice,
} from '../src/core/document.js'
import { mdToHtmlFromFile } from '../src/core/markdown.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')

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
    const parts = String(values.to).split(' · ')
    return { name: parts[0], extra_lines: parts.slice(1) }
  }
  return null
}

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
      cover:         { type: 'string' },
      eyebrow:       { type: 'string' },
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
  const docType = (values.type ?? 'letter') as DocumentType

  const recipient = buildRecipient(values)

  if (docType === 'invoice') {
    const err = validateForInvoice(recipient, !!values.to)
    if (err) { console.error(`error: ${err}`); process.exit(1) }
  } else if (values.to && (values['to-name'] || values['to-company'] || values['to-address'] || values['to-uid'] || values['to-private'])) {
    console.error('error: --to is mutually exclusive with --to-name / --to-company / --to-address / --to-uid / --to-private.')
    process.exit(1)
  }

  if (!values.template && !TEMPLATE_MAP[docType]) {
    console.error(`Unknown document type: ${docType}. Available: ${Object.keys(TEMPLATE_MAP).join(', ')}`)
    process.exit(1)
  }

  const parsedDate = values.date ? parseDate(values.date) : null
  const effectiveDate = parsedDate ?? new Date()
  const dateStr = values.date && parsedDate
    ? formatDate(parsedDate, lang)
    : (values.date && !parsedDate ? values.date : formatDate(new Date(), lang))

  const { body, title } = mdToHtmlFromFile(resolve(process.cwd(), inputPath), docType === 'tos')
  const subject = values.subject || title || undefined

  const inputStem = inputPath.replace(/\.md$/, '').split(/[\\/]/).pop() || 'output'
  const outputDir = values['output-dir']
    ? resolve(process.cwd(), values['output-dir'])
    : process.cwd()

  let outputPath: string
  if (values.output) {
    outputPath = resolve(process.cwd(), values.output)
  } else {
    outputPath = resolve(outputDir, canonicalFilename({
      docType, ref: values.ref, date: effectiveDate, recipient, subject, inputStem,
    }))
  }
  mkdirSync(dirname(outputPath), { recursive: true })

  const paths = resolveBrandPaths(BRAND_DIR)
  const pool = new BrowserPool()

  try {
    const coverHtml = values.cover ? loadCoverAssetFromPath(resolve(process.cwd(), values.cover)) : undefined
    const customTemplatePath = values.template ? resolve(process.cwd(), values.template) : undefined

    const fullHtml = renderDocumentHtml({
      bodyHtml: body, title, type: docType, recipient,
      date: dateStr, ref: values.ref, subject, eyebrow: values.eyebrow,
      coverHtml, confidential: values.confidential ?? false, lang,
      showAbout: !(values['no-about'] ?? false),
      showSignature: !(values['no-signature'] ?? false),
      customTemplatePath,
    }, paths)

    if (values.debug) {
      const debugPath = outputPath.replace(/\.pdf$/, '.debug.html')
      writeFileSync(debugPath, fullHtml, 'utf-8')
      console.log(`Debug HTML: ${debugPath}`)
    }

    let pdfBuffer = await htmlToPdf(fullHtml, pool, { lang, docType, subject }, paths)

    if (values.attach) {
      const attachPath = resolve(process.cwd(), values.attach)
      if (!existsSync(attachPath)) {
        console.error(`Attachment not found: ${attachPath}`)
        process.exit(1)
      }
      const merged = await attachPdf(pdfBuffer, readFileSync(attachPath))
      pdfBuffer = Buffer.from(merged)
    }

    writeFileSync(outputPath, pdfBuffer)
    console.log(`Done: ${outputPath}`)
  } catch (err) {
    if (err instanceof GeneratorError) {
      console.error(`error [${err.code}]: ${err.message}`)
    } else {
      console.error(err)
    }
    process.exit(1)
  } finally {
    await pool.close()
  }
}

main()
