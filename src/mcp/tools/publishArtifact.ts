import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../shared/createServer.js'
import { runTool, successResult, errorResult } from '../shared/toolResult.js'
import { publishedItemToApi } from '../shared/publishedApi.js'
import { bakeQrIntoPublishedDeck } from '../shared/qrInject.js'
import { log } from '../shared/logger.js'

const BUNDLE_TYPES = ['deck', 'document', 'image', 'carousel', 'html-pdf', 'html-png'] as const

/**
 * Promote a bundle from the ephemeral artifact store to the persistent
 * published store. Caller supplies the bundleId returned by a recent render
 * (decks, carousels, documents — anything that produces multiple files).
 *
 * Returns the new published ID + a canonical URL the user can share / link to
 * from the Brand Site. The same ID is what the user references in chat to
 * unpublish later ("unpublish aB3xY9zK1m").
 */
export function registerPublishArtifact(server: McpServer, ctx: ServerContext) {
  if (!ctx.publishedStore || !ctx.publicBaseUrl) return

  server.registerTool('publish_artifact', {
    title: 'Publish a rendered bundle to the persistent published store',
    description:
      'Move a recently-rendered bundle (decks, carousels, documents — anything multi-file) from the ' +
      'ephemeral 1h-TTL artifact store to the persistent published store. The bundle becomes available ' +
      'at a stable URL and surfaces on the Brand Site at /brand/decks/ (or the relevant section). ' +
      'Pass the `bundleId` returned by render_slides / render_template / etc. Optional `title` and `type` ' +
      'override the auto-derived values.',
    inputSchema: {
      bundleId: z.string().describe('The bundleId from a recent render response (top-level field).'),
      title: z.string().optional().describe('Override the bundle\'s auto-derived title (shown on cards + viewer).'),
      type: z.enum(BUNDLE_TYPES).optional().describe('Override the bundle\'s inferred type. Drives which Brand Site section the item appears in.'),
      bakeQr: z.boolean().optional().describe('Auto-bake a QR code (pointing to the detail-page URL) onto the title slide. Defaults to true for decks. Pass false to skip.'),
    },
  }, async (args) => runTool(async () => {
    try {
      const item = ctx.publishedStore!.publish(args.bundleId, {
        title: args.title,
        type: args.type,
      })

      // Best-effort QR bake: default on for decks. Failure logs but never aborts
      // the publish — the deck is already on disk and reachable; only the QR
      // would be missing. Outcome is surfaced to the caller via `bakeStatus`
      // so silent regressions become visible.
      let bakeStatus: { baked: boolean; reason?: string; warnings: string[] } | undefined
      const bakeQr = args.bakeQr ?? (item.type === 'deck')
      if (bakeQr && item.type === 'deck') {
        const itemDir = ctx.publishedStore!.getItemDir(item.id)
        if (itemDir) {
          try {
            const detailUrl = `${ctx.publicBaseUrl!.replace(/\/+$/, '')}/published/${item.id}`
            const result = await bakeQrIntoPublishedDeck({
              itemDir,
              detailUrl,
              pool: ctx.pool,
              paths: ctx.paths,
            })
            bakeStatus = { baked: result.baked, reason: result.reason, warnings: result.warnings }
            if (result.baked) {
              ctx.publishedStore!.refreshMeta(item.id, [
                { relativeName: 'qr-title.png', filename: 'qr-title.png', mime: 'image/png' },
              ])
              log('qr_bake_ok', { id: item.id, added: result.added, updated: result.updated, warnings: result.warnings.length })
            } else {
              log('qr_bake_skip', { id: item.id, reason: result.reason })
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            bakeStatus = { baked: false, reason: 'exception', warnings: [msg] }
            log('qr_bake_fail', { id: item.id, err: err instanceof Error ? err : String(err) })
          }
        }
      }

      // Re-fetch the item so meta.json updates from the bake are reflected.
      const fresh = ctx.publishedStore!.get(item.id) ?? item
      const apiItem = publishedItemToApi(fresh, ctx.publicBaseUrl!)
      return successResult({ ...apiItem, ...(bakeStatus ? { bakeStatus } : {}) })
    } catch (err) {
      return errorResult(err)
    }
  }))
}
