import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../shared/createServer.js'
import { renderHtmlToPng } from '../../core/image.js'
import { runTool, successResult } from '../shared/toolResult.js'

export function registerRenderImageHtml(server: McpServer, ctx: ServerContext) {
  server.registerTool('render_image_html', {
    title: 'Render raw HTML to PNG',
    description:
      'Render an inline HTML string to PNG. Used for the ideation flow (prototype HTML → screenshot → iterate). ' +
      'The {{ FONTS_URI }} and {{ TOKENS_CSS }} Nunjucks variables are auto-injected.',
    inputSchema: {
      html: z.string().describe('Raw HTML string to render.'),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      vars: z.record(z.string(), z.string()).optional().describe('Additional Nunjucks variables.'),
      outputPath: z.string().optional().describe('Local mode: where to write the PNG. Remote mode: filename hint for the download.'),
    },
  }, async (args) => runTool(async () => {
    const buffer = await renderHtmlToPng(
      { html: args.html, vars: args.vars },
      { width: args.width, height: args.height },
      ctx.paths,
      ctx.pool,
    )
    const result = await ctx.outputSink.write(buffer, {
      mime: 'image/png',
      suggestedName: 'image.png',
      requestedPath: args.outputPath,
    })
    return successResult({ ...result, width: args.width, height: args.height })
  }))
}
