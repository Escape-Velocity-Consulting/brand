import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { log, truncId } from './logger.js'

/**
 * File-backed store for OAuth refresh tokens.
 *
 * Refresh tokens are opaque (`rt_<32 random bytes b64url>`). The raw token
 * never touches disk — we persist only its SHA-256 hash. On consume, we look
 * up by hash, atomically delete the record (single-use = rotation), and
 * return the associated `sub` (email).
 *
 * File format:
 *   { "tokens": [{ "tokenHash": "...", "sub": "...", "expiresAt": <unix-s>, "createdAt": <unix-s> }] }
 */

interface RefreshTokenRecord {
  /** Hex SHA-256 of the raw refresh token. */
  tokenHash: string
  /** Authenticated user's email. */
  sub: string
  /** Unix timestamp (seconds). */
  expiresAt: number
  /** Unix timestamp (seconds). */
  createdAt: number
}

interface RefreshTokenFile {
  tokens: RefreshTokenRecord[]
}

/** Hex SHA-256 of the raw token. */
function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf-8').digest('hex')
}

/** Random opaque token. Prefix makes it grep-friendly in logs / network captures. */
function generateRawToken(): string {
  return `rt_${randomBytes(32).toString('base64url')}`
}

export class RefreshTokenStore {
  constructor(private readonly filePath: string) {}

  /**
   * Issue a new refresh token for `sub`. Returns the raw token (callers MUST
   * return this to the client in the /token response and then discard it —
   * only the hash is retained).
   */
  issue(sub: string, ttlSeconds: number): { token: string; expiresAt: number } {
    const raw = generateRawToken()
    const tokenHash = hashToken(raw)
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = now + ttlSeconds
    const records = this.load()
    records.push({ tokenHash, sub, expiresAt, createdAt: now })
    this.save(records)
    return { token: raw, expiresAt }
  }

  /**
   * Atomic lookup + delete. Returns the associated `sub` if the token exists
   * and is not expired; null otherwise. The record is removed regardless of
   * expiry — this enforces single-use (rotation) and prevents reuse of an
   * expired token.
   */
  consume(rawToken: string): { sub: string; tokenHash: string } | null {
    const tokenHash = hashToken(rawToken)
    const records = this.load()
    const idx = records.findIndex((r) => r.tokenHash === tokenHash)
    if (idx < 0) return null
    const [record] = records.splice(idx, 1)
    this.save(records)
    const now = Math.floor(Date.now() / 1000)
    if (record.expiresAt <= now) return null
    return { sub: record.sub, tokenHash }
  }

  /** Drop all tokens for a given `sub`. Used on allowlist removal or family revocation. */
  revoke(sub: string): number {
    const records = this.load()
    const kept = records.filter((r) => r.sub !== sub)
    const removed = records.length - kept.length
    if (removed > 0) this.save(kept)
    return removed
  }

  /** Drop expired records. Returns counts. */
  prune(): { pruned: number; live: number } {
    const now = Math.floor(Date.now() / 1000)
    const records = this.load()
    const live = records.filter((r) => r.expiresAt > now)
    const pruned = records.length - live.length
    if (pruned > 0) this.save(live)
    return { pruned, live: live.length }
  }

  /** Total record count (for diagnostics). */
  count(): number {
    return this.load().length
  }

  private load(): RefreshTokenRecord[] {
    try {
      if (!existsSync(this.filePath)) return []
      const raw = readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as RefreshTokenFile
      return Array.isArray(parsed?.tokens) ? parsed.tokens : []
    } catch (err) {
      log('refresh_store_load_fail', { err: err instanceof Error ? err : String(err), file: this.filePath })
      return []
    }
  }

  private save(records: RefreshTokenRecord[]): void {
    try {
      writeFileSync(this.filePath, JSON.stringify({ tokens: records }, null, 2), 'utf-8')
    } catch (err) {
      log('refresh_store_save_fail', { err: err instanceof Error ? err : String(err), file: this.filePath })
    }
  }
}

/** Exported for unit tests. */
export const __testing = { hashToken, generateRawToken }
