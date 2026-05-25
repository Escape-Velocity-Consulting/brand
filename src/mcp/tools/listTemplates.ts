import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerContext } from '../shared/createServer.js'
import { runTool, successResult } from '../shared/toolResult.js'
import { TEMPLATE_REGISTRY } from '../../../templates.meta.js'

export function registerListTemplates(server: McpServer, ctx: ServerContext) {
  server.registerTool('list_templates', {
    title: 'List brand templates',
    description:
      'List all available templates with their metadata (output format, dimensions, required vars, tags). ' +
      'Use this to discover what templates exist before calling render_template.',
    inputSchema: {
      tag: z.string().optional().describe('Filter by tag (e.g. "document", "social", "linkedin").'),
    },
  }, async (args) => runTool(async () => {
    const tag = args.tag
    const templates = Object.entries(TEMPLATE_REGISTRY)
      .filter(([, meta]) => !tag || (meta.tags ?? []).includes(tag))
      .map(([key, meta]) => ({ key, ...meta }))

    // Also expose the old shape (categorized lists) for backward compatibility
    // with any agent that learned the v1 list_templates response.
    const documents: string[] = []
    const social: string[] = []
    const carousel: string[] = []
    for (const [key, meta] of Object.entries(TEMPLATE_REGISTRY)) {
      if (tag && !(meta.tags ?? []).includes(tag)) continue
      if ((meta.tags ?? []).includes('document')) documents.push(`templates/${key}.html`)
      else if (key.startsWith('social/')) social.push(`templates/${key}.html`)
      else if (key.startsWith('carousel/')) carousel.push(`templates/${key}.html`)
    }

    return successResult({
      templates,
      documents,
      social,
      carousel,
      brandDir: ctx.paths.brandDir,
    })
  }))
}
