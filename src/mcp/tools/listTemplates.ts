import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../server.js'
import { runTool, successResult } from '../shared/toolResult.js'

function listHtmlIn(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => f.endsWith('.html') && !f.startsWith('_')).sort()
}

export function registerListTemplates(server: McpServer, ctx: ServerContext) {
  server.registerTool('list_templates', {
    title: 'List brand templates',
    description: 'List all available templates grouped by category (documents, social, carousel).',
    inputSchema: {},
  }, async (_args) => runTool(async () => {
    const docs = listHtmlIn(ctx.paths.templatesDir)
    const social = listHtmlIn(resolve(ctx.paths.templatesDir, 'social'))
    const carousel = listHtmlIn(resolve(ctx.paths.templatesDir, 'carousel'))
    return successResult({
      documents: docs.map((f) => `templates/${f}`),
      social: social.map((f) => `templates/social/${f}`),
      carousel: carousel.map((f) => `templates/carousel/${f}`),
      brandDir: ctx.paths.brandDir,
    })
  }))
}
