/**
 * OAuth 2.1 Authorization Server, embedded in the MCP container.
 *
 * Role split (per MCP spec — RFC 9728):
 *   - We are the Resource Server (serves /mcp, validates JWTs).
 *   - We are also the OAuth Authorization Server (this module), but we
 *     DELEGATE the user-login step to Google (OIDC). The flow is:
 *
 *       Claude Desktop  →  GET /authorize (us)
 *                              │ stash PKCE + Claude's redirect_uri keyed by flow_id
 *                              ↓
 *                          302 → Google /authorize (we're a Google OAuth client)
 *                              │
 *                              ↓
 *                          User signs into Google + consents
 *                              │
 *                              ↓
 *                          Google → GET /oauth/google/callback (us)
 *                              │ exchange Google code → ID token
 *                              │ verify ID token sig against Google JWKS
 *                              │ extract email; check MCP_ALLOWED_EMAILS
 *                              │ mint our auth code (60s TTL, single-use)
 *                              ↓
 *                          302 → Claude's redirect_uri?code=…&state=…
 *                              │
 *                              ↓
 *      Claude Desktop  →  POST /token (us)
 *                              │ verify PKCE code_verifier
 *                              │ issue HS256 JWT for /mcp
 *
 *   - Dynamic Client Registration (RFC 7591) is supported at POST /register
 *     so Claude Desktop can register itself automatically. PKCE-only;
 *     `token_endpoint_auth_method: "none"` (no client secret).
 *
 * State is in-memory with TTL maps. Single container, low scale — no DB.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { issueAccessToken, type AuthConfig } from './jwtAuth.js'
import { log, truncId } from './logger.js'
import type { RefreshTokenStore } from './refreshTokenStore.js'

// ─── Config ────────────────────────────────────────────────────────────────

export interface OAuthConfig {
  publicBaseUrl: string
  googleClientId: string
  googleClientSecret: string
  allowedEmails: Set<string>
  authConfig: AuthConfig
  /** Disk-backed refresh-token store. Required when OAuth is enabled. */
  refreshTokenStore: RefreshTokenStore
  /** Refresh-token lifetime. Default: 30 days. */
  refreshTokenTtlSeconds: number
}

// Google endpoints (constants — Google's OIDC config is stable).
const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISSUER = 'https://accounts.google.com'

const FLOW_TTL_MS = 10 * 60 * 1000   // 10 minutes — user time to finish Google login
const CODE_TTL_MS = 60 * 1000        // 60 seconds — Claude exchanges immediately
const CLIENT_REGISTRY_TTL_MS = 30 * 24 * 60 * 60 * 1000  // 30 days

// ─── State (in-memory) ─────────────────────────────────────────────────────

interface FlowState {
  /** Random ID we pass as Google's `state` to recognise the callback. */
  flowId: string
  /** Claude's client_id (from DCR). */
  clientId: string
  /** Claude's redirect_uri. */
  redirectUri: string
  /** Claude's `state` (pass back unchanged). */
  clientState: string
  /** PKCE challenge from Claude. */
  codeChallenge: string
  codeChallengeMethod: string
  /** Resource indicator (RFC 8707) — should be our /mcp URL. */
  resource?: string
  createdAt: number
}

interface AuthCodeEntry {
  email: string
  redirectUri: string
  codeChallenge: string
  codeChallengeMethod: string
  clientId: string
  createdAt: number
}

interface RegisteredClient {
  clientId: string
  clientName?: string
  redirectUris: string[]
  createdAt: number
}

// ─── Module-level state ────────────────────────────────────────────────────

const flows = new Map<string, FlowState>()
const authCodes = new Map<string, AuthCodeEntry>()
const clients = new Map<string, RegisteredClient>()

// Cleanup expired entries every minute.
let cleanupTimer: NodeJS.Timeout | undefined
function startCleanup(): void {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [k, v] of flows) if (now - v.createdAt > FLOW_TTL_MS) flows.delete(k)
    for (const [k, v] of authCodes) if (now - v.createdAt > CODE_TTL_MS) authCodes.delete(k)
    for (const [k, v] of clients) if (now - v.createdAt > CLIENT_REGISTRY_TTL_MS) clients.delete(k)
  }, 60_000).unref()
}

