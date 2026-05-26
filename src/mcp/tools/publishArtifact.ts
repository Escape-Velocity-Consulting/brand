import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../shared/createServer.js'
import { runTool, successResult, errorResult } from '../shared/toolResult.js'
import { publishedItemToApi } from '../shared/publishedApi.js'

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
    },
  }, async (args) => runTool(async () => {
    try {
      const item = ctx.publishedStore!.publish(args.bundleId, {
        title: args.title,
        type: args.type,
      })
      return successResult({ ...publishedItemToApi(item, ctx.publicBaseUrl!) })
    } catch (err) {
      return errorResult(err)
    }
  }))
}
