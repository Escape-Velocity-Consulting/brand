import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../shared/createServer.js'
import { runTool, successResult } from '../shared/toolResult.js'

/**
 * Remove a published item by ID. The ID is the short base64 string visible on
 * the Brand Site card (and returned by publish_artifact / list_published).
 *
 * Returns `{ id, removed }`. `removed: false` means the ID didn't exist (no
 * error — idempotent).
 */
export function registerUnpublishArtifact(server: McpServer, ctx: ServerContext) {
  if (!ctx.publishedStore) return

  server.registerTool('unpublish_artifact', {
    title: 'Unpublish a previously-published item',
    description:
      'Remove a published item from the persistent store. Pass the ID visible on the Brand Site card ' +
      '(short base64 string, ~10 chars). Idempotent: removing an unknown ID is not an error.',
    inputSchema: {
      id: z.string().describe('The published item ID (shown on the Brand Site card).'),
    },
  }, async (args) => runTool(async () => {
    const result = ctx.publishedStore!.unpublish(args.id)
    return successResult(result as Record<string, unknown>)
  }))
}
