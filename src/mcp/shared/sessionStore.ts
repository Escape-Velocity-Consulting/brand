import { existsSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * File-backed store for MCP session IDs.
 *
 * Persists session IDs (with expiry) to a JSON file in the artifact store
 * directory. On server startup, `getAll()` returns all non-expired IDs so the
 * server can pre-create transports for them — allowing reconnecting clients
 * to find their session in the Map without needing to change their session ID.
 *
 * File format: { "sessions": [{ "id": "...", "expiresAt": <unix-seconds> }] }
 */

interface SessionRecord {
  id: string
  expiresAt: number  // Unix timestamp in seconds
}

interface SessionFile {
  sessions: SessionRecord[]
}

export class SessionStore {
  constructor(private readonly filePath: string) {}

  /** Upsert a session record with the given TTL from now. */
  set(id: string, ttlSeconds: number): void {
    const records = this.load()
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds
    const idx = records.findIndex((r) => r.id === id)
    if (idx >= 0) {
      records[idx].expiresAt = expiresAt
    } else {
      records.push({ id, expiresAt })
    }
    this.save(records)
  }

  /** Remove a session record. */
  delete(id: string): void {
    const records = this.load().filter((r) => r.id !== id)
    this.save(records)
  }

  /**
   * Return all non-expired session IDs.
   * Also prunes expired records from the file as a side effect.
   */
  getAll(): string[] {
    const now = Math.floor(Date.now() / 1000)
    const records = this.load()
    const live = records.filter((r) => r.expiresAt > now)
    if (live.length < records.length) {
      this.save(live)
    }
    return live.map((r) => r.id)
  }

  private load(): SessionRecord[] {
    try {
      if (!existsSync(this.filePath)) return []
      const raw = readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as SessionFile
      return Array.isArray(parsed?.sessions) ? parsed.sessions : []
    } catch {
      return []
    }
  }

  private save(records: SessionRecord[]): void {
    try {
      writeFileSync(this.filePath, JSON.stringify({ sessions: records }, null, 2), 'utf-8')
    } catch (err) {
      console.error('[SessionStore] failed to write sessions file:', err)
    }
  }
}
