import { existsSync, readFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../shared/createServer.js'
import {
  attachPdf,
  canonicalFilename,
  formatDate,
  htmlToPdf,
  loadCoverAssetFromPath,
  parseDate,
  renderDocumentHtml,
  validateForInvoice,
  type DocumentType,
  type Recipient,
} from '../../core/document.js'
import { mdToHtmlFromText } from '../../core/markdown.js'
import { renderHtmlToPng, renderHtmlToPdf } from '../../core/render.js'
import { GeneratorError } from '../../core/errors.js'
import { TEMPLATE_REGISTRY, getTemplateMeta } from '../../../templates.meta.js'
import { runTool, successResult } from '../shared/toolResult.js'
import { publishedItemToApi } from '../shared/publishedApi.js'
import type { BundleType } from '../shared/bundleStore.js'

const RecipientSchema = z.object({
  name: z.string().optional(),
  company: z.string().optional(),
  address: z.string().optional().describe('Multi-line allowed (real newlines).'),
  uid: z.string().optional().describe('EU VAT ID for business clients (invoice).'),
  private: z.boolean().optional().describe('Private customer acknowledgement (invoice, no VAT ID).'),
  extra_lines: z.array(z.string()).optional(),
})

const DOCUMENT_TEMPLATES = new Set(['letter', 'offer', 'invoice', 'tos', 'report'])

/**
 * Unified template-driven render tool. Takes a template name + vars (+ optional
 * markdown body), looks up the template's metadata, and dispatches to the
 * right rendering path (PNG via Playwright screenshot OR PDF via the document
 * pipeline).
 *
 * Replaces the old `render_image` (template-based PNGs) + `render_document`
 * (markdown → branded PDF) tools.
 */
export function registerRenderTemplate(server: McpServer, ctx: ServerContext) {
  server.registerTool('render_template', {
    title: 'Render a brand template',
    description:
      'Render a named brand template with variables and (optionally) a markdown body. ' +
      'Output format (PNG or PDF) and default dimensions are determined by the template registry — ' +
      'call `list_templates` to see what\'s available. ' +
      'Document templates (letter/offer/invoice/tos/report) accept a markdown body + structured args (recipient, date, ref, subject). ' +
      'Social/carousel templates accept Nunjucks vars (TITLE, SUBTITLE, EYEBROW, etc.).',
    inputSchema: {
      template: z.string().describe('Template key (e.g. "letter", "social/og", "carousel/title"). See list_templates.'),
      vars: z.record(z.string(), z.string()).optional().describe('Nunjucks variables to substitute into the template.'),
      markdown: z.string().optional().describe('Body markdown (only for templates with `acceptsBody: true`).'),

      // Document-specific (only used for document templates):
      recipient: RecipientSchema.optional(),
      date: z.string().optional().describe('ISO YYYY-MM-DD or formatted (e.g. "20. Mai 2026"). Defaults to today.'),
      ref: z.string().optional().describe('Reference number (e.g. invoice number).'),
      subject: z.string().optional().describe('Subject line. Defaults to the first H1 in the markdown body.'),
      eyebrow: z.string().optional(),
      coverPath: z.string().optional().describe('Path to a cover image/SVG (report type).'),
      confidential: z.boolean().optional().default(false),
      lang: z.enum(['de', 'en']).optional().default('de'),
      attachPath: z.string().optional().describe('PDF to append at the end (documents only).'),

      // Optional overrides:
      width: z.number().int().positive().optional().describe('Override the template\'s default width (PNG templates) or custom PDF page width in px.'),
      height: z.number().int().positive().optional().describe('Override the template\'s default height (PNG templates) or custom PDF page height in px.'),
      format: z.enum(['A4', 'A3', 'Letter', 'Legal']).optional().describe('Override page format for PDF templates. Width+height takes priority.'),
      outputPath: z.string().optional().describe('Local mode: output path. Remote mode: filename hint.'),
      title: z.string().optional().describe('Title for the published artifact (remote mode with persist: true).'),
      persist: z.boolean().optional().default(false).describe('Remote mode only: publish immediately and return a stable URL.'),
    },
  }, async (args) => runTool(async () => {
    const openBundle = (type: BundleType, primaryFile: string, thumbnailFile?: string) => {
      if (ctx.outputSink.kind !== 'remote') return ''
      const bundleTitle = args.title ?? args.subject ?? args.template
      return ctx.outputSink.beginBundle({ type, title: bundleTitle, primaryFile, thumbnailFile })
    }
    const closeAndPublish = (bundleId: string, type: BundleType) => {
      if (bundleId) ctx.outputSink.endBundle()
      if (args.persist && bundleId && ctx.publishedStore && ctx.publicBaseUrl) {
        const item = ctx.publishedStore.publish(bundleId, { title: args.title ?? args.subject ?? args.template, type })
        return publishedItemToApi(item, ctx.publicBaseUrl)
      }
      return undefined
    }

    const meta = (() => {
      try { return getTemplateMeta(args.template) }
      catch (err) { throw new GeneratorError('UNKNOWN_TEMPLATE', (err as Error).message) }
    })()

    // ── PNG templates ──────────────────────────────────────────────────────
    if (meta.output === 'png') {
      if (!meta.dims) throw new GeneratorError('TEMPLATE_META_INVALID', `Template ${args.template} declares output=png but no dims`)
      const width = args.width ?? meta.dims.width
      const height = args.height ?? meta.dims.height

      const templatePath = resolve(ctx.paths.templatesDir, `${args.template.replace(/^templates\//, '')}.html`)
      // Also try the exact path the registry key implies (templates/ prefix is implicit)
      const tplPath = existsSync(templatePath)
        ? templatePath
        : resolve(ctx.paths.brandDir, 'templates', `${args.template}.html`)
      if (!existsSync(tplPath)) {
        throw new GeneratorError('TEMPLATE_FILE_NOT_FOUND', `Template file not found: ${tplPath}`)
      }

      // If the template accepts a markdown body, pre-render it into vars.CONTENT (and BODY).
      let vars: Record<string, string> = { ...(args.vars ?? {}) }
      if (meta.acceptsBody && args.markdown) {
        const { body } = mdToHtmlFromText(args.markdown, process.cwd(), false)
        vars.CONTENT = body
        vars.BODY = body
      }

      const buffer = await renderHtmlToPng(
        { htmlPath: tplPath, vars },
        { width, height },
        ctx.paths,
        ctx.pool,
      )

      const suggested = `${basename(args.template)}.png`
      const bundleId = openBundle('image', suggested, suggested)
      const result = await ctx.outputSink.write(buffer, {
        mime: 'image/png',
        suggestedName: suggested,
        requestedPath: args.outputPath,
        bundleRelativeName: suggested,
      })
      const published = closeAndPublish(bundleId, 'image')
      return successResult({ ...result, template: args.template, width, height, bundleId: bundleId || undefined, published })
    }

    // ── PDF templates ──────────────────────────────────────────────────────
    if (meta.output === 'pdf') {
      // Document-type PDFs go through the full document pipeline (markdown body
      // → renderDocumentHtml → htmlToPdf with branded footer).
      if (DOCUMENT_TEMPLATES.has(args.template)) {
        const docType = args.template as DocumentType
        const lang = args.lang ?? 'de'

        if (!args.markdown) throw new GeneratorError('MISSING_BODY', `Template ${args.template} requires a markdown body`)
        const recipient: Recipient | null = args.recipient ?? null

        if (docType === 'invoice') {
          const err = validateForInvoice(recipient, false)
          if (err) throw new GeneratorError('INVOICE_VALIDATION', err)
        }

        const parsedDate = args.date ? parseDate(args.date) : null
        const effectiveDate = parsedDate ?? new Date()
        const dateStr = args.date && parsedDate
          ? formatDate(parsedDate, lang)
          : (args.date && !parsedDate ? args.date : formatDate(new Date(), lang))

        const { body, title } = mdToHtmlFromText(args.markdown, process.cwd(), docType === 'tos')
        const subject = args.subject || title || undefined
        const inputStem = subject ? subject.toLowerCase().replace(/\s+/g, '-').slice(0, 40) : 'document'

        const derivedFilename = canonicalFilename({
          docType, ref: args.ref, date: effectiveDate, recipient, subject, inputStem,
        })

        const coverHtml = args.coverPath
          ? loadCoverAssetFromPath(resolve(process.cwd(), args.coverPath))
          : undefined

        const fullHtml = renderDocumentHtml({
          bodyHtml: body, title, type: docType, recipient,
          date: dateStr, ref: args.ref, subject, eyebrow: args.eyebrow,
          coverHtml, confidential: !!args.confidential, lang,
        }, ctx.paths)

        let pdfBuffer = await htmlToPdf(fullHtml, ctx.pool, { lang, docType, subject }, ctx.paths)

        if (args.attachPath) {
          const attachAbs = resolve(process.cwd(), args.attachPath)
          if (!existsSync(attachAbs)) throw new GeneratorError('ATTACHMENT_NOT_FOUND', `Attachment not found: ${attachAbs}`)
          const merged = await attachPdf(pdfBuffer, readFileSync(attachAbs))
          pdfBuffer = Buffer.from(merged)
        }

        const bundleId = openBundle('document', derivedFilename)
        const result = await ctx.outputSink.write(pdfBuffer, {
          mime: 'application/pdf',
          suggestedName: derivedFilename,
          requestedPath: args.outputPath,
          bundleRelativeName: derivedFilename,
        })
        const published = closeAndPublish(bundleId, 'document')
        return successResult({
          ...result,
          template: args.template,
          subject: subject ?? null,
          date: dateStr,
          bundleId: bundleId || undefined,
          published,
        })
      }

      // Generic non-document PDF templates: render the template HTML through
      // Nunjucks (with optional markdown body), then feed to renderHtmlToPdf
      // using the format/margin/footer from template metadata.
      const tplPath = resolve(ctx.paths.templatesDir, `${args.template.replace(/^templates\//, '')}.html`)
      const tplPathAlt = resolve(ctx.paths.brandDir, 'templates', `${args.template}.html`)
      const finalTplPath = existsSync(tplPath) ? tplPath : tplPathAlt
      if (!existsSync(finalTplPath)) {
        throw new GeneratorError('TEMPLATE_FILE_NOT_FOUND', `Template file not found: ${finalTplPath}`)
      }

      let vars: Record<string, string> = { ...(args.vars ?? {}) }
      if (meta.acceptsBody && args.markdown) {
        const { body } = mdToHtmlFromText(args.markdown, process.cwd(), false)
        vars.CONTENT = body
        vars.BODY = body
      }

      // Resolve format: explicit override > template metadata > A4 default.
      let format: 'A4' | 'A3' | 'Letter' | 'Legal' | { width: number; height: number } | undefined
      if (args.width && args.height) {
        format = { width: args.width, height: args.height }
      } else if (args.format) {
        format = args.format
      } else if (meta.format) {
        format = meta.format
      }

      const buffer = await renderHtmlToPdf(
        { htmlPath: finalTplPath, vars },
        {
          format,
          margin: meta.margin,
        },
        ctx.paths,
        ctx.pool,
      )

      const suggested = `${basename(args.template)}.pdf`
      const bundleId = openBundle('document', suggested)
      const result = await ctx.outputSink.write(buffer, {
        mime: 'application/pdf',
        suggestedName: suggested,
        requestedPath: args.outputPath,
        bundleRelativeName: suggested,
      })
      const published = closeAndPublish(bundleId, 'document')
      return successResult({ ...result, template: args.template, bundleId: bundleId || undefined, published })
    }

    throw new GeneratorError('UNKNOWN_OUTPUT', `Template "${args.template}" has unknown output type: ${meta.output}`)
  }))
}