export function stopOAuthCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = undefined
  }
}

// ─── Google ID token verification ──────────────────────────────────────────

let googleJwks: ReturnType<typeof createRemoteJWKSet> | undefined
function getGoogleJwks() {
  if (!googleJwks) googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL))
  return googleJwks
}

async function verifyGoogleIdToken(idToken: string, audience: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(idToken, getGoogleJwks(), {
    issuer: [GOOGLE_ISSUER, 'accounts.google.com'],
    audience,
  })
  return payload
}

// ─── PKCE ──────────────────────────────────────────────────────────────────

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method === 'plain') return verifier === challenge
  if (method === 'S256') {
    const computed = base64UrlEncode(createHash('sha256').update(verifier).digest())
    return computed === challenge
  }
  return false
}

// ─── Body helpers ──────────────────────────────────────────────────────────

async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf-8')
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const raw = await readRawBody(req)
  if (!raw) return null
  try { return JSON.parse(raw) as Record<string, unknown> }
  catch { return null }
}

async function readFormBody(req: IncomingMessage): Promise<Record<string, string>> {
  const raw = await readRawBody(req)
  const out: Record<string, string> = {}
  if (!raw) return out
  for (const pair of raw.split('&')) {
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    const k = decodeURIComponent(pair.slice(0, eq).replace(/\+/g, ' '))
    const v = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '))
    out[k] = v
  }
  return out
}

function parseQuery(url: string): Record<string, string> {
  const out: Record<string, string> = {}
  const q = url.indexOf('?')
  if (q < 0) return out
  for (const pair of url.slice(q + 1).split('&')) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    const k = decodeURIComponent((eq < 0 ? pair : pair.slice(0, eq)).replace(/\+/g, ' '))
    const v = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '))
    out[k] = v
  }
  return out
}

function sendError(res: ServerResponse, status: number, code: string, description?: string): void {
  if (res.headersSent) return
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: code, error_description: description }))
}

