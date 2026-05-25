#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { BrowserPool } from '../core/browserPool.js'
import { resolveBrandPaths } from '../core/paths.js'
import { createServer, type ServerContext } from './shared/createServer.js'
import { LocalOutputSink } from './shared/outputSinks.js'
import { resolveBrandDir } from './shared/resolveBrandDir.js'

async function main() {
  const brandDir = resolveBrandDir(import.meta.url)
  const paths = resolveBrandPaths(brandDir)
  const pool = new BrowserPool()
  const ctx: ServerContext = { paths, pool, outputSink: new LocalOutputSink() }

  const server = createServer(ctx)

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
  console.error(`[escape-velocity-brand MCP/stdio] connected, brandDir=${brandDir}`)
}

main().catch((err) => {
  console.error('[escape-velocity-brand MCP/stdio] fatal:', err)
  process.exit(1)
})
