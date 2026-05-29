import { resolve, join } from 'node:path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../shared/createServer.js'
import { renderSlides, SLIDE_DIMENSIONS, type DimensionsInput } from '../../core/slides.js'
import { writeBundleEntry, type WriteResult } from '../shared/outputSinks.js'
import type { BundleType } from '../shared/bundleStore.js'
import { publishedItemToApi } from '../shared/publishedApi.js'
import { bakeQrForPublishedItem } from '../shared/qrInject.js'
import { runTool, successResult } from '../shared/toolResult.js'
import { log } from '../shared/logger.js'

const PageSchema = z.object({
  template: z.string().optional().describe('Path under brand/ to a full-page template (e.g. "templates/carousel/title.html").'),
  html: z.string().optional().describe('Raw HTML for this page (alternative to template).'),
  vars: z.record(z.string(), z.string()).optional(),
})

const DimensionsSchema = z.union([
  z.enum(Object.keys(SLIDE_DIMENSIONS) as [string, ...string[]]),
  z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
])

/**
 * Multi-page render: N pages → toggleable {viewer, pdf, pngs}.
 *
 * Two input modes:
 * - `markdown` (presentation-style, === -separated)  → supports viewer + pdf + pngs
 * - `pages`    (carousel-style, full-HTML per slide) → supports pdf + pngs (no viewer)
 *
 * On the HTTP transport, all writes for a single call are grouped into a
 * bundle (manifest persisted with the same 1h TTL as the artifacts themselves).
 * The response includes `bundleId` — pass that to `publish_artifact` to
 * promote the bundle to the persistent published store.
 *
 * Shortcut: pass `persist: true` to publish in one step. The response then
 * also includes the `published` field (canonical URL + ID).
 */
