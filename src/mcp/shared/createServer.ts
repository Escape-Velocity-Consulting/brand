import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { BrowserPool } from '../../core/browserPool.js'
import { resolveBrandPaths, type BrandPaths } from '../../core/paths.js'
import { registerRenderDocument } from '../tools/renderDocument.js'
import { registerRenderImage } from '../tools/renderImage.js'
import { registerRenderImageHtml } from '../tools/renderImageHtml.js'
import { registerRenderCarousel } from '../tools/renderCarousel.js'
import { registerRenderPresentation } from '../tools/renderPresentation.js'
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
  version: '0.2.0',
}

/**
 * Build a configured McpServer with all 7 brand tools registered. Transport
 * is the caller's responsibility (connect via stdio, HTTP, or in-memory).
 */
export function createServer(ctx: ServerContext, info: ServerInfo = DEFAULT_INFO): McpServer {
  const server = new McpServer(info)
  registerRenderDocument(server, ctx)
  registerRenderImage(server, ctx)
  registerRenderImageHtml(server, ctx)
  registerRenderCarousel(server, ctx)
  registerRenderPresentation(server, ctx)
  registerListTemplates(server, ctx)
  registerGetTokens(server, ctx)
  return server
}

export { resolveBrandPaths, BrowserPool }
