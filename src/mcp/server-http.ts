#!/usr/bin/env node
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { BrowserPool } from '../core/browserPool.js'
import { resolveBrandPaths } from '../core/paths.js'
import { createServer, type ServerContext } from './shared/createServer.js'
import { RemoteOutputSink } from './shared/outputSinks.js'
import { ArtifactStore, summarizeStore } from './shared/artifactStore.js'
import { checkBearer } from './shared/bearerAuth.js'
import { resolveBrandDir } from './shared/resolveBrandDir.js'

/**
 * Streamable-HTTP MCP entrypoint.
 *
 * Per-session transport management: each MCP client connection gets its own
 * `StreamableHTTPServerTransport` instance keyed by the `Mcp-Session-Id`
 * header. This is the SDK's recommended pattern for stateful servers — a
 * single shared transport breaks when a second client (or a re-initializing
 * client like `mcp-remote`) hits the same process, because the SDK transport
 * carries "initialized" state per instance.
 *
 * Artifacts written by tools land in a local on-disk store and are served
 * via HMAC-signed download URLs at GET /artifacts/<token>.
 *
 * Routes:
 *   POST   /mcp              — MCP requests. Bearer-gated. New session if no
 *                              Mcp-Session-Id and request is `initialize`.
 *   GET    /mcp              — MCP streaming responses (SSE). Bearer-gated.
 *                              Requires existing Mcp-Session-Id.
 *   DELETE /mcp              — Terminate an MCP session. Bearer-gated.
 *   GET    /artifacts/:token — Download a rendered artifact. HMAC-signed URL.
 *   GET    /health           — Liveness probe.
 *
 * Environment variables: see brand/CLAUDE.md § MCP Server → Env vars.
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

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString('utf-8')
  if (!raw) return undefined
  try { return JSON.parse(raw) }
  catch { return undefined }
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

  // Shared across sessions: BrowserPool (warm Chromium) and the OutputSink
  // (just an artifact-store adapter). Cheap to share — no per-session state.
  const pool = new BrowserPool()
  const sink = new RemoteOutputSink(async (buffer, opts) => {
    const r = await store.write(buffer, { mime: opts.mime, filename: opts.filename })
    return { url: r.url, expiresAt: r.expiresAt }
  })

  const ctx: ServerContext = { paths, pool, outputSink: sink }

  // Per-session transports. Each MCP client connection gets one.
  const transports = new Map<string, StreamableHTTPServerTransport>()

  async function createSessionTransport(): Promise<StreamableHTTPServerTransport> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid: string) => {
        transports.set(sid, transport)
      },
      allowedOrigins: allowedOrigins.length ? allowedOrigins : undefined,
    } as any)
    transport.onclose = () => {
      if (transport.sessionId && transports.get(transport.sessionId) === transport) {
        transports.delete(transport.sessionId)
      }
    }
    const mcp = createServer(ctx)
    await mcp.connect(transport)
    return transport
  }

  const httpServer = createHttpServer(async (req, res) => {
    try {
      await route(req, res, transports, createSessionTransport, store, bearerToken)
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
    for (const t of transports.values()) {
      try { await t.close() } catch {}
    }
    transports.clear()
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
  transports: Map<string, StreamableHTTPServerTransport>,
  createSessionTransport: () => Promise<StreamableHTTPServerTransport>,
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

  if (url.startsWith('/artifacts/') && method === 'GET') {
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

  if (url === '/mcp' || url.startsWith('/mcp?')) {
    if (!checkBearer(req, res, bearerToken)) return

    const sessionId = req.headers['mcp-session-id'] as string | undefined

    // POST: route to existing session or create a new one (initialize request).
    if (method === 'POST') {
      const body = await readBody(req)
      let transport: StreamableHTTPServerTransport | undefined

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!
      } else if (!sessionId && isInitializeRequest(body)) {
        transport = await createSessionTransport()
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: sessionId
              ? `Unknown session: ${sessionId}`
              : 'Missing Mcp-Session-Id header (only an initialize request can omit it)',
          },
          id: null,
        }))
        return
      }

      await transport.handleRequest(req, res, body)
      return
    }

    // GET: streaming response channel for an existing session.
    if (method === 'GET') {
      if (!sessionId || !transports.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid_or_missing_session_id' }))
        return
      }
      await transports.get(sessionId)!.handleRequest(req, res)
      return
    }

    // DELETE: terminate a session.
    if (method === 'DELETE') {
      if (!sessionId || !transports.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid_or_missing_session_id' }))
        return
      }
      await transports.get(sessionId)!.handleRequest(req, res)
      return
    }

    res.writeHead(405, { 'Content-Type': 'application/json', 'Allow': 'POST, GET, DELETE' })
    res.end(JSON.stringify({ error: 'method_not_allowed' }))
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
