import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../shared/createServer.js'
import { renderPresentation } from '../../core/presentation.js'
import type { WriteResult } from '../shared/outputSinks.js'
import { runTool, successResult } from '../shared/toolResult.js'
import { GeneratorError } from '../../core/errors.js'

export function registerRenderPresentation(server: McpServer, ctx: ServerContext) {
  server.registerTool('render_presentation', {
    title: 'Render brand presentation',
    description:
      'Render a slide-deck from markdown (slides separated by ===). Produces index.html viewer plus optional PDF and per-slide PNGs. ' +
      'In local mode, output is a self-contained directory (components/, fonts/, index.html, optional <stem>.pdf, optional slides/*.png). ' +
      'In remote mode, each file is returned as a signed download URL.',
    inputSchema: {
      markdown: z.string().optional().describe('Deck markdown. Required unless mdPath is given.'),
      mdPath: z.string().optional().describe('Path to a deck .md file.'),
      outputDir: z.string().optional().describe('Local mode: directory to render into (CWD-relative or absolute). Remote mode: ignored (server uses a temp dir).'),
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

    const isLocal = ctx.outputSink.kind === 'local'

    // Determine the directory the core should write into.
    // Local mode: honour args.outputDir (resolved from CWD) — the deck lands there.
    // Remote mode: use a server-side temp dir, then write each file through the sink.
    let effectiveOutputDir: string
    let cleanupDir: string | null = null

    if (isLocal) {
      if (!args.outputDir) throw new Error('outputDir is required in local mode')
      effectiveOutputDir = resolve(process.cwd(), args.outputDir)
    } else {
      effectiveOutputDir = resolve(tmpdir(), `brand-mcp-pres-${randomBytes(6).toString('hex')}`)
      cleanupDir = effectiveOutputDir
    }

    let html!: WriteResult
    let pdf: WriteResult | null = null
    const slides: WriteResult[] = []
    let slideCount = 0

    try {
      const result = await renderPresentation({
        source: args.markdown !== undefined ? source : undefined,
        mdPath,
        outputDir: effectiveOutputDir,
        stem: args.stem,
        ratio: args.ratio,
        theme: args.theme,
        title: args.title,
        pdf: !!args.pdf,
        png: !!args.png,
        debug: !!args.debug,
      }, ctx.paths, ctx.pool)

      slideCount = result.slideCount

      // Route each output through the sink.
      // Local mode: the core already wrote the files; we read them back so the
      //   sink can return a canonical WriteResult (it writes to the same path).
      // Remote mode: read from the temp dir and upload to the artifact store.
      const writeFile = async (absPath: string, mime: string, suggestedName: string): Promise<WriteResult> => {
        if (isLocal) {
          const size = statSync(absPath).size
          return { kind: 'path', path: absPath, bytes: size, mime, filename: basename(absPath) }
        }
        const buffer = readFileSync(absPath)
        return ctx.outputSink.write(buffer, { mime, suggestedName })
      }

      html = await writeFile(result.htmlPath, 'text/html', 'index.html')

      if (result.pdfPath) {
        const stem = args.stem ?? (mdPath ? basename(mdPath, '.md') : 'deck')
        pdf = await writeFile(result.pdfPath, 'application/pdf', `${stem}.pdf`)
      }

      if (result.pngPaths) {
        for (const pngPath of result.pngPaths) {
          slides.push(await writeFile(pngPath, 'image/png', basename(pngPath)))
        }
      }
    } finally {
      if (cleanupDir) {
        try { rmSync(cleanupDir, { recursive: true, force: true }) } catch { /* best-effort */ }
      }
    }

    return successResult({
      html,
      pdf: pdf ?? null,
      slides,
      slideCount,
    }, `Rendered presentation: ${slideCount} slides`)
  }))
}
