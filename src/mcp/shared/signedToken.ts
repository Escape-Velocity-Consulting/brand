import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

/**
 * Stateless HMAC-signed tokens for artifact download URLs.
 *
 * Token format: <uuid>.<expUnix>.<hmacHex>
 *   uuid     — opaque artifact id (also used as the on-disk filename stem)
 *   expUnix  — absolute expiry as Unix seconds (string of digits)
 *   hmacHex  — HMAC-SHA256("<uuid>.<expUnix>", secret), lowercase hex
 *
 * No server-side session state. Restarts don't invalidate tokens (the secret
 * is stable per deployment); only the underlying file getting cleaned up
 * makes a download fail.
 */

export interface SignedToken {
  token: string
  uuid: string
  expiresAt: Date
}

export interface VerifiedToken {
  uuid: string
  expiresAt: Date
}

export function sign(secret: string, ttlSeconds: number, uuid: string = randomUUID()): SignedToken {
  if (!secret) throw new Error('signedToken: secret is required')
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('signedToken: ttlSeconds must be a positive number')
  }
  const expUnix = Math.floor(Date.now() / 1000) + Math.floor(ttlSeconds)
  const payload = `${uuid}.${expUnix}`
  const hmac = createHmac('sha256', secret).update(payload).digest('hex')
  return {
    token: `${payload}.${hmac}`,
    uuid,
    expiresAt: new Date(expUnix * 1000),
  }
}

export function verify(secret: string, token: string, now: Date = new Date()): VerifiedToken | null {
  if (!secret || typeof token !== 'string') return null
  // Token format: <uuid>.<expUnix>.<hmacHex>
  const lastDot = token.lastIndexOf('.')
  if (lastDot < 0) return null
  const payload = token.slice(0, lastDot)
  const providedHmacHex = token.slice(lastDot + 1)

  const firstDot = payload.indexOf('.')
  if (firstDot < 0) return null
  const uuid = payload.slice(0, firstDot)
  const expStr = payload.slice(firstDot + 1)
  if (!/^\d+$/.test(expStr)) return null
  const expUnix = parseInt(expStr, 10)

  // Constant-time HMAC compare
  const expected = createHmac('sha256', secret).update(payload).digest()
  let provided: Buffer
  try {
    provided = Buffer.from(providedHmacHex, 'hex')
  } catch {
    return null
  }
  if (provided.length !== expected.length) return null
  if (!timingSafeEqual(provided, expected)) return null

  // Expiry check after HMAC so timing doesn't leak which one failed
  if (Math.floor(now.getTime() / 1000) >= expUnix) return null

  return { uuid, expiresAt: new Date(expUnix * 1000) }
}

/** Generate a 64-char hex secret. Used for one-time secret bootstrapping. */
export function generateSecret(): string {
  return randomBytes(32).toString('hex')
}
