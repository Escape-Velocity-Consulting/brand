import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Constant-time bearer-token check for incoming HTTP requests.
 *
 * Returns `true` if the request carries a valid `Authorization: Bearer <token>`
 * header matching `expectedToken`. Otherwise writes a 401 response (with a
 * `WWW-Authenticate: Bearer` header) and returns `false`.
 *
 * Caller pattern:
 *   if (!checkBearer(req, res, expectedToken)) return
 *   // ... handle request
 */
export function checkBearer(req: IncomingMessage, res: ServerResponse, expectedToken: string): boolean {
  if (!expectedToken) {
    sendUnauthorized(res, 'server misconfigured: no bearer token set')
    return false
  }
  const provided = extractBearer(req.headers.authorization)
  if (!provided) {
    sendUnauthorized(res, 'missing bearer token')
    return false
  }
  if (!constantTimeEqual(provided, expectedToken)) {
    sendUnauthorized(res, 'invalid bearer token')
    return false
  }
  return true
}

/** Constant-time string equality. Safe against length leaks (compares fixed-length hashes). */
export function constantTimeEqual(a: string, b: string): boolean {
  // Compare lengths via timingSafeEqual on length buffers to mask length leak too.
  const aBuf = Buffer.from(a, 'utf-8')
  const bBuf = Buffer.from(b, 'utf-8')
  if (aBuf.length !== bBuf.length) {
    // Still touch both buffers to avoid an early-return timing signal on common-prefix attacks.
    const pad = Buffer.alloc(Math.max(aBuf.length, bBuf.length))
    timingSafeEqual(Buffer.concat([aBuf, pad]).subarray(0, pad.length), Buffer.concat([bBuf, pad]).subarray(0, pad.length))
    return false
  }
  return timingSafeEqual(aBuf, bBuf)
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  return m ? m[1].trim() : null
}

function sendUnauthorized(res: ServerResponse, reason: string): void {
  if (res.headersSent) return
  res.writeHead(401, {
    'Content-Type': 'application/json',
    'WWW-Authenticate': 'Bearer realm="brand-mcp"',
  })
  res.end(JSON.stringify({ error: 'unauthorized', reason }))
}
