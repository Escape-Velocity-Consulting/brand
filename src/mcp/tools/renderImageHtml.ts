import { writeFileSync } from 'node:fs'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../server.js'
import { renderHtmlToPng } from '../../core/image.js'
import { resolveOutputPath } from '../shared/resolveOutputPath.js'
import { runTool, successResult } from '../shared/toolResult.js'

export function registerRenderImageHtml(server: McpServer, ctx: ServerContext) {
  server.registerTool('render_image_html', {
    title: 'Render raw HTML to PNG',
    description:
      'Render an inline HTML string to PNG. Used for the ideation flow (prototype HTML → screenshot → iterate). ' +
      'The {{ FONTS_URI }} Nunjucks variable is auto-injected with a file:// URI to brand/fonts/.',
    inputSchema: {
      html: z.string().describe('Raw HTML string to render.'),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      vars: z.record(z.string(), z.string()).optional().describe('Additional Nunjucks variables.'),
      outputPath: z.string().describe('Output PNG path (CWD-relative or absolute).'),
    },
  }, async (args) => runTool(async () => {
    const outputAbs = resolveOutputPath(args.outputPath)
    const buffer = await renderHtmlToPng(
      { html: args.html, vars: args.vars },
      { width: args.width, height: args.height },
      ctx.paths,
      ctx.pool,
    )
    writeFileSync(outputAbs, buffer)
    return successResult({
      path: outputAbs,
      bytes: buffer.length,
      mime: 'image/png',
      width: args.width,
      height: args.height,
    }, `Rendered HTML → ${outputAbs} (${buffer.length} bytes, ${args.width}×${args.height})`)
  }))
}
