import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Persistent record of a multi-file render bundle.
 *
 * Render tools that produce more than one artifact (decks, carousels, documents
 * with sidecar previews) wrap their writes in a bundle scope on the OutputSink.
 * At endBundle() the sink writes a manifest to the artifact-store directory
 * (which already has TTL cleanup on the same cadence as the artifacts it
 * references). The publish flow reads the manifest by bundleId, copies each
 * referenced file out of the ephemeral store into the published store, and
 * gives the caller a stable URL.
 *
 * Storage layout: `<storeDir>/<bundleId>.bundle.json`
 */

export type BundleType = 'deck' | 'document' | 'image' | 'carousel' | 'html-pdf' | 'html-png'

export interface BundleFile {
  /** Logical name within the bundle (e.g. "slides/slide-01.png"). Used as the on-disk path under the published item. */
  relativeName: string
  /** UUID of the artifact in the ArtifactStore (so publish can locate the file bytes). */
  artifactUuid: string
  /** Suggested filename (used for Content-Disposition on download). */
  filename: string
  mime: string
  bytes: number
}

export interface Bundle {
  bundleId: string
  type: BundleType
  title: string
  /** Relative name of the file to open first (e.g. "index.html" for a deck, "<slug>.pdf" for a document). */
  primaryFile?: string
  /** Relative name of the file to use as a thumbnail in listings (e.g. "slides/slide-01.png"). */
  thumbnailFile?: string
  files: BundleFile[]
  createdAt: string
}

export class BundleStore {
  constructor(private readonly storeDir: string) {}

  write(bundle: Bundle): void {
    const path = this.pathFor(bundle.bundleId)
    writeFileSync(path, JSON.stringify(bundle), 'utf-8')
  }

  read(bundleId: string): Bundle | null {
    const path = this.pathFor(bundleId)
    if (!existsSync(path)) return null
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as Bundle
    } catch {
      return null
    }
  }

  delete(bundleId: string): void {
    const path = this.pathFor(bundleId)
    try { unlinkSync(path) } catch { /* ignore */ }
  }

  private pathFor(bundleId: string): string {
    // Guard against path traversal in the bundleId.
    if (!/^[A-Za-z0-9_-]{4,32}$/.test(bundleId)) {
      throw new Error(`Invalid bundleId: ${bundleId}`)
    }
    return join(this.storeDir, `${bundleId}.bundle.json`)
  }
}
