#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { BrowserPool } from '../core/browserPool.js'
import { resolveBrandPaths, type BrandPaths } from '../core/paths.js'
import { registerRenderDocument } from './tools/renderDocument.js'
import { registerRenderImage } from './tools/renderImage.js'
import { registerRenderImageHtml } from './tools/renderImageHtml.js'
import { registerRenderCarousel } from './tools/renderCarousel.js'
import { registerRenderPresentation } from './tools/renderPresentation.js'
import { registerListTemplates } from './tools/listTemplates.js'
import { registerGetTokens } from './tools/getTokens.js'

/**
 * Resolve the brand-root directory. Order of preference:
 *   1. $BRAND_DIR env var.
 *   2. Walk up from this file looking for a package.json whose name is "brand"
 *      OR which contains a tokens.ts + templates/ pair (the brand-repo signature).
 *   3. Two levels up from this file (dist/src/mcp → brand/).
 */
function resolveBrandDir(): string {
  if (process.env.BRAND_DIR) {
    const candidate = resolve(process.env.BRAND_DIR)
    if (!existsSync(candidate)) {
      throw new Error(`BRAND_DIR points to a non-existent path: ${candidate}`)
    }
    return candidate
  }

  const here = dirname(fileURLToPath(import.meta.url))
  let cur = here
  for (let i = 0; i < 8; i++) {
    const pkg = resolve(cur, 'package.json')
    if (existsSync(pkg)) {
      try {
        const meta = JSON.parse(readFileSync(pkg, 'utf-8'))
        if (meta.name === 'brand') return cur
      } catch {}
    }
    if (existsSync(resolve(cur, 'tokens.ts')) && existsSync(resolve(cur, 'templates'))) {
      return cur
    }
    const parent = dirname(cur)
    if (parent === cur) break
    cur = parent
  }

  throw new Error('Could not locate the brand directory. Set BRAND_DIR environment variable.')
}

export interface ServerContext {
  paths: BrandPaths
  pool: BrowserPool
}

async function main() {
  const brandDir = resolveBrandDir()
  const paths = resolveBrandPaths(brandDir)
  const pool = new BrowserPool()
  const ctx: ServerContext = { paths, pool }

  const server = new McpServer({
    name: 'brand-engine',
    version: '0.1.0',
  })

  registerRenderDocument(server, ctx)
  registerRenderImage(server, ctx)
  registerRenderImageHtml(server, ctx)
  registerRenderCarousel(server, ctx)
  registerRenderPresentation(server, ctx)
  registerListTemplates(server, ctx)
  registerGetTokens(server, ctx)

  const shutdown = async () => {
    try { await server.close() } catch {}
    try { await pool.close() } catch {}
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stderr is the only safe channel — stdout is the MCP transport
  console.error(`[brand-engine MCP] connected, brandDir=${brandDir}`)
}

main().catch((err) => {
  console.error('[brand-engine MCP] fatal:', err)
  process.exit(1)
})
