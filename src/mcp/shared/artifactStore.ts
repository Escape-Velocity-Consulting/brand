import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { extensionForOpts } from './outputSinks.js'
import { sign, verify } from './signedToken.js'

/**
 * On-disk artifact store + signed-URL issuer.
 *
 * Layout:
 *   <storeDir>/<uuid>.<ext>        ← the actual file bytes
 *   <storeDir>/<uuid>.meta         ← JSON { mime, filename }
 *
 * write() returns a URL like `<publicBaseUrl>/artifacts/<token>` where token
 * is a signed token from signedToken.ts. The URL path is the only credential
 * a downloader needs.
 *
 * A periodic cleanup loop sweeps expired files. The expiry is encoded in the
 * token; the store also stores a sidecar mtime check as a safety net for the
 * very-old-file case (e.g. cleanup was paused, files predate any live token).
 */

export interface ArtifactStoreOptions {
  /** Absolute path to the on-disk store directory. Created if missing. */
  storeDir: string
  /** Public base URL for download links (no trailing slash). E.g. https://mcp.x.tld */
  publicBaseUrl: string
  /** Path prefix on the public URL. Default "/artifacts". */
  pathPrefix?: string
  /** HMAC secret for signing tokens. */
  signingSecret: string
  /** TTL in seconds for issued URLs. Default 3600 (1h). */
  ttlSeconds?: number
}

export interface ArtifactMeta {
  mime: string
  filename: string
}

export interface WriteArtifactResult {
  url: string
  expiresAt: string
  uuid: string
}

export interface ResolvedArtifact {
  filePath: string
  meta: ArtifactMeta
}

export class ArtifactStore {
  private readonly storeDir: string
  private readonly publicBaseUrl: string
  private readonly pathPrefix: string
  private readonly signingSecret: string
  private readonly ttlSeconds: number
  private cleanupHandle?: NodeJS.Timeout

  constructor(opts: ArtifactStoreOptions) {
    this.storeDir = opts.storeDir
    this.publicBaseUrl = opts.publicBaseUrl.replace(/\/+$/, '')
    this.pathPrefix = (opts.pathPrefix ?? '/artifacts').replace(/\/+$/, '')
    this.signingSecret = opts.signingSecret
    this.ttlSeconds = opts.ttlSeconds ?? 3600
    if (!existsSync(this.storeDir)) mkdirSync(this.storeDir, { recursive: true })
  }

  async write(buffer: Buffer, meta: ArtifactMeta): Promise<WriteArtifactResult> {
    const signed = sign(this.signingSecret, this.ttlSeconds)
    const ext = extensionForOpts({ mime: meta.mime, filename: meta.filename })
    const filePath = join(this.storeDir, `${signed.uuid}${ext}`)
    const metaPath = join(this.storeDir, `${signed.uuid}.meta`)
    writeFileSync(filePath, buffer)
    writeFileSync(metaPath, JSON.stringify(meta), 'utf-8')
    return {
      url: `${this.publicBaseUrl}${this.pathPrefix}/${signed.token}`,
      expiresAt: signed.expiresAt.toISOString(),
      uuid: signed.uuid,
    }
  }

  /** Resolve a signed token to a file path + meta, or null on any failure. */
  resolve(token: string): ResolvedArtifact | null {
    const verified = verify(this.signingSecret, token)
    if (!verified) return null
    const metaPath = join(this.storeDir, `${verified.uuid}.meta`)
    if (!existsSync(metaPath)) return null
    let meta: ArtifactMeta
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as ArtifactMeta
    } catch {
      return null
    }
    const ext = extensionForOpts({ mime: meta.mime, filename: meta.filename })
    const filePath = join(this.storeDir, `${verified.uuid}${ext}`)
    if (!existsSync(filePath)) return null
    return { filePath, meta }
  }

  /** Remove files older than (ttl + grace). */
  cleanupOnce(graceSeconds: number = 60): { removed: number } {
    if (!existsSync(this.storeDir)) return { removed: 0 }
    const cutoffMs = Date.now() - (this.ttlSeconds + graceSeconds) * 1000
    let removed = 0
    for (const entry of readdirSync(this.storeDir)) {
      const p = join(this.storeDir, entry)
      try {
        const st = statSync(p)
        if (!st.isFile()) continue
        if (st.mtimeMs < cutoffMs) {
          unlinkSync(p)
          removed++
        }
      } catch {
        // Ignore (race with concurrent download or external cleanup)
      }
    }
    return { removed }
  }

  /** Start the periodic cleanup loop. Stop with stopCleanup(). */
  startCleanup(intervalSeconds: number = 300): void {
    if (this.cleanupHandle) return
    this.cleanupHandle = setInterval(() => {
      try { this.cleanupOnce() } catch {}
    }, intervalSeconds * 1000)
    // Don't block process exit on the cleanup loop alone.
    this.cleanupHandle.unref?.()
  }

  stopCleanup(): void {
    if (this.cleanupHandle) {
      clearInterval(this.cleanupHandle)
      this.cleanupHandle = undefined
    }
  }
}

/** For diagnostic logging. */
export function summarizeStore(storeDir: string): { fileCount: number; bytes: number } {
  if (!existsSync(storeDir)) return { fileCount: 0, bytes: 0 }
  let fileCount = 0
  let bytes = 0
  for (const entry of readdirSync(storeDir)) {
    if (extname(entry) === '.meta') continue
    try {
      const st = statSync(join(storeDir, entry))
      if (st.isFile()) { fileCount++; bytes += st.size }
    } catch {}
  }
  return { fileCount, bytes }
}
