import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../shared/createServer.js'
import { renderPresentation } from '../../core/presentation.js'
import { runTool, successResult } from '../shared/toolResult.js'
import { GeneratorError } from '../../core/errors.js'

export function registerRenderPresentation(server: McpServer, ctx: ServerContext) {
  server.registerTool('render_presentation', {
    title: 'Render brand presentation',
    description:
      'Render a slide-deck from markdown (slides separated by ===). Produces index.html viewer plus optional PDF and per-slide PNGs. ' +
      'Output is a directory (the deck is self-contained: components/, fonts/, index.html, optional <stem>.pdf, optional slides/*.png).',
    inputSchema: {
      markdown: z.string().optional().describe('Deck markdown. Required unless mdPath is given.'),
      mdPath: z.string().optional().describe('Path to a deck .md file.'),
      outputDir: z.string().describe('Directory to render into (CWD-relative or absolute).'),
      stem: z.string().optional().describe('PDF filename stem. Defaults to mdPath basename or "deck".'),
      ratio: z.enum(['16-9', '4-3']).optional().default('16-9'),
      theme: z.string().optional().default('cream'),
      title: z.string().optional(),
      pdf: z.boolean().optional().default(false),
      png: z.boolean().optional().default(false),
      debug: z.boolean().optional().default(false),
    },
  }, async (args) => runTool(async () => {
    let source: string | undefined
    let mdPath: string | undefined
    if (args.markdown !== undefined) {
      source = args.markdown
    } else if (args.mdPath) {
      const abs = resolve(process.cwd(), args.mdPath)
      if (!existsSync(abs)) throw new GeneratorError('INPUT_NOT_FOUND', `mdPath not found: ${abs}`)
      mdPath = abs
      source = readFileSync(abs, 'utf-8')
    } else {
      throw new Error('Provide either markdown or mdPath')
    }

    const outputDir = resolve(process.cwd(), args.outputDir)

    const result = await renderPresentation({
      source: args.markdown !== undefined ? source : undefined,
      mdPath,
      outputDir,
      stem: args.stem,
      ratio: args.ratio,
      theme: args.theme,
      title: args.title,
      pdf: !!args.pdf,
      png: !!args.png,
      debug: !!args.debug,
    }, ctx.paths, ctx.pool)

    return successResult({
      outputDir: result.outputDir,
      htmlPath: result.htmlPath,
      pdfPath: result.pdfPath ?? null,
      pngPaths: result.pngPaths ?? [],
      slideCount: result.slideCount,
    }, `Rendered presentation: ${result.slideCount} slides → ${result.outputDir}`)
  }))
}
