import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../server.js'
import { loadTokensJson } from '../../core/tokens.js'
import { runTool, successResult } from '../shared/toolResult.js'

export function registerGetTokens(server: McpServer, ctx: ServerContext) {
  server.registerTool('get_tokens', {
    title: 'Get brand tokens',
    description: 'Return the parsed brand tokens (color, typography, spacing) from tokens.json.',
    inputSchema: {},
  }, async (_args) => runTool(async () => {
    const tokens = loadTokensJson(ctx.paths)
    return successResult({ tokens: tokens as Record<string, unknown> })
  }))
}
