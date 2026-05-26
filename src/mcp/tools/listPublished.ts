import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../shared/createServer.js'
import { runTool, successResult } from '../shared/toolResult.js'
import { publishedItemToApi } from '../shared/publishedApi.js'

const BUNDLE_TYPES = ['deck', 'document', 'image', 'carousel', 'html-pdf', 'html-png'] as const

/**
 * List published items. Same data shape as `GET /api/published`; exposed as a
 * tool so an agent can browse the published library without an HTTP detour.
 */
export function registerListPublished(server: McpServer, ctx: ServerContext) {
  if (!ctx.publishedStore || !ctx.publicBaseUrl) return

  server.registerTool('list_published', {
    title: 'List published items',
    description:
      'Return all published items, optionally filtered by type (deck / document / image / carousel / html-pdf / html-png). ' +
      'Each item includes its ID, title, publishedAt timestamp, and canonical URLs for the primary file and thumbnail.',
    inputSchema: {
      type: z.enum(BUNDLE_TYPES).optional().describe('Filter to a single type.'),
    },
  }, async (args) => runTool(async () => {
    const items = ctx.publishedStore!.list({ type: args.type })
    const apiItems = items.map((i) => publishedItemToApi(i, ctx.publicBaseUrl!))
    return successResult({ items: apiItems, count: apiItems.length })
  }))
}
