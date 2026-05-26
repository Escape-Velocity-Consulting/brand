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
import { BundleStore } from './shared/bundleStore.js'
import { PublishedStore } from './shared/publishedStore.js'
import { publishedItemToApi } from './shared/publishedApi.js'
import { authenticate, type AuthConfig } from './shared/jwtAuth.js'
import { log, truncId } from './shared/logger.js'
import {
  handleAsMetadata,
  handleAuthorize,
  handleGoogleCallback,
  handleRegister,
  handleToken,
  stopOAuthCleanup,
  type OAuthConfig,
} from './shared/oauthServer.js'
import { RefreshTokenStore } from './shared/refreshTokenStore.js'
import { resolveBrandDir } from './shared/resolveBrandDir.js'
import { SessionStore } from './shared/sessionStore.js'

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
    console.error(`[escape-velocity-brand MCP/http] FATAL: ${name} is required`)
    process.exit(1)
  }
  return v
}

function optEnvInt(name: string, fallback: number): number {
  const v = process.env[name]
  if (!v) return fallback
  const n = parseInt(v, 10)
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`[escape-velocity-brand MCP/http] FATAL: ${name} must be a positive integer, got ${v}`)
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

  const signingSecret = requireEnv('MCP_SIGNING_SECRET')
  const publicBaseUrl = requireEnv('MCP_PUBLIC_BASE_URL')
  // JWT secret is required once the OAuth flow is in use. During transition we
  // also accept the legacy static MCP_BEARER_TOKEN. One of the two must be set.
  const jwtSecret = process.env.MCP_JWT_SECRET ?? ''
  const legacyBearerToken = process.env.MCP_BEARER_TOKEN ?? ''
  if (!jwtSecret && !legacyBearerToken) {
    console.error('[escape-velocity-brand MCP/http] FATAL: set MCP_JWT_SECRET (OAuth) and/or MCP_BEARER_TOKEN (legacy/test)')
    process.exit(1)
  }
  const allowedEmails = new Set(
    (process.env.MCP_ALLOWED_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  )
  const authConfig: AuthConfig = {
    jwtSecret: jwtSecret || 'no-jwt-configured-only-legacy-bearer',
    publicBaseUrl,
    allowedEmails,
    legacyBearerToken,
  }

  const port = optEnvInt('MCP_PORT', 8080)
  const host = process.env.MCP_BIND_HOST ?? '0.0.0.0'
  const storeDir = process.env.MCP_TMP_DIR ?? resolve(tmpdir(), 'brand-mcp')
  const publishedDir = process.env.MCP_PUBLISHED_DIR ?? resolve(tmpdir(), 'brand-mcp-published')
  const ttlSeconds = optEnvInt('MCP_ARTIFACT_TTL_SECONDS', 3600)
  const cleanupIntervalSeconds = optEnvInt('MCP_CLEANUP_INTERVAL_SECONDS', 300)
  const allowedOrigins = (process.env.MCP_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const refreshTokenTtlSeconds = optEnvInt('MCP_REFRESH_TOKEN_TTL_SECONDS', 30 * 24 * 60 * 60)

  // OAuth (Google-delegated). Optional — only enabled if Google client creds
  // are present. If not configured, /authorize etc. return 503; the static
  // bearer fallback keeps the test suite working.
  const googleClientId = process.env.MCP_OAUTH_GOOGLE_CLIENT_ID ?? ''
  const googleClientSecret = process.env.MCP_OAUTH_GOOGLE_CLIENT_SECRET ?? ''
  const oauthEnabled = !!(googleClientId && googleClientSecret && jwtSecret && allowedEmails.size > 0)
  const refreshTokenStore = new RefreshTokenStore(resolve(storeDir, 'refresh-tokens.json'))
  const oauthConfig: OAuthConfig = {
    publicBaseUrl,
    googleClientId,
    googleClientSecret,
    allowedEmails,
    authConfig,
    refreshTokenStore,
    refreshTokenTtlSeconds,
  }

  const store = new ArtifactStore({
    storeDir,
    publicBaseUrl,
    signingSecret,
    ttlSeconds,
  })
  store.startCleanup(cleanupIntervalSeconds)

  // Bundle + published stores for the publish/unpublish flow. Bundle manifests
  // live alongside artifacts in `storeDir` (same TTL cleanup). Published items
  // live in `publishedDir` (persistent — host volume in prod).
  const bundleStore = new BundleStore(storeDir)
  const publishedStore = new PublishedStore({
    publishedDir,
    artifactStoreDir: storeDir,
    bundleStore,
  })

  // Shared across sessions: BrowserPool (warm Chromium) and the OutputSink
  // (just an artifact-store adapter). Cheap to share — no per-session state.
  const pool = new BrowserPool()
  const sink = new RemoteOutputSink(
    async (buffer, opts) => {
      const r = await store.write(buffer, { mime: opts.mime, filename: opts.filename })
      return { url: r.url, expiresAt: r.expiresAt, uuid: r.uuid }
    },
    bundleStore,
  )

  const ctx: ServerContext = {
    paths,
    pool,
    outputSink: sink,
    publishedStore,
    publicBaseUrl,
  }

  // Per-session transports. Each MCP client connection gets one.
  const transports = new Map<string, StreamableHTTPServerTransport>()

  // Session ID persistence: survives container restarts so clients don't need
  // to re-register. On startup we pre-create transports for all known session
  // IDs — see the pre-load loop below.
  const sessionStore = new SessionStore(resolve(storeDir, 'sessions.json'))

  /**
   * Create a transport+McpServer pair for one MCP session.
   *
   * @param forcedId  Optional: reuse a known session ID (for post-restart
   *                  pre-loading). If omitted a fresh UUID is generated.
   *                  The transport is added to `transports` immediately so
   *                  that reconnecting clients find it before the initialize
   *                  handshake completes.
   */
  async function createSessionTransport(forcedId?: string): Promise<StreamableHTTPServerTransport> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: forcedId ? () => forcedId! : () => randomUUID(),
      onsessioninitialized: (sid: string) => {
        transports.set(sid, transport)
        sessionStore.set(sid, ttlSeconds)
        if (!forcedId) {
          log('session_create', { sid: truncId(sid), total_sessions: transports.size })
        }
      },
      allowedOrigins: allowedOrigins.length ? allowedOrigins : undefined,
    } as any)
    transport.onclose = () => {
      if (transport.sessionId && transports.get(transport.sessionId) === transport) {
        transports.delete(transport.sessionId)
        sessionStore.delete(transport.sessionId)
        log('session_close', { sid: truncId(transport.sessionId), total_sessions: transports.size })
      }
    }
    // Pre-register forced IDs immediately — before the initialize handshake
    // fires onsessioninitialized — so requests with this session ID are routed
    // to the transport right away.
    if (forcedId) transports.set(forcedId, transport)
    const mcp = createServer(ctx)
    await mcp.connect(transport)
    return transport
  }

  const httpServer = createHttpServer(async (req, res) => {
    try {
      await route(req, res, transports, createSessionTransport, store, publishedStore, publicBaseUrl, authConfig, oauthConfig, oauthEnabled)
    } catch (err) {
      log('http_500', {
        path: (req.url ?? '/').split('?')[0],
        method: req.method ?? 'GET',
        err: err instanceof Error ? err : String(err),
      })
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'internal_server_error' }))
      }
    }
  })

  const shutdown = async (signal: string) => {
    log('shutdown', { signal })
    store.stopCleanup()
    stopOAuthCleanup()
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

  // Pre-create transports for sessions that were active before the last
  // restart. This lets reconnecting clients find their session ID in the Map
  // and complete the re-initialization handshake without obtaining a new ID.
  const restoredIds = sessionStore.getAll()
  for (const id of restoredIds) {
    try {
      await createSessionTransport(id)
      log('session_restore', { sid: truncId(id) })
    } catch (err) {
      log('session_restore_fail', { sid: truncId(id), err: err instanceof Error ? err : String(err) })
    }
  }
  if (restoredIds.length > 0) {
    log('startup_sessions_restored', { count: restoredIds.length })
  }
  // Drop any expired refresh tokens left on disk from the previous boot.
  const rtPrune = refreshTokenStore.prune()
  if (rtPrune.pruned > 0) {
    log('refresh_prune', { pruned: rtPrune.pruned, live: rtPrune.live })
  }

  httpServer.listen(port, host, () => {
    const snap = summarizeStore(storeDir)
    log('startup', {
      host,
      port,
      brand_dir: brandDir,
      store_dir: storeDir,
      published_dir: publishedDir,
      jwt: jwtSecret ? 'on' : 'off',
      legacy_bearer: legacyBearerToken ? 'on' : 'off',
      oauth: oauthEnabled ? 'on' : 'off',
      allowlist_emails: allowedEmails.size,
      refresh_ttl_s: refreshTokenTtlSeconds,
      log_ip: process.env.MCP_LOG_IP ?? 'none',
      artifact_files: snap.fileCount,
      artifact_bytes: snap.bytes,
    })
  })
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  transports: Map<string, StreamableHTTPServerTransport>,
  createSessionTransport: () => Promise<StreamableHTTPServerTransport>,
  store: ArtifactStore,
  publishedStore: PublishedStore,
  publicBaseUrl: string,
  authConfig: AuthConfig,
  oauthConfig: OAuthConfig,
  oauthEnabled: boolean,
): Promise<void> {
  const url = req.url ?? '/'
  const path = url.split('?')[0]
  const method = req.method ?? 'GET'

  if (path === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }

  // RFC 9728 — Protected Resource Metadata. Public; tells clients where to
  // find the OAuth authorization server. We're our own AS, so it points at
  // ourselves.
  if (path === '/.well-known/oauth-protected-resource' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    })
    res.end(JSON.stringify({
      resource: `${authConfig.publicBaseUrl}/mcp`,
      authorization_servers: [authConfig.publicBaseUrl],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp'],
    }))
    return
  }

  // RFC 8414 — Authorization Server Metadata. Public.
  if (path === '/.well-known/oauth-authorization-server' && method === 'GET') {
    if (!oauthEnabled) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'oauth_not_configured' }))
      return
    }
    handleAsMetadata(res, oauthConfig)
    return
  }

  // OAuth endpoints
  if (path === '/authorize' && method === 'GET') {
    if (!oauthEnabled) {
      res.writeHead(503, { 'Content-Type': 'text/plain' })
      res.end('OAuth is not configured on this server (missing MCP_OAUTH_GOOGLE_CLIENT_ID, MCP_JWT_SECRET, or MCP_ALLOWED_EMAILS).')
      return
    }
    handleAuthorize(req, res, oauthConfig)
    return
  }
  if (path === '/oauth/google/callback' && method === 'GET') {
    if (!oauthEnabled) {
      res.writeHead(503, { 'Content-Type': 'text/plain' })
      res.end('OAuth is not configured on this server.')
      return
    }
    await handleGoogleCallback(req, res, oauthConfig)
    return
  }
  if (path === '/token' && method === 'POST') {
    if (!oauthEnabled) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'oauth_not_configured' }))
      return
    }
    await handleToken(req, res, oauthConfig)
    return
  }
  if (path === '/register' && method === 'POST') {
    if (!oauthEnabled) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'oauth_not_configured' }))
      return
    }
    await handleRegister(req, res, oauthConfig)
    return
  }

  // --- Published items (persistent, public) ---
  //
  // Published items are public by definition — no auth on the read side. CORS
  // is wide-open since the data is meant to be embeddable on the Brand Site
  // (and anywhere else).

  if (path === '/api/published' && method === 'OPTIONS') {
    res.writeHead(204, corsHeaders())
    res.end()
    return
  }

  if (path === '/api/published' && method === 'GET') {
    const url = new URL(req.url ?? '/', 'http://placeholder')
    const typeFilter = url.searchParams.get('type') ?? undefined
    const items = publishedStore.list(typeFilter ? { type: typeFilter as any } : {})
    const apiItems = items.map((i) => publishedItemToApi(i, publicBaseUrl))
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      ...corsHeaders(),
    })
    res.end(JSON.stringify({ items: apiItems, count: apiItems.length }))
    return
  }

  if (path.startsWith('/api/published/') && method === 'GET') {
    const id = path.slice('/api/published/'.length)
    if (!id) {
      res.writeHead(404, { 'Content-Type': 'application/json', ...corsHeaders() })
      res.end(JSON.stringify({ error: 'not_found' }))
      return
    }
    const item = publishedStore.get(id)
    if (!item) {
      res.writeHead(404, { 'Content-Type': 'application/json', ...corsHeaders() })
      res.end(JSON.stringify({ error: 'not_found' }))
      return
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      ...corsHeaders(),
    })
    res.end(JSON.stringify(publishedItemToApi(item, publicBaseUrl)))
    return
  }

  if (path.startsWith('/published/') && method === 'GET') {
    // Parse: /published/<id>/<relativeName...>
    const rest = path.slice('/published/'.length)
    const slash = rest.indexOf('/')
    if (slash <= 0) {
      log('http_404', { path, method })
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not_found' }))
      return
    }
    const id = rest.slice(0, slash)
    const relativeNameRaw = rest.slice(slash + 1)
    // Decode and reject any decoded path that starts with '/' or contains '..' segments.
    let relativeName: string
    try {
      relativeName = relativeNameRaw.split('/').map(decodeURIComponent).join('/')
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'bad_path' }))
      return
    }
    if (relativeName.includes('..') || relativeName.startsWith('/')) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'bad_path' }))
      return
    }
    const resolved = publishedStore.resolveFile(id, relativeName)
    if (!resolved) {
      log('http_404', { path, method })
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not_found' }))
      return
    }
    res.writeHead(200, {
      'Content-Type': resolved.mime,
      'Content-Disposition': `inline; filename="${sanitizeFilename(resolved.filename)}"`,
      'Cache-Control': 'public, max-age=300',
    })
    createReadStream(resolved.absPath).pipe(res)
    return
  }

  if (path.startsWith('/artifacts/') && method === 'GET') {
    const token = path.slice('/artifacts/'.length)
    if (!token) {
      log('artifact_404', { reason: 'empty_token' })
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not_found' }))
      return
    }
    const resolved = store.resolve(token)
    if (!resolved) {
      log('artifact_404', { token: truncId(token), reason: 'unresolved_or_expired' })
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not_found_or_expired' }))
      return
    }
    res.writeHead(200, {
      'Content-Type': resolved.meta.mime,
      'Content-Disposition': `inline; filename="${sanitizeFilename(resolved.meta.filename)}"`,
      'Cache-Control': 'private, max-age=60',
    })
    createReadStream(resolved.filePath).pipe(res)
    return
  }

  if (path === '/mcp') {
    const authed = await authenticate(req, res, authConfig)
    if (!authed) return

    const sessionId = req.headers['mcp-session-id'] as string | undefined

    // POST: route to existing session or create a new one (initialize request).
    if (method === 'POST') {
      const body = await readBody(req)
      let transport: StreamableHTTPServerTransport | undefined
      const isInit = isInitializeRequest(body)

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!
        log('mcp_request', { sid: truncId(sessionId), email: authed.email, is_init: false })
      } else if (!sessionId && isInit) {
        transport = await createSessionTransport()
        log('mcp_request', { sid: truncId(transport.sessionId), email: authed.email, is_init: true })
      } else {
        // 404 is the MCP-spec-compliant response for unknown sessions — it
        // signals compliant clients to drop the stale ID and reinitialize.
        log('mcp_session_404', {
          sid_claimed: truncId(sessionId),
          had_header: !!sessionId,
          email: authed.email,
          verb: 'POST',
          is_init: isInit,
        })
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: sessionId
              ? `Session not found (server may have restarted): ${sessionId}`
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
        log('mcp_session_404', { sid_claimed: truncId(sessionId), had_header: !!sessionId, email: authed.email, verb: 'GET' })
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'session_not_found' }))
        return
      }
      log('mcp_stream_open', { sid: truncId(sessionId), email: authed.email })
      await transports.get(sessionId)!.handleRequest(req, res)
      return
    }

    // DELETE: terminate a session.
    if (method === 'DELETE') {
      if (!sessionId || !transports.has(sessionId)) {
        log('mcp_session_404', { sid_claimed: truncId(sessionId), had_header: !!sessionId, email: authed.email, verb: 'DELETE' })
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'session_not_found' }))
        return
      }
      log('session_delete_request', { sid: truncId(sessionId), email: authed.email })
      await transports.get(sessionId)!.handleRequest(req, res)
      return
    }

    log('http_405', { path, method })
    res.writeHead(405, { 'Content-Type': 'application/json', 'Allow': 'POST, GET, DELETE' })
    res.end(JSON.stringify({ error: 'method_not_allowed' }))
    return
  }

  log('http_404', { path, method })
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'not_found' }))
}

function corsHeaders(): Record<string, string> {
  // Published data is public by design. Allow any origin to read.
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '3600',
  }
}

function sanitizeFilename(name: string): string {
  // Strip path separators + quotes; Content-Disposition needs a safe filename.
  return name.replace(/[\\"\r\n]/g, '').replace(/[/]/g, '_').slice(0, 200) || 'download'
}

main().catch((err) => {
  console.error('[escape-velocity-brand MCP/http] fatal:', err)
  process.exit(1)
})
