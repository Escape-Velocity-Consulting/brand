import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../server.js'
import { CAROUSEL_FORMATS, renderCarousel, type CarouselSpec } from '../../core/carousel.js'
import { resolveOutputPath } from '../shared/resolveOutputPath.js'
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
      'Render a multi-slide carousel from a spec. Produces a PDF plus a sidecar directory with one PNG per slide and spec.json. ' +
      `Formats: ${Object.keys(CAROUSEL_FORMATS).join(', ')}.`,
    inputSchema: {
      spec: SpecSchema.optional(),
      specPath: z.string().optional().describe('Path to a JSON spec file (CWD-relative or absolute).'),
      outputPath: z.string().describe('Output PDF path. Sidecar dir is created alongside with the same basename.'),
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

    const outputAbs = resolveOutputPath(args.outputPath)
    const sidecarDir = join(dirname(outputAbs), basename(outputAbs, extname(outputAbs)))
    mkdirSync(sidecarDir, { recursive: true })

    const result = await renderCarousel({
      spec,
      debug: !!args.debug,
    }, ctx.paths, ctx.pool)

    const slidePaths: string[] = []
    for (const slide of result.slides) {
      const num = String(slide.index).padStart(2, '0')
      const p = join(sidecarDir, `slide-${num}.png`)
      writeFileSync(p, slide.pngBuffer)
      slidePaths.push(p)
      if (slide.debugHtml) writeFileSync(join(sidecarDir, `slide-${num}.html`), slide.debugHtml, 'utf-8')
    }
    writeFileSync(outputAbs, result.pdfBuffer)

    if (specSourcePath) {
      copyFileSync(specSourcePath, join(sidecarDir, 'spec.json'))
    } else {
      writeFileSync(join(sidecarDir, 'spec.json'), JSON.stringify(spec, null, 2), 'utf-8')
    }

    return successResult({
      pdfPath: outputAbs,
      slidesDir: sidecarDir,
      slidePaths,
      slideCount: result.slides.length,
      width: result.width,
      height: result.height,
    }, `Rendered ${result.slides.length}-slide carousel → ${outputAbs}`)
  }))
}