export function registerRenderSlides(server: McpServer, ctx: ServerContext) {
  server.registerTool('render_slides', {
    title: 'Render multi-page slide deck or carousel',
    description:
      'Render N slides → any combination of {viewer HTML, combined PDF, per-slide PNGs}. ' +
      'Use `markdown` (with === separators + @type/@bg directives) for presentation-style decks (supports viewer). ' +
      'Use `pages` (array of full-HTML pages or template+vars) for carousel-style multi-output (no viewer support). ' +
      `Dimension presets: ${Object.keys(SLIDE_DIMENSIONS).join(', ')}, or custom {width,height}. ` +
      'On HTTP transport, multi-file output is grouped into a bundle (returns `bundleId`). ' +
      'Pass `persist: true` to publish the result in one step (returns `published` with stable URL).',
    inputSchema: {
      markdown: z.string().optional().describe('Deck markdown with === slide separators. Mutually exclusive with pages.'),
      pages: z.array(PageSchema).optional().describe('Explicit pages (full-HTML or template+vars). Mutually exclusive with markdown.'),
      dimensions: DimensionsSchema,
      outputs: z.object({
        viewer: z.boolean().optional().default(false).describe('Self-contained HTML viewer (markdown mode only).'),
        pdf: z.boolean().optional().default(true).describe('Combined PDF.'),
        pngs: z.boolean().optional().default(true).describe('Per-slide PNGs (default: true).'),
      }),
      title: z.string().optional().describe('Deck title (used in viewer + as filename stem + as the published-item title).'),
      theme: z.string().optional().default('cream'),
      outputPath: z.string().optional().describe('Local mode: base filename / directory for outputs. Remote mode: filename hint.'),
      persist: z.boolean().optional().default(false).describe('HTTP transport only: also promote the resulting bundle to the persistent published store and return the stable URL.'),
    },
  }, async (args) => runTool(async () => {
    const dims = args.dimensions as DimensionsInput
    // On the remote transport the published viewer is served from the MCP
    // origin, so its @font-face rules must use an absolute same-origin URL
    // (the relative './fonts' path 404s once published — fonts aren't bundled).
    // Fonts are served by the /fonts route (see server-http.ts). Derived from
    // publicBaseUrl so it stays correct even if that ever carries a path prefix.
    const viewerFontsUri =
      ctx.outputSink.kind === 'remote' && ctx.publicBaseUrl
        ? `${ctx.publicBaseUrl.replace(/\/$/, '')}/fonts`
        : undefined
    const result = await renderSlides({
      markdown: args.markdown,
      pages: args.pages,
      dimensions: dims,
      outputs: args.outputs,
      title: args.title,
      theme: args.theme,
      viewerFontsUri,
    }, ctx.paths, ctx.pool)

    const stem = args.title?.toLowerCase().replace(/\s+/g, '-').slice(0, 40) || 'deck'

    // Build a sidecar dir hint for local-mode multi-file output.
    const isLocal = ctx.outputSink.kind === 'local'
    let bundleDir: string | undefined
    if (isLocal && args.outputPath) {
      // outputPath is treated as the bundle root in local mode
      bundleDir = resolve(process.cwd(), args.outputPath)
    } else if (isLocal) {
      bundleDir = resolve(process.cwd(), stem)
    }

    // Decide whether this render produces a bundle worth tracking. A bundle
    // exists when there's more than one output file (viewer + pdf, viewer + pngs,
    // pdf + pngs, etc.). For HTTP transport we open a bundle scope so the publish
    // flow can promote the whole set later.
    const outputCount =
      (result.viewer ? 1 : 0) + (result.pdf ? 1 : 0) + result.pngs.length + result.thumbs.length
    const isBundle = outputCount > 1 || result.pngs.length > 1 || !!result.viewer

    // Bundle metadata: deck for markdown mode, carousel for pages mode.
    const bundleType: BundleType = args.pages ? 'carousel' : 'deck'
    const pdfName = `${stem}.pdf`
    const primaryFile = result.viewer
      ? 'index.html'
      : result.pdf
        ? pdfName
        : result.pngs.length > 0
          ? join('slides', 'slide-01.png')
          : undefined
    // Prefer the small thumb as thumbnailFile so published cards use it directly.
    const thumbnailFile = result.thumbs.length > 0
      ? join('thumbs', 'thumb-01.png')
      : result.pngs.length > 0
        ? join('slides', 'slide-01.png')
        : undefined

    let bundleId = ''
    if (isBundle && ctx.outputSink.kind === 'remote') {
      bundleId = ctx.outputSink.beginBundle({
        type: bundleType,
        title: args.title ?? stem,
        primaryFile,
        thumbnailFile,
      })
    }

    let viewer: WriteResult | null = null
    if (result.viewer) {
      viewer = await writeBundleEntry(ctx.outputSink, Buffer.from(result.viewer.html, 'utf-8'), {
        relativeName: 'index.html',
        mime: 'text/html',
        bundleDir,
      })
    }

    let pdf: WriteResult | null = null
    if (result.pdf) {
      // For a multi-file bundle, route the PDF as a bundle entry. For pdf-only
      // (no pngs/viewer), treat it as the primary output.
      const isStandalone = !result.viewer && result.pngs.length === 0
      if (isStandalone) {
        pdf = await ctx.outputSink.write(result.pdf, {
          mime: 'application/pdf',
          suggestedName: pdfName,
          requestedPath: args.outputPath,
        })
      } else {
        pdf = await writeBundleEntry(ctx.outputSink, result.pdf, {
          relativeName: pdfName,
          mime: 'application/pdf',
          bundleDir,
        })
      }
    }

    const pngs: WriteResult[] = []
    for (let i = 0; i < result.pngs.length; i++) {
      const num = String(i + 1).padStart(2, '0')
      pngs.push(await writeBundleEntry(ctx.outputSink, result.pngs[i], {
        relativeName: join('slides', `slide-${num}.png`),
        mime: 'image/png',
        bundleDir,
      }))
    }

    const thumbs: WriteResult[] = []
    for (let i = 0; i < result.thumbs.length; i++) {
      const num = String(i + 1).padStart(2, '0')
      thumbs.push(await writeBundleEntry(ctx.outputSink, result.thumbs[i], {
        relativeName: join('thumbs', `thumb-${num}.png`),
        mime: 'image/png',
        bundleDir,
      }))
    }

    if (args.markdown) {
      await writeBundleEntry(ctx.outputSink, Buffer.from(args.markdown, 'utf-8'), {
        relativeName: 'source.md',
        mime: 'text/markdown',
        bundleDir,
      })
    }

    if (bundleId) {
      ctx.outputSink.endBundle()
    }

    // One-shot publish: skip the second round-trip when the caller already
    // knows they want the result persisted. This path MUST bake the QR the
    // same way publish_artifact does — otherwise persist-published decks ship
    // with a dead "Get the slides!" caption and a 404 qr-title.png (the
    // kCvrg5SeCa regression). Bake via the shared helper so the two can't drift.
    let published: ReturnType<typeof publishedItemToApi> | undefined
    let bakeStatus: { baked: boolean; reason?: string; warnings: string[] } | undefined
    if (args.persist && bundleId && ctx.publishedStore && ctx.publicBaseUrl) {
      const item = ctx.publishedStore.publish(bundleId, {
        title: args.title,
        type: bundleType,
      })
      bakeStatus = await bakeQrForPublishedItem({
        item,
        store: ctx.publishedStore,
        pool: ctx.pool,
        paths: ctx.paths,
        publicBaseUrl: ctx.publicBaseUrl,
        log,
      })
      // Re-fetch so meta.json updates from the bake (qr-title.png) are reflected.
      const fresh = ctx.publishedStore.get(item.id) ?? item
      published = publishedItemToApi(fresh, ctx.publicBaseUrl)
    }

    return successResult({
      viewer,
      pdf,
      pngs,
      thumbs,
      slideCount: result.slideCount,
      width: result.width,
      height: result.height,
      bundleId: bundleId || undefined,
      published,
      ...(bakeStatus ? { bakeStatus } : {}),
    })
  }))
}
