/**
 * JWT-based bearer auth for the MCP `/mcp` endpoint.
 *
 * Tokens are HS256 JWTs signed with `MCP_JWT_SECRET`. Issued by our /token
 * endpoint after a successful OAuth flow (Google sign-in + email allowlist
 * check). Required claims:
 *   - `sub`: the authenticated user's email
 *   - `aud`: this server's public base URL (audience binding)
 *   - `iss`: this server's public base URL
 *   - `exp`: expiry (issued at +1h by default)
 *   - `iat`: issued-at
 *
 * Validation also re-checks the `sub` against the runtime allowlist on every
 * request — so revocation works instantly by editing the env var + redeploy
 * (no token-store needed).
 *
 * During the OAuth migration, the legacy static `MCP_BEARER_TOKEN` is still
 * accepted as a fallback. Remove once Claude Desktop OAuth is verified.
 */
import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const HS256 = 'HS256'

export interface AuthConfig {
  /** HS256 secret for signing + verifying JWTs. 32+ bytes recommended. */
  jwtSecret: string
  /** Public base URL of this MCP server (e.g. https://mcp.escapevelocity.consulting). Used as JWT iss + aud. */
  publicBaseUrl: string
  /** Email allowlist. Tokens with `sub` not in this set are rejected. */
  allowedEmails: Set<string>
  /** Legacy static bearer token. Kept as a fallback during OAuth migration. Empty string disables. */
  legacyBearerToken?: string
}

export interface AuthedRequest {
  /** The email this request is authenticated as. */
  email: string
  /** Whether the token was a legacy static bearer (vs. JWT). */
  legacy: boolean
}

const encoder = new TextEncoder()

/**
 * Issue a JWT access token for an authenticated user.
 * Default TTL: 1 hour.
 */
export async function issueAccessToken(
  email: string,
  config: AuthConfig,
  ttlSeconds = 3600,
): Promise<{ token: string; expiresAt: Date; expiresIn: number }> {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + ttlSeconds
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: HS256 })
    .setSubject(email)
    .setIssuer(config.publicBaseUrl)
    .setAudience(config.publicBaseUrl)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(encoder.encode(config.jwtSecret))
  return {
    token,
    expiresAt: new Date(exp * 1000),
    expiresIn: ttlSeconds,
  }
}

/**
 * Verify a bearer token from a request. Returns the authenticated identity
 * on success, or writes a 401 and returns null.
 *
 * Tries JWT first (the production path). Falls back to constant-time
 * comparison against the legacy static bearer if provided.
 *
 * On 401, writes `WWW-Authenticate: Bearer resource_metadata="…"` so MCP
 * clients can discover the OAuth flow via RFC 9728.
 */
export async function authenticate(
  req: IncomingMessage,
  res: ServerResponse,
  config: AuthConfig,
): Promise<AuthedRequest | null> {
  const provided = extractBearer(req.headers.authorization)
  if (!provided) {
    sendUnauthorized(res, config.publicBaseUrl, 'missing_token', 'Authorization required')
    return null
  }

  // Try JWT first (production path).
  if (looksLikeJwt(provided)) {
    try {
      const { payload } = await jwtVerify(provided, encoder.encode(config.jwtSecret), {
        algorithms: [HS256],
        issuer: config.publicBaseUrl,
        audience: config.publicBaseUrl,
      })
      const email = typeof payload.sub === 'string' ? payload.sub : ''
      if (!email) {
        sendUnauthorized(res, config.publicBaseUrl, 'invalid_token', 'Token missing subject')
        return null
      }
      if (!config.allowedEmails.has(email)) {
        sendUnauthorized(res, config.publicBaseUrl, 'invalid_token', `Email not on allowlist: ${email}`)
        return null
      }
      return { email, legacy: false }
    } catch (err) {
      // JWT looked like one but failed verification — surface the reason but
      // don't fall through to the static bearer (that would mask real auth bugs).
      const msg = err instanceof Error ? err.message : 'JWT verification failed'
      sendUnauthorized(res, config.publicBaseUrl, 'invalid_token', msg)
      return null
    }
  }

  // Fall back to legacy static bearer (test runner uses this).
  if (config.legacyBearerToken && constantTimeEqual(provided, config.legacyBearerToken)) {
    return { email: 'legacy-bearer', legacy: true }
  }

  sendUnauthorized(res, config.publicBaseUrl, 'invalid_token', 'Token rejected')
  return null
}

/**
 * Decode a JWT payload without verification. Used only for non-security
 * inspection (e.g. logging). Returns null if the token is malformed.
 */
export function decodeUnverified(token: string): JWTPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const decoded = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
    return JSON.parse(decoded) as JWTPayload
  } catch { return null }
}

// ─── Internals ─────────────────────────────────────────────────────────────

function extractBearer(header: string | undefined): string | null {
  if (!header) return null
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  return m ? m[1].trim() : null
}

function looksLikeJwt(token: string): boolean {
  // Three base64url segments separated by dots. JWTs are recognisably structured.
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf-8')
  const bBuf = Buffer.from(b, 'utf-8')
  if (aBuf.length !== bBuf.length) {
    const pad = Buffer.alloc(Math.max(aBuf.length, bBuf.length))
    timingSafeEqual(Buffer.concat([aBuf, pad]).subarray(0, pad.length), Buffer.concat([bBuf, pad]).subarray(0, pad.length))
    return false
  }
  return timingSafeEqual(aBuf, bBuf)
}

function sendUnauthorized(res: ServerResponse, publicBaseUrl: string, errorCode: string, description: string): void {
  if (res.headersSent) return
  // RFC 9728: indicate where to find the protected-resource metadata so the
  // client can discover the OAuth authorization server.
  const resourceMetadataUrl = `${publicBaseUrl}/.well-known/oauth-protected-resource`
  res.writeHead(401, {
    'Content-Type': 'application/json',
    'WWW-Authenticate': `Bearer realm="brand-mcp", error="${errorCode}", error_description="${escapeQuotes(description)}", resource_metadata="${resourceMetadataUrl}"`,
  })
  res.end(JSON.stringify({ error: errorCode, error_description: description }))
}

function escapeQuotes(s: string): string {
  return s.replace(/"/g, '\\"')
}
