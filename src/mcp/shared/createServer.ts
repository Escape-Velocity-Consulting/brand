import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { BrowserPool } from '../../core/browserPool.js'
import { resolveBrandPaths, type BrandPaths } from '../../core/paths.js'
import { registerRenderDocument } from '../tools/renderDocument.js'
import { registerRenderImage } from '../tools/renderImage.js'
import { registerRenderImageHtml } from '../tools/renderImageHtml.js'
import { registerRenderCarousel } from '../tools/renderCarousel.js'
import { registerRenderPresentation } from '../tools/renderPresentation.js'
import { registerRenderTemplate } from '../tools/renderTemplate.js'
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
  version: '0.2.0',
}

/**
 * Build a configured McpServer with all brand tools registered. Transport is
 * the caller's responsibility (connect via stdio, HTTP, or in-memory).
 *
 * Tool surface in transition (Phase 3): the new consolidated surface
 * (render_template / render_html_to_png / render_html_to_pdf / render_slides)
 * runs alongside the legacy tools (render_image / render_document /
 * render_carousel / render_presentation / render_image_html). F5 will delete
 * the legacy tools once fixtures are migrated.
 */
export function createServer(ctx: ServerContext, info: ServerInfo = DEFAULT_INFO): McpServer {
  const server = new McpServer(info)
  // Legacy surface (kept for the duration of F4 transition):
  registerRenderDocument(server, ctx)
  registerRenderImage(server, ctx)
  registerRenderImageHtml(server, ctx)
  registerRenderCarousel(server, ctx)
  registerRenderPresentation(server, ctx)
  // New consolidated surface:
  registerRenderTemplate(server, ctx)
  registerRenderHtmlToPdf(server, ctx)
  registerRenderSlides(server, ctx)
  // Shared:
  registerListTemplates(server, ctx)
  registerGetTokens(server, ctx)
  return server
}

export { resolveBrandPaths, BrowserPool }
