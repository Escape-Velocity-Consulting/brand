import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../shared/createServer.js'
import { renderHtmlToPdf } from '../../core/render.js'
import { runTool, successResult } from '../shared/toolResult.js'
import { publishedItemToApi } from '../shared/publishedApi.js'

/**
 * Raw HTML → PDF generic primitive. Mirrors `render_html_to_png` (formerly
 * `render_image_html`) but for PDFs. Multi-page HTML is paginated naturally
 * by Playwright when a paper format is used (A4/Letter/etc).
 *
 * Use when:
 * - You've authored ad-hoc HTML (custom infographic, one-pager, mutated template)
 *   and want a PDF, not a PNG
 * - You don't fit one of the 5 branded document types (letter/offer/invoice/tos/report)
 *
 * For branded documents, use `render_template` with template='letter' (etc.) instead.
 */
export function registerRenderHtmlToPdf(server: McpServer, ctx: ServerContext) {
  server.registerTool('render_html_to_pdf', {
    title: 'Render raw HTML to PDF',
    description:
      'Render an inline HTML string to PDF. FONTS_URI + TOKENS_CSS are auto-injected; the HTML can use brand CSS vars (var(--color-terracotta), var(--font-body), etc.). ' +
      'Use this for ad-hoc PDFs or custom-designed pages. For standard branded documents (letter, offer, invoice, tos, report) use `render_template` with the appropriate template.',
    inputSchema: {
      html: z.string().describe('Raw HTML string to render.'),
      format: z.enum(['A4', 'A3', 'Letter', 'Legal']).optional().default('A4')
        .describe('Page format (auto-paginates if the HTML is long). Ignored if width+height are given.'),
      width: z.number().int().positive().optional().describe('Custom page width in pixels. Pair with height. Overrides format.'),
      height: z.number().int().positive().optional().describe('Custom page height in pixels. Pair with width. Overrides format.'),
      margin: z.object({
        top: z.string().optional(),
        right: z.string().optional(),
        bottom: z.string().optional(),
        left: z.string().optional(),
      }).optional().describe('CSS margins (e.g. {top: "12mm", right: "25mm"}). Defaults to 0 for custom dims, none for paper formats.'),
      landscape: z.boolean().optional().default(false),
      vars: z.record(z.string(), z.string()).optional().describe('Additional Nunjucks variables substituted into the HTML.'),
      outputPath: z.string().optional().describe('Local mode: where to write the PDF. Remote mode: filename hint for the download.'),
      title: z.string().optional().describe('Title for the published artifact (remote mode with persist: true).'),
      persist: z.boolean().optional().default(false).describe('Remote mode only: publish immediately and return a stable URL.'),
    },
  }, async (args) => runTool(async () => {
    let format: 'A4' | 'A3' | 'Letter' | 'Legal' | { width: number; height: number } | undefined
    if (args.width && args.height) {
      format = { width: args.width, height: args.height }
    } else {
      format = args.format
    }

    const buffer = await renderHtmlToPdf(
      { html: args.html, vars: args.vars },
      {
        format,
        margin: args.margin,
        landscape: !!args.landscape,
      },
      ctx.paths,
      ctx.pool,
    )

    const primaryFile = 'document.pdf'
    let bundleId = ''
    if (ctx.outputSink.kind === 'remote') {
      bundleId = ctx.outputSink.beginBundle({
        type: 'html-pdf',
        title: args.title ?? 'document',
        primaryFile,
      })
    }

    const result = await ctx.outputSink.write(buffer, {
      mime: 'application/pdf',
      suggestedName: primaryFile,
      requestedPath: args.outputPath,
      bundleRelativeName: primaryFile,
    })

    if (bundleId) ctx.outputSink.endBundle()

    let published: ReturnType<typeof publishedItemToApi> | undefined
    if (args.persist && bundleId && ctx.publishedStore && ctx.publicBaseUrl) {
      const item = ctx.publishedStore.publish(bundleId, { title: args.title, type: 'html-pdf' })
      published = publishedItemToApi(item, ctx.publicBaseUrl)
    }

    return successResult({ ...result, bundleId: bundleId || undefined, published })
  }))
}
