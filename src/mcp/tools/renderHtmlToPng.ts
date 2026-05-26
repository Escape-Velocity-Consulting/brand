import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../shared/createServer.js'
import { renderHtmlToPng } from '../../core/render.js'
import { runTool, successResult } from '../shared/toolResult.js'
import { publishedItemToApi } from '../shared/publishedApi.js'

/**
 * Raw HTML → PNG generic primitive. Pair tool to `render_html_to_pdf`.
 *
 * Use when:
 * - You've authored ad-hoc HTML (mutated template, custom layout, infographic)
 *   and want a PNG screenshot
 * - You don't fit one of the named templates in the registry
 *
 * For named templates, prefer `render_template`.
 */
export function registerRenderHtmlToPng(server: McpServer, ctx: ServerContext) {
  server.registerTool('render_html_to_png', {
    title: 'Render raw HTML to PNG',
    description:
      'Render an inline HTML string to PNG. FONTS_URI + TOKENS_CSS are auto-injected; the HTML can use brand CSS vars (var(--color-terracotta), var(--font-body), etc.). ' +
      'Use this for ad-hoc designs, mutated templates, or custom layouts. For named templates use `render_template` instead.',
    inputSchema: {
      html: z.string().describe('Raw HTML string to render.'),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      vars: z.record(z.string(), z.string()).optional().describe('Additional Nunjucks variables substituted into the HTML.'),
      outputPath: z.string().optional().describe('Local mode: where to write the PNG. Remote mode: filename hint for the download.'),
      title: z.string().optional().describe('Title for the published artifact (remote mode with persist: true).'),
      persist: z.boolean().optional().default(false).describe('Remote mode only: publish immediately and return a stable URL.'),
    },
  }, async (args) => runTool(async () => {
    const buffer = await renderHtmlToPng(
      { html: args.html, vars: args.vars },
      { width: args.width, height: args.height },
      ctx.paths,
      ctx.pool,
    )
    const primaryFile = 'image.png'
    let bundleId = ''
    if (ctx.outputSink.kind === 'remote') {
      bundleId = ctx.outputSink.beginBundle({
        type: 'html-png',
        title: args.title ?? 'image',
        primaryFile,
        thumbnailFile: primaryFile,
      })
    }

    const result = await ctx.outputSink.write(buffer, {
      mime: 'image/png',
      suggestedName: primaryFile,
      requestedPath: args.outputPath,
      bundleRelativeName: primaryFile,
    })

    if (bundleId) ctx.outputSink.endBundle()

    let published: ReturnType<typeof publishedItemToApi> | undefined
    if (args.persist && bundleId && ctx.publishedStore && ctx.publicBaseUrl) {
      const item = ctx.publishedStore.publish(bundleId, { title: args.title, type: 'html-png' })
      published = publishedItemToApi(item, ctx.publicBaseUrl)
    }

    return successResult({ ...result, width: args.width, height: args.height, bundleId: bundleId || undefined, published })
  }))
}
