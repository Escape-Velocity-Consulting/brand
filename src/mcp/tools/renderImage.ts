import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../server.js'
import { IMAGE_PRESETS, renderHtmlToPng, renderSvgToPng } from '../../core/image.js'
import { resolveOutputPath } from '../shared/resolveOutputPath.js'
import { runTool, successResult } from '../shared/toolResult.js'

export function registerRenderImage(server: McpServer, ctx: ServerContext) {
  server.registerTool('render_image', {
    title: 'Render brand image',
    description:
      'Render a PNG from a brand template (path under brand/templates/, e.g. "social/og.html") or any HTML/SVG file. ' +
      'For ideation with raw HTML strings, use render_image_html instead. ' +
      `Available presets: ${Object.keys(IMAGE_PRESETS).join(', ')}. Provide --preset OR width+height.`,
    inputSchema: {
      template: z.string().optional().describe('Path to template, relative to brand dir (e.g. "templates/social/og.html") or absolute.'),
      type: z.enum(['html', 'svg']).default('html').describe('Source type. SVG goes through sharp (no browser).'),
      preset: z.enum(Object.keys(IMAGE_PRESETS) as [string, ...string[]]).optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      vars: z.record(z.string(), z.string()).optional().describe('Nunjucks variables for the template.'),
      outputPath: z.string().describe('Output PNG path (CWD-relative or absolute).'),
    },
  }, async (args) => runTool(async () => {
    if (!args.template) throw new Error('template is required')

    let width: number, height: number
    if (args.preset) {
      const p = IMAGE_PRESETS[args.preset]
      width = p.width; height = p.height
    } else if (args.width && args.height) {
      width = args.width; height = args.height
    } else {
      throw new Error('Provide either preset or both width and height')
    }

    const inputPath = resolve(ctx.paths.brandDir, args.template)
    const outputAbs = resolveOutputPath(args.outputPath)

    let buffer: Buffer
    if (args.type === 'svg') {
      buffer = await renderSvgToPng({ svgPath: inputPath }, { width, height })
    } else {
      buffer = await renderHtmlToPng({ htmlPath: inputPath, vars: args.vars }, { width, height }, ctx.paths, ctx.pool)
    }
    writeFileSync(outputAbs, buffer)

    return successResult({
      path: outputAbs,
      bytes: buffer.length,
      mime: 'image/png',
      width,
      height,
    }, `Rendered ${args.template} → ${outputAbs} (${buffer.length} bytes, ${width}×${height})`)
  }))
}
