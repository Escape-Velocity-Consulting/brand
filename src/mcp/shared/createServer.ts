import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { BrowserPool } from '../../core/browserPool.js'
import { resolveBrandPaths, type BrandPaths } from '../../core/paths.js'
import { registerRenderTemplate } from '../tools/renderTemplate.js'
import { registerRenderHtmlToPng } from '../tools/renderHtmlToPng.js'
import { registerRenderHtmlToPdf } from '../tools/renderHtmlToPdf.js'
import { registerRenderSlides } from '../tools/renderSlides.js'
import { registerListTemplates } from '../tools/listTemplates.js'
import { registerGetTokens } from '../tools/getTokens.js'
import type { OutputSink } from './outputSinks.js'

/**
 * Everything a tool handler needs at runtime. Both stdio and HTTP entrypoints
 * build one of these and pass it through `createServer`.
 */
export interface ServerContext {
  paths: BrandPaths
  pool: BrowserPool
  outputSink: OutputSink
}

export interface ServerInfo {
  name: string
  version: string
}

const DEFAULT_INFO: ServerInfo = {
  name: 'brand-engine',
  version: '0.3.0',
}

/**
 * Build a configured McpServer with the brand tool surface registered.
 * Transport is the caller's responsibility (stdio, HTTP, or in-memory).
 *
 * Tool surface (6 tools):
 * - render_template     — named template + vars/markdown → PNG or PDF (driven by templates.meta)
 * - render_html_to_png  — raw HTML → 1 PNG
 * - render_html_to_pdf  — raw HTML → 1 PDF (Playwright auto-paginates)
 * - render_slides       — N pages (markdown or full HTML) → toggleable {viewer, pdf, pngs}
 * - list_templates      — registry inventory (output, dims, required vars, tags)
 * - get_tokens          — parsed tokens.json
 */
export function createServer(ctx: ServerContext, info: ServerInfo = DEFAULT_INFO): McpServer {
  const server = new McpServer(info)
  registerRenderTemplate(server, ctx)
  registerRenderHtmlToPng(server, ctx)
  registerRenderHtmlToPdf(server, ctx)
  registerRenderSlides(server, ctx)
  registerListTemplates(server, ctx)
  registerGetTokens(server, ctx)
  return server
}

export { resolveBrandPaths, BrowserPool }
