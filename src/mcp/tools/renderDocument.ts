import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../server.js'
import {
  attachPdf,
  canonicalFilename,
  formatDate,
  htmlToPdf,
  loadCoverAssetFromPath,
  parseDate,
  renderDocumentHtml,
  TEMPLATE_MAP,
  validateForInvoice,
  type DocumentType,
  type Recipient,
} from '../../core/document.js'
import { mdToHtmlFromText } from '../../core/markdown.js'
import { resolveOutputPath } from '../shared/resolveOutputPath.js'
import { runTool, successResult } from '../shared/toolResult.js'
import { GeneratorError } from '../../core/errors.js'

const RecipientSchema = z.object({
  name: z.string().optional(),
  company: z.string().optional(),
  address: z.string().optional().describe('Multi-line allowed (real newlines).'),
  uid: z.string().optional().describe('EU VAT ID for business clients (invoice).'),
  private: z.boolean().optional().describe('Private customer acknowledgement (invoice, no VAT ID).'),
  extra_lines: z.array(z.string()).optional(),
})

export function registerRenderDocument(server: McpServer, ctx: ServerContext) {
  server.registerTool('render_document', {
    title: 'Render brand PDF document',
    description:
      'Render a branded PDF (letter, offer, invoice, tos, report) from markdown. ' +
      'Either pass markdown inline or via mdPath. Invoice requires a structured recipient (name+address+uid or private).',
    inputSchema: {
      type: z.enum(['letter', 'offer', 'invoice', 'tos', 'report']),
      markdown: z.string().optional().describe('Markdown body. Required unless mdPath is given.'),
      mdPath: z.string().optional().describe('Path to a .md file (CWD-relative or absolute). Used to resolve relative image refs.'),
      recipient: RecipientSchema.optional(),
      date: z.string().optional().describe('ISO YYYY-MM-DD or "20. Mai 2026". Defaults to today.'),
      ref: z.string().optional().describe('Reference number (e.g. invoice number).'),
      subject: z.string().optional().describe('Defaults to the first H1.'),
      eyebrow: z.string().optional(),
      coverPath: z.string().optional().describe('Path to a cover image/SVG (report type).'),
      confidential: z.boolean().optional().default(false),
      lang: z.enum(['de', 'en']).optional().default('de'),
      noAbout: z.boolean().optional().default(false),
      noSignature: z.boolean().optional().default(false),
      customTemplatePath: z.string().optional().describe('Override the default template file.'),
      attachPath: z.string().optional().describe('PDF to append at the end.'),
      outputPath: z.string().optional().describe('Output PDF path. If omitted, derived from doc type + recipient + date.'),
      outputDir: z.string().optional().describe('Used with derived filename. Defaults to CWD.'),
    },
  }, async (args) => runTool(async () => {
    const docType = args.type as DocumentType
    const lang = args.lang ?? 'de'

    // Source markdown
    let mdText: string
    let mdDir: string
    let inputStem: string
    if (args.markdown !== undefined) {
      mdText = args.markdown
      mdDir = process.cwd()
      inputStem = args.subject ? args.subject.toLowerCase().replace(/\s+/g, '-').slice(0, 40) : 'document'
    } else if (args.mdPath) {
      const absMd = resolve(process.cwd(), args.mdPath)
      if (!existsSync(absMd)) throw new GeneratorError('INPUT_NOT_FOUND', `mdPath not found: ${absMd}`)
      mdText = readFileSync(absMd, 'utf-8')
      mdDir = resolve(absMd, '..')
      inputStem = basename(absMd, '.md')
    } else {
      throw new Error('Provide either markdown or mdPath')
    }

    const recipient: Recipient | null = args.recipient ?? null

    if (docType === 'invoice') {
      const err = validateForInvoice(recipient, false)
      if (err) throw new GeneratorError('INVOICE_VALIDATION', err)
    }

    if (!args.customTemplatePath && !TEMPLATE_MAP[docType]) {
      throw new GeneratorError('UNKNOWN_DOC_TYPE', `Unknown document type: ${docType}`)
    }

    const parsedDate = args.date ? parseDate(args.date) : null
    const effectiveDate = parsedDate ?? new Date()
    const dateStr = args.date && parsedDate
      ? formatDate(parsedDate, lang)
      : (args.date && !parsedDate ? args.date : formatDate(new Date(), lang))

    const { body, title } = mdToHtmlFromText(mdText, mdDir, docType === 'tos')
    const subject = args.subject || title || undefined

    // Output path
    let outputAbs: string
    if (args.outputPath) {
      outputAbs = resolveOutputPath(args.outputPath)
    } else {
      const baseDir = args.outputDir ? resolve(process.cwd(), args.outputDir) : process.cwd()
      const filename = canonicalFilename({
        docType, ref: args.ref, date: effectiveDate, recipient, subject, inputStem,
      })
      outputAbs = resolveOutputPath(resolve(baseDir, filename))
    }

    const coverHtml = args.coverPath
      ? loadCoverAssetFromPath(resolve(process.cwd(), args.coverPath))
      : undefined
    const customTemplatePath = args.customTemplatePath
      ? resolve(process.cwd(), args.customTemplatePath)
      : undefined

    const fullHtml = renderDocumentHtml({
      bodyHtml: body, title, type: docType, recipient,
      date: dateStr, ref: args.ref, subject, eyebrow: args.eyebrow,
      coverHtml, confidential: !!args.confidential, lang,
      showAbout: !args.noAbout, showSignature: !args.noSignature,
      customTemplatePath,
    }, ctx.paths)

    let pdfBuffer = await htmlToPdf(fullHtml, ctx.pool, { lang, docType, subject })

    if (args.attachPath) {
      const attachAbs = resolve(process.cwd(), args.attachPath)
      if (!existsSync(attachAbs)) throw new GeneratorError('ATTACHMENT_NOT_FOUND', `Attachment not found: ${attachAbs}`)
      const merged = await attachPdf(pdfBuffer, readFileSync(attachAbs))
      pdfBuffer = Buffer.from(merged)
    }

    writeFileSync(outputAbs, pdfBuffer)

    return successResult({
      path: outputAbs,
      bytes: pdfBuffer.length,
      mime: 'application/pdf',
      type: docType,
      subject: subject ?? null,
      date: dateStr,
    }, `Rendered ${docType} → ${outputAbs} (${pdfBuffer.length} bytes)`)
  }))
}
