#!/usr/bin/env node
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { BrowserPool } from '../core/browserPool.js'
import { resolveBrandPaths } from '../core/paths.js'
import { createServer, type ServerContext } from './shared/createServer.js'
import { RemoteOutputSink } from './shared/outputSinks.js'
import { ArtifactStore, summarizeStore } from './shared/artifactStore.js'
import { checkBearer } from './shared/bearerAuth.js'
import { resolveBrandDir } from './shared/resolveBrandDir.js'

/**
 * Streamable-HTTP MCP entrypoint. Stateless: each POST /mcp request is
 * independent. Artifacts written by tools land in a local on-disk store and
 * are served via HMAC-signed download URLs at GET /artifacts/<token>.
 *
 * Environment variables:
 *   BRAND_DIR                  — absolute path to the brand repo root (required in container).
 *   MCP_BEARER_TOKEN           — required. Gates POST /mcp.
 *   MCP_SIGNING_SECRET         — required. HMAC secret for artifact tokens.
 *   MCP_PUBLIC_BASE_URL        — required. e.g. https://mcp.escapevelocity.consulting
 *   MCP_PORT                   — listen port. Default 8080.
 *   MCP_BIND_HOST              — listen host. Default 0.0.0.0.
 *   MCP_TMP_DIR                — artifact store directory. Default <os.tmpdir>/brand-mcp.
 *   MCP_ARTIFACT_TTL_SECONDS   — artifact URL TTL. Default 3600.
 *   MCP_CLEANUP_INTERVAL_SECONDS — cleanup loop cadence. Default 300.
 *   MCP_ALLOWED_ORIGINS        — comma-separated list of allowed Origin values
 *                                (browser DNS-rebinding defense). Default empty
 *                                (no Origin enforcement; rely on bearer token).
 */
function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`[brand-engine MCP/http] FATAL: ${name} is required`)
    process.exit(1)
  }
  return v
}

function optEnvInt(name: string, fallback: number): number {
  const v = process.env[name]
  if (!v) return fallback
  const n = parseInt(v, 10)
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`[brand-engine MCP/http] FATAL: ${name} must be a positive integer, got ${v}`)
    process.exit(1)
  }
  return n
}

async function main() {
  const brandDir = resolveBrandDir(import.meta.url)
  const paths = resolveBrandPaths(brandDir)

  const bearerToken = requireEnv('MCP_BEARER_TOKEN')
  const signingSecret = requireEnv('MCP_SIGNING_SECRET')
  const publicBaseUrl = requireEnv('MCP_PUBLIC_BASE_URL')
  const port = optEnvInt('MCP_PORT', 8080)
  const host = process.env.MCP_BIND_HOST ?? '0.0.0.0'
  const storeDir = process.env.MCP_TMP_DIR ?? resolve(tmpdir(), 'brand-mcp')
  const ttlSeconds = optEnvInt('MCP_ARTIFACT_TTL_SECONDS', 3600)
  const cleanupIntervalSeconds = optEnvInt('MCP_CLEANUP_INTERVAL_SECONDS', 300)
  const allowedOrigins = (process.env.MCP_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

  const store = new ArtifactStore({
    storeDir,
    publicBaseUrl,
    signingSecret,
    ttlSeconds,
  })
  store.startCleanup(cleanupIntervalSeconds)

  const pool = new BrowserPool()

  const sink = new RemoteOutputSink(async (buffer, opts) => {
    const r = await store.write(buffer, { mime: opts.mime, filename: opts.filename })
    return { url: r.url, expiresAt: r.expiresAt }
  })

  const ctx: ServerContext = { paths, pool, outputSink: sink }
  const mcpServer = createServer(ctx)

  // Stateful transport: server generates a session ID per client connection
  // and tracks it across requests. Needed so the client's
  // `notifications/initialized` POST has a session to attach to. Stateless mode
  // (sessionIdGenerator: undefined) returns 500 for these notifications.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    // Origin enforcement is optional; we rely on bearer auth as primary defense.
    // Pass `allowedOrigins` if browser-origin enforcement is desired.
    allowedOrigins: allowedOrigins.length ? allowedOrigins : undefined,
  } as any)

  await mcpServer.connect(transport)

  const httpServer = createHttpServer(async (req, res) => {
    try {
      await route(req, res, transport, store, bearerToken)
    } catch (err) {
      console.error('[brand-engine MCP/http] unhandled:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'internal_server_error' }))
      }
    }
  })

  const shutdown = async (signal: string) => {
    console.error(`[brand-engine MCP/http] ${signal} — shutting down`)
    store.stopCleanup()
    try { httpServer.close() } catch {}
    try { await mcpServer.close() } catch {}
    try { await pool.close() } catch {}
    process.exit(0)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  httpServer.listen(port, host, () => {
    console.error(`[brand-engine MCP/http] listening on http://${host}:${port}`)
    console.error(`[brand-engine MCP/http] brandDir=${brandDir}`)
    console.error(`[brand-engine MCP/http] artifact store: ${storeDir}`)
    const snap = summarizeStore(storeDir)
    console.error(`[brand-engine MCP/http] existing artifacts on disk: ${snap.fileCount} files, ${snap.bytes} bytes`)
  })
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  transport: StreamableHTTPServerTransport,
  store: ArtifactStore,
  bearerToken: string,
): Promise<void> {
  const url = req.url ?? '/'
  const method = req.method ?? 'GET'

  if (url === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }

  if (url === '/mcp' || url.startsWith('/mcp?')) {
    if (!checkBearer(req, res, bearerToken)) return
    // Body parsing is delegated to the transport (handleRequest handles it).
    await transport.handleRequest(req, res)
    return
  }

  if (url.startsWith('/artifacts/')) {
    const token = url.slice('/artifacts/'.length).split('?')[0]
    if (!token) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not_found' }))
      return
    }
    const resolved = store.resolve(token)
    if (!resolved) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not_found_or_expired' }))
      return
    }
    res.writeHead(200, {
      'Content-Type': resolved.meta.mime,
      'Content-Disposition': `attachment; filename="${sanitizeFilename(resolved.meta.filename)}"`,
      'Cache-Control': 'private, max-age=60',
    })
    createReadStream(resolved.filePath).pipe(res)
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'not_found' }))
}

function sanitizeFilename(name: string): string {
  // Strip path separators + quotes; Content-Disposition needs a safe filename.
  return name.replace(/[\\"\r\n]/g, '').replace(/[/]/g, '_').slice(0, 200) || 'download'
}

main().catch((err) => {
  console.error('[brand-engine MCP/http] fatal:', err)
  process.exit(1)
})