function sendHtmlError(res: ServerResponse, status: number, title: string, detail: string): void {
  if (res.headersSent) return
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>
    body{font-family:system-ui,sans-serif;max-width:560px;margin:80px auto;padding:0 20px;color:#222}
    h1{font-weight:600;font-size:20px;margin:0 0 8px}
    p{color:#555;line-height:1.5}
    code{background:#f4f1ec;padding:2px 6px;border-radius:3px;font-size:13px}
  </style></head><body><h1>${escapeHtml(title)}</h1><p>${detail}</p></body></html>`)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

// ─── Route handlers ────────────────────────────────────────────────────────

/**
 * GET /.well-known/oauth-authorization-server — RFC 8414 metadata document.
 * Public; describes our OAuth endpoints.
 */
export function handleAsMetadata(res: ServerResponse, config: OAuthConfig): void {
  const base = config.publicBaseUrl
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
  })
  res.end(JSON.stringify({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp'],
    // RFC 8707 — we accept the resource indicator parameter.
    response_modes_supported: ['query'],
  }))
}

/**
 * GET /authorize — OAuth code-flow entrypoint.
 *
 * Validates the request, stashes PKCE + redirect_uri keyed by a random
 * flow_id, then redirects the browser to Google for the actual user login.
 */
export function handleAuthorize(req: IncomingMessage, res: ServerResponse, config: OAuthConfig): void {
  startCleanup()
  const q = parseQuery(req.url ?? '')
  const responseType = q.response_type
  const clientId = q.client_id
  const redirectUri = q.redirect_uri
  const state = q.state ?? ''
  const codeChallenge = q.code_challenge
  const codeChallengeMethod = q.code_challenge_method ?? 'S256'
  const resource = q.resource

  if (responseType !== 'code') {
    log('oauth_authorize_reject', { reason: 'bad_response_type', response_type: responseType })
    sendHtmlError(res, 400, 'Invalid request', `Unsupported response_type: <code>${escapeHtml(responseType ?? '')}</code>. Only "code" is supported.`)
    return
  }
  if (!clientId) {
    log('oauth_authorize_reject', { reason: 'missing_client_id' })
    sendHtmlError(res, 400, 'Invalid request', 'Missing <code>client_id</code>.')
    return
  }
  if (!redirectUri) {
    log('oauth_authorize_reject', { reason: 'missing_redirect_uri', client_id: truncId(clientId) })
    sendHtmlError(res, 400, 'Invalid request', 'Missing <code>redirect_uri</code>.')
    return
  }
  if (!codeChallenge) {
    log('oauth_authorize_reject', { reason: 'missing_pkce', client_id: truncId(clientId) })
    sendHtmlError(res, 400, 'Invalid request', 'PKCE is required. Missing <code>code_challenge</code>.')
    return
  }
  if (codeChallengeMethod !== 'S256') {
    log('oauth_authorize_reject', { reason: 'bad_pkce_method', method: codeChallengeMethod, client_id: truncId(clientId) })
    sendHtmlError(res, 400, 'Invalid request', `Only PKCE S256 is supported. Got: <code>${escapeHtml(codeChallengeMethod)}</code>.`)
    return
  }

  // Verify the client + redirect_uri (DCR registry check).
  const client = clients.get(clientId)
  if (!client) {
    log('oauth_authorize_reject', { reason: 'unknown_client', client_id: truncId(clientId) })
    sendHtmlError(res, 400, 'Unknown client', `Client <code>${escapeHtml(clientId)}</code> is not registered. Use POST /register first (DCR).`)
    return
  }
  if (!client.redirectUris.includes(redirectUri)) {
    log('oauth_authorize_reject', { reason: 'redirect_uri_mismatch', client_id: truncId(clientId) })
    sendHtmlError(res, 400, 'Invalid redirect_uri', `<code>${escapeHtml(redirectUri)}</code> is not registered for this client.`)
    return
  }

  // Stash flow state.
  const flowId = randomUUID()
  flows.set(flowId, {
    flowId,
    clientId,
    redirectUri,
    clientState: state,
    codeChallenge,
    codeChallengeMethod,
    resource,
    createdAt: Date.now(),
  })
  log('oauth_authorize', {
    flow_id: truncId(flowId),
    client_id: truncId(clientId),
    redirect_uri_host: safeUrlHost(redirectUri),
  })

  // Build Google authorization URL.
  const googleRedirectUri = `${config.publicBaseUrl}/oauth/google/callback`
  const googleAuthUrl = new URL(GOOGLE_AUTHORIZATION_ENDPOINT)
  googleAuthUrl.searchParams.set('client_id', config.googleClientId)
  googleAuthUrl.searchParams.set('redirect_uri', googleRedirectUri)
  googleAuthUrl.searchParams.set('response_type', 'code')
  googleAuthUrl.searchParams.set('scope', 'openid email')
  googleAuthUrl.searchParams.set('state', flowId)
  googleAuthUrl.searchParams.set('access_type', 'online')
  googleAuthUrl.searchParams.set('prompt', 'select_account')

  res.writeHead(302, { Location: googleAuthUrl.toString() })
  res.end()
}

/**
 * GET /oauth/google/callback — Google redirects here after user login.
 *
 * We exchange Google's code for an ID token, verify it, check the email
 * against the allowlist, and issue our own auth code that Claude will
 * exchange at /token.
 */
export async function handleGoogleCallback(req: IncomingMessage, res: ServerResponse, config: OAuthConfig): Promise<void> {
  const q = parseQuery(req.url ?? '')
  const code = q.code
  const flowId = q.state
  const googleError = q.error

  if (googleError) {
    log('oauth_callback_reject', { reason: 'google_returned_error', google_error: googleError })
    sendHtmlError(res, 400, 'Google sign-in failed', `Google returned: <code>${escapeHtml(googleError)}</code>${q.error_description ? ` — ${escapeHtml(q.error_description)}` : ''}`)
    return
  }
  if (!code || !flowId) {
    log('oauth_callback_reject', { reason: 'missing_code_or_state', has_code: !!code, has_state: !!flowId })
    sendHtmlError(res, 400, 'Invalid Google callback', 'Missing <code>code</code> or <code>state</code> parameter.')
    return
  }

  const flow = flows.get(flowId)
  if (!flow) {
    log('oauth_callback_reject', { reason: 'flow_unknown_or_expired', flow_id: truncId(flowId) })
    sendHtmlError(res, 400, 'Expired sign-in', 'Sign-in attempt expired or unrecognized. Please retry from your MCP client.')
    return
  }
  flows.delete(flowId)

  // Exchange Google's code for an ID token.
  const googleRedirectUri = `${config.publicBaseUrl}/oauth/google/callback`
  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: googleRedirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  })
  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => '')
    log('oauth_callback_reject', { reason: 'google_token_exchange_failed', status: tokenRes.status })
    sendHtmlError(res, 502, 'Google token exchange failed', `HTTP ${tokenRes.status}: <code>${escapeHtml(detail.slice(0, 300))}</code>`)
    return
  }
  const tokenJson = await tokenRes.json() as { id_token?: string }
  if (!tokenJson.id_token) {
    log('oauth_callback_reject', { reason: 'google_no_id_token' })
    sendHtmlError(res, 502, 'Google response missing id_token', 'Google did not return an OIDC ID token. Check that the OAuth client has openid + email scopes.')
    return
  }

  // Verify the ID token.
  let payload: JWTPayload
  try {
    payload = await verifyGoogleIdToken(tokenJson.id_token, config.googleClientId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log('oauth_callback_reject', { reason: 'google_idtoken_invalid', err: msg })
    sendHtmlError(res, 502, 'Google ID token invalid', escapeHtml(msg))
    return
  }

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : ''
  const emailVerified = payload.email_verified === true
  if (!email) {
    log('oauth_callback_reject', { reason: 'missing_email' })
    sendHtmlError(res, 400, 'Google did not return an email', 'The ID token has no <code>email</code> claim. Did you grant the email scope?')
    return
  }
  if (!emailVerified) {
    log('oauth_callback_reject', { reason: 'email_unverified', sub: email })
    sendHtmlError(res, 403, 'Email not verified', `Google reports <code>${escapeHtml(email)}</code> is not verified.`)
    return
  }
  if (!config.allowedEmails.has(email)) {
    log('oauth_callback_reject', { reason: 'allowlist_miss', sub: email })
    sendHtmlError(res, 403, 'Access denied', `<code>${escapeHtml(email)}</code> is not on the allowlist for this MCP server. Contact the operator if this is unexpected.`)
    return
  }

  // Mint our own auth code, redirect back to the original client.
  const ourCode = base64UrlEncode(randomBytes(32))
  authCodes.set(ourCode, {
    email,
    redirectUri: flow.redirectUri,
    codeChallenge: flow.codeChallenge,
    codeChallengeMethod: flow.codeChallengeMethod,
    clientId: flow.clientId,
    createdAt: Date.now(),
  })
  log('oauth_code_issued', {
    sub: email,
    flow_id: truncId(flow.flowId),
    code: truncId(ourCode),
    ttl_s: Math.floor(CODE_TTL_MS / 1000),
  })

  const redirect = new URL(flow.redirectUri)
  redirect.searchParams.set('code', ourCode)
  if (flow.clientState) redirect.searchParams.set('state', flow.clientState)

  res.writeHead(302, { Location: redirect.toString() })
  res.end()
}

/**
 * POST /token — exchange an auth code (or refresh token) for a JWT access
 * token.
 *
 * Supports two grant types:
 *   - `authorization_code`: PKCE-verified single-use code from /authorize.
 *   - `refresh_token`: opaque rotating token previously issued by this
 *     endpoint. Rotation is single-use (each refresh issues a new token, the
 *     old one is invalidated). The `sub` is re-checked against the allowlist
 *     on every refresh.
 *
 * On success both grants return:
 *   { access_token, token_type: "Bearer", expires_in, refresh_token, scope }
 */
export async function handleToken(req: IncomingMessage, res: ServerResponse, config: OAuthConfig): Promise<void> {
  const form = await readFormBody(req)
  const grantType = form.grant_type

  if (grantType === 'authorization_code') {
    return handleAuthCodeGrant(form, res, config)
  }
  if (grantType === 'refresh_token') {
    return handleRefreshTokenGrant(form, res, config)
  }

  log('oauth_token_reject', { reason: 'unsupported_grant_type', grant_type: grantType })
  sendError(res, 400, 'unsupported_grant_type', `Only authorization_code and refresh_token are supported. Got: ${grantType}`)
}

async function handleAuthCodeGrant(form: Record<string, string>, res: ServerResponse, config: OAuthConfig): Promise<void> {
  const code = form.code
  const codeVerifier = form.code_verifier
  const redirectUri = form.redirect_uri
  const clientId = form.client_id

  if (!code || !codeVerifier || !redirectUri || !clientId) {
    log('oauth_token_reject', { reason: 'invalid_request', grant: 'authorization_code' })
    sendError(res, 400, 'invalid_request', 'Missing code, code_verifier, redirect_uri, or client_id.')
    return
  }

  const entry = authCodes.get(code)
  if (!entry) {
    log('oauth_token_reject', { reason: 'unknown_code', code: truncId(code) })
    sendError(res, 400, 'invalid_grant', 'Code unknown or already used.')
    return
  }
  // Single-use: remove immediately regardless of subsequent validation.
  authCodes.delete(code)

  if (Date.now() - entry.createdAt > CODE_TTL_MS) {
    log('oauth_token_reject', { reason: 'expired', code: truncId(code), sub: entry.email })
    sendError(res, 400, 'invalid_grant', 'Code expired.')
    return
  }
  if (entry.redirectUri !== redirectUri) {
    log('oauth_token_reject', { reason: 'redirect_uri_mismatch', sub: entry.email })
    sendError(res, 400, 'invalid_grant', 'redirect_uri does not match the one used during /authorize.')
    return
  }
  if (entry.clientId !== clientId) {
    log('oauth_token_reject', { reason: 'client_id_mismatch', sub: entry.email })
    sendError(res, 400, 'invalid_grant', 'client_id does not match the one used during /authorize.')
    return
  }
  if (!verifyPkce(codeVerifier, entry.codeChallenge, entry.codeChallengeMethod)) {
    log('oauth_token_reject', { reason: 'pkce_fail', sub: entry.email })
    sendError(res, 400, 'invalid_grant', 'PKCE code_verifier does not match the challenge.')
    return
  }

  const { token, expiresIn } = await issueAccessToken(entry.email, config.authConfig)
  const refresh = config.refreshTokenStore.issue(entry.email, config.refreshTokenTtlSeconds)
  log('refresh_issue', {
    sub: entry.email,
    rt_id: truncId(hashForLogging(refresh.token)),
    ttl_s: config.refreshTokenTtlSeconds,
  })
  log('oauth_token_issued', {
    sub: entry.email,
    client_id: truncId(clientId),
    expires_in_s: expiresIn,
    refresh_token_issued: true,
  })

  sendTokenResponse(res, token, expiresIn, refresh.token)
}

async function handleRefreshTokenGrant(form: Record<string, string>, res: ServerResponse, config: OAuthConfig): Promise<void> {
  const refreshToken = form.refresh_token
  const clientId = form.client_id

  if (!refreshToken) {
    log('oauth_token_reject', { reason: 'invalid_request', grant: 'refresh_token' })
    sendError(res, 400, 'invalid_request', 'Missing refresh_token.')
    return
  }

  const consumed = config.refreshTokenStore.consume(refreshToken)
  if (!consumed) {
    log('refresh_consume_reject', {
      reason: 'unknown_or_expired',
      rt_claimed_id: truncId(hashForLogging(refreshToken)),
    })
    sendError(res, 400, 'invalid_grant', 'Refresh token unknown, expired, or already used.')
    return
  }

  // Critical: re-check the allowlist on every refresh. Allowlist may have
  // changed since the refresh token was issued.
  if (!config.allowedEmails.has(consumed.sub)) {
    log('refresh_consume_reject', {
      reason: 'allowlist_miss',
      sub: consumed.sub,
      rt_claimed_id: truncId(consumed.tokenHash),
    })
    // Don't reveal email-on-allowlist status via timing or error msg.
    sendError(res, 400, 'invalid_grant', 'Refresh token unknown, expired, or already used.')
    return
  }

  const { token, expiresIn } = await issueAccessToken(consumed.sub, config.authConfig)
  const newRefresh = config.refreshTokenStore.issue(consumed.sub, config.refreshTokenTtlSeconds)
  const newRtHash = hashForLogging(newRefresh.token)
  log('refresh_consume_ok', {
    sub: consumed.sub,
    old_rt_id: truncId(consumed.tokenHash),
    new_rt_id: truncId(newRtHash),
  })
  log('refresh_issue', {
    sub: consumed.sub,
    rt_id: truncId(newRtHash),
    ttl_s: config.refreshTokenTtlSeconds,
  })
  log('oauth_token_issued', {
    sub: consumed.sub,
    client_id: truncId(clientId),
    expires_in_s: expiresIn,
    refresh_token_issued: true,
    grant: 'refresh_token',
  })

  sendTokenResponse(res, token, expiresIn, newRefresh.token)
}

function sendTokenResponse(res: ServerResponse, accessToken: string, expiresIn: number, refreshToken: string): void {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
  })
  res.end(JSON.stringify({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    refresh_token: refreshToken,
    scope: 'mcp',
  }))
}

/** SHA-256 hex of a raw token, for log correlation. Mirrors refreshTokenStore. */
function hashForLogging(raw: string): string {
  return createHash('sha256').update(raw, 'utf-8').digest('hex')
}

/**
 * POST /register — RFC 7591 Dynamic Client Registration.
 *
 * Accepts a JSON metadata document and returns a fresh client_id. We don't
 * issue client secrets — PKCE is mandatory.
 */
export async function handleRegister(req: IncomingMessage, res: ServerResponse, _config: OAuthConfig): Promise<void> {
  startCleanup()
  const body = await readJsonBody(req)
  if (!body) {
    sendError(res, 400, 'invalid_client_metadata', 'Body must be JSON.')
    return
  }
  const redirectUris = Array.isArray(body.redirect_uris)
    ? (body.redirect_uris as unknown[]).filter((u): u is string => typeof u === 'string')
    : []
  if (redirectUris.length === 0) {
    sendError(res, 400, 'invalid_client_metadata', 'redirect_uris must be a non-empty array of strings.')
    return
  }

  const clientId = `cli_${base64UrlEncode(randomBytes(18))}`
  const clientName = typeof body.client_name === 'string' ? body.client_name : undefined
  clients.set(clientId, {
    clientId,
    clientName,
    redirectUris,
    createdAt: Date.now(),
  })
  log('oauth_client_registered', {
    client_id: truncId(clientId),
    client_name: clientName,
    redirect_uris_count: redirectUris.length,
  })

  res.writeHead(201, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  }))
}

/** Extract the host of a URL for logging. Returns undefined for malformed URLs. */
function safeUrlHost(url: string): string | undefined {
  try { return new URL(url).host }
  catch { return undefined }
}

/**
 * Pre-register a static client (used by the E2E test runner). Not exposed as
 * an endpoint — call this directly from server-http during startup if needed.
 */
export function preregisterClient(clientId: string, redirectUris: string[], clientName?: string): void {
  clients.set(clientId, {
    clientId,
    clientName,
    redirectUris,
    createdAt: Date.now(),
  })
}
