import { readFileSync, existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../shared/createServer.js'
import { CAROUSEL_FORMATS, renderCarousel, type CarouselSpec } from '../../core/carousel.js'
import type { WriteResult } from '../shared/outputSinks.js'
import { runTool, successResult } from '../shared/toolResult.js'
import { GeneratorError } from '../../core/errors.js'

const SlideSchema = z.object({
  template: z.string().describe('Path relative to brand dir, e.g. "templates/carousel/title.html".'),
  vars: z.record(z.string(), z.string()).optional(),
})

const SpecSchema = z.object({
  format: z.enum(Object.keys(CAROUSEL_FORMATS) as [string, ...string[]]).optional(),
  slides: z.array(SlideSchema).min(1),
})

export function registerRenderCarousel(server: McpServer, ctx: ServerContext) {
  server.registerTool('render_carousel', {
    title: 'Render brand carousel',
    description:
      'Render a multi-slide carousel from a spec. Produces a PDF plus one PNG per slide. ' +
      `Formats: ${Object.keys(CAROUSEL_FORMATS).join(', ')}.`,
    inputSchema: {
      spec: SpecSchema.optional(),
      specPath: z.string().optional().describe('Path to a JSON spec file (CWD-relative or absolute).'),
      outputPath: z.string().optional().describe('Local mode: output PDF path. Sidecar dir for slides is created alongside. Remote mode: filename hint.'),
      debug: z.boolean().optional().default(false).describe('Also write per-slide HTML alongside PNGs.'),
    },
  }, async (args) => runTool(async () => {
    let spec: CarouselSpec
    let specSourcePath: string | undefined
    if (args.spec) {
      spec = args.spec as CarouselSpec
    } else if (args.specPath) {
      const absSpec = resolve(process.cwd(), args.specPath)
      if (!existsSync(absSpec)) throw new GeneratorError('SPEC_NOT_FOUND', `Spec not found: ${absSpec}`)
      spec = JSON.parse(readFileSync(absSpec, 'utf-8'))
      specSourcePath = absSpec
    } else {
      throw new Error('Provide either spec or specPath')
    }

    const result = await renderCarousel({
      spec,
      debug: !!args.debug,
    }, ctx.paths, ctx.pool)

    // Compute filenames + (local-only) sidecar directory layout.
    const pdfFilename = args.outputPath ? basename(args.outputPath) : 'carousel.pdf'
    const sidecarStem = pdfFilename.replace(/\.pdf$/i, '')

    // Write PDF via sink.
    const pdf = await ctx.outputSink.write(result.pdfBuffer, {
      mime: 'application/pdf',
      suggestedName: pdfFilename,
      requestedPath: args.outputPath,
    })

    // In local mode the sidecar dir is dirname(pdf.path) / sidecarStem; in
    // remote mode each entry becomes its own independent signed URL.
    const sidecarDir = pdf.kind === 'path' ? join(dirname(pdf.path), sidecarStem) : undefined
    const localPathFor = (name: string) => sidecarDir ? join(sidecarDir, name) : undefined

    const slides: WriteResult[] = []
    const debugHtmls: WriteResult[] = []
    for (const slide of result.slides) {
      const num = String(slide.index).padStart(2, '0')
      const slideName = `slide-${num}.png`
      slides.push(await ctx.outputSink.write(slide.pngBuffer, {
        mime: 'image/png',
        suggestedName: slideName,
        requestedPath: localPathFor(slideName),
      }))
      if (slide.debugHtml) {
        const htmlName = `slide-${num}.html`
        debugHtmls.push(await ctx.outputSink.write(Buffer.from(slide.debugHtml, 'utf-8'), {
          mime: 'text/html',
          suggestedName: htmlName,
          requestedPath: localPathFor(htmlName),
        }))
      }
    }

    // Spec sidecar — captures what was rendered.
    const specBytes = Buffer.from(specSourcePath ? readFileSync(specSourcePath, 'utf-8') : JSON.stringify(spec, null, 2), 'utf-8')
    const specResult = await ctx.outputSink.write(specBytes, {
      mime: 'application/json',
      suggestedName: 'spec.json',
      requestedPath: localPathFor('spec.json'),
    })

    return successResult({
      pdf,
      slides,
      spec: specResult,
      debugHtmls: debugHtmls.length ? debugHtmls : undefined,
      slideCount: result.slides.length,
      width: result.width,
      height: result.height,
    })
  }))
}
