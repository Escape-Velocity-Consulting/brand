import { randomBytes } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, sep } from 'node:path'
import type { Bundle, BundleStore, BundleType } from './bundleStore.js'
import { extensionForOpts } from './outputSinks.js'

/**
 * On-disk store of *published* render bundles.
 *
 * Where ArtifactStore is ephemeral (1h TTL, HMAC-signed URLs, files keyed by
 * UUID), PublishedStore is persistent (lives on a host-mounted volume), serves
 * files at unauthenticated stable URLs, and groups files by a short
 * human-readable ID.
 *
 * Layout under `<publishedDir>`:
 *
 *   <id>/                      ← ~10-char base64 ID
 *     meta.json                ← serialized PublishedItem
 *     index.html               ← (for decks) the viewer
 *     <stem>.pdf               ← the PDF
 *     slides/slide-01.png      ← per-slide PNGs (for decks)
 *     ...
 *
 * Publish copies the referenced artifacts out of the ephemeral ArtifactStore
 * into this layout. Unpublish removes the directory. List walks the dir and
 * reads meta.json from each subdir.
 *
 * Files written here are *not* HMAC-signed. The published store serves them
 * directly at `GET /published/<id>/<relativeName>` with no auth — that's what
 * "published" means.
 */

export interface PublishedFile {
  relativeName: string
  filename: string
  mime: string
  bytes: number
}

export interface PublishedItem {
  id: string
  type: BundleType
  title: string
  publishedAt: string
  primaryFile?: string
  thumbnailFile?: string
  files: PublishedFile[]
}

export interface PublishOptions {
  /** Override the bundle's auto-derived title. */
  title?: string
  /** Override the bundle's inferred type. */
  type?: BundleType
}

export interface PublishedStoreOptions {
  publishedDir: string
  artifactStoreDir: string
  bundleStore: BundleStore
}

export class PublishedStore {
  private readonly publishedDir: string
  private readonly artifactStoreDir: string
  private readonly bundleStore: BundleStore

  constructor(opts: PublishedStoreOptions) {
    this.publishedDir = opts.publishedDir
    this.artifactStoreDir = opts.artifactStoreDir
    this.bundleStore = opts.bundleStore
    if (!existsSync(this.publishedDir)) {
      mkdirSync(this.publishedDir, { recursive: true })
    }
  }

  /**
   * Promote a bundle's files from the ephemeral artifact store to the
   * persistent published store. Returns the created PublishedItem.
   *
   * Throws if the bundle manifest can't be found (it expired, was already
   * cleaned up, or the bundleId is wrong) or if any referenced artifact is
   * missing on disk.
   */
  publish(bundleId: string, opts: PublishOptions = {}): PublishedItem {
    const bundle = this.bundleStore.read(bundleId)
    if (!bundle) {
      throw new Error(`Bundle not found or expired: ${bundleId}`)
    }

    const id = this.allocateId()
    const itemRoot = join(this.publishedDir, id)
    mkdirSync(itemRoot, { recursive: true })

    try {
      for (const f of bundle.files) {
        const source = this.artifactPath(f)
        if (!existsSync(source)) {
          throw new Error(`Artifact missing on disk: ${f.artifactUuid} (${f.filename})`)
        }
        const dest = join(itemRoot, f.relativeName)
        mkdirSync(dirname(dest), { recursive: true })
        copyFileSync(source, dest)
      }
    } catch (err) {
      // Best-effort rollback on partial copy.
      try { rmSync(itemRoot, { recursive: true, force: true }) } catch {}
      throw err
    }

    const item: PublishedItem = {
      id,
      type: opts.type ?? bundle.type,
      title: opts.title ?? bundle.title,
      publishedAt: new Date().toISOString(),
      primaryFile: bundle.primaryFile,
      thumbnailFile: bundle.thumbnailFile,
      files: bundle.files.map((f) => ({
        relativeName: f.relativeName,
        filename: f.filename,
        mime: f.mime,
        bytes: f.bytes,
      })),
    }
    writeFileSync(join(itemRoot, 'meta.json'), JSON.stringify(item, null, 2), 'utf-8')

    // The bundle manifest is no longer needed; cleaning it up early avoids a
    // confusing "publish twice from the same bundleId" footgun.
    this.bundleStore.delete(bundleId)

    return item
  }

  unpublish(id: string): { id: string; removed: boolean } {
    if (!isValidId(id)) return { id, removed: false }
    const itemRoot = join(this.publishedDir, id)
    if (!existsSync(itemRoot)) return { id, removed: false }
    rmSync(itemRoot, { recursive: true, force: true })
    return { id, removed: true }
  }

  list(filter: { type?: BundleType } = {}): PublishedItem[] {
    if (!existsSync(this.publishedDir)) return []
    const out: PublishedItem[] = []
    for (const entry of readdirSync(this.publishedDir)) {
      const item = this.get(entry)
      if (!item) continue
      if (filter.type && item.type !== filter.type) continue
      out.push(item)
    }
    return out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }

  get(id: string): PublishedItem | null {
    if (!isValidId(id)) return null
    const metaPath = join(this.publishedDir, id, 'meta.json')
    if (!existsSync(metaPath)) return null
    try {
      return JSON.parse(readFileSync(metaPath, 'utf-8')) as PublishedItem
    } catch {
      return null
    }
  }

  /**
   * Resolve a published-item file for HTTP serving. Returns null if the item
   * doesn't exist, the file isn't part of the bundle, or path traversal is
   * attempted.
   */
  resolveFile(id: string, relativeName: string): { absPath: string; mime: string; filename: string } | null {
    const item = this.get(id)
    if (!item) return null
    const file = item.files.find((f) => f.relativeName === relativeName)
    if (!file) return null
    const itemRoot = join(this.publishedDir, id)
    const absPath = join(itemRoot, relativeName)
    // Path-traversal guard: the resolved path must live under itemRoot.
    const rootWithSep = itemRoot.endsWith(sep) ? itemRoot : itemRoot + sep
    if (!absPath.startsWith(rootWithSep)) return null
    if (!existsSync(absPath)) return null
    return { absPath, mime: file.mime, filename: file.filename }
  }

  /**
   * Absolute path to the directory holding a published item's files, or null
   * if the item doesn't exist. Used by `publish_artifact` to bake the QR code
   * onto the title slide after the initial copy.
   */
  getItemDir(id: string): string | null {
    if (!isValidId(id)) return null
    const itemRoot = join(this.publishedDir, id)
    return existsSync(itemRoot) ? itemRoot : null
  }

  /**
   * Re-scan files on disk and rewrite meta.json. Handles:
   *  - new files (e.g. `qr-title.png` added at bake time)
   *  - changed file sizes (e.g. patched `index.html`, regenerated `slide-01.png`)
   *
   * Pass `addedFiles` for entries not yet in the manifest. Existing entries
   * have their `bytes` field refreshed from disk.
   */
  refreshMeta(id: string, addedFiles: Array<{ relativeName: string; filename: string; mime: string }> = []): void {
    if (!isValidId(id)) return
    const item = this.get(id)
    if (!item) return
    const itemRoot = join(this.publishedDir, id)

    // Refresh sizes for known files.
    for (const f of item.files) {
      const p = join(itemRoot, f.relativeName)
      if (existsSync(p)) f.bytes = statSync(p).size
    }

    // Register any newly added files that weren't in the manifest.
    for (const added of addedFiles) {
      if (item.files.some((f) => f.relativeName === added.relativeName)) continue
      const p = join(itemRoot, added.relativeName)
      if (!existsSync(p)) continue
      item.files.push({
        relativeName: added.relativeName,
        filename: added.filename,
        mime: added.mime,
        bytes: statSync(p).size,
      })
    }

    writeFileSync(join(itemRoot, 'meta.json'), JSON.stringify(item, null, 2), 'utf-8')
  }

  private artifactPath(f: { artifactUuid: string; mime: string; filename: string }): string {
    return join(this.artifactStoreDir, `${f.artifactUuid}${extensionForOpts({ mime: f.mime, filename: f.filename })}`)
  }

  private allocateId(): string {
    for (let i = 0; i < 8; i++) {
      const id = generateId()
      if (!existsSync(join(this.publishedDir, id))) return id
    }
    throw new Error('Could not allocate a unique published ID after 8 attempts')
  }
}

function generateId(): string {
  // 8 random bytes → 11 chars of base64url; slice to 10.
  return randomBytes(8).toString('base64url').slice(0, 10)
}

function isValidId(id: string): boolean {
  return /^[A-Za-z0-9_-]{4,32}$/.test(id)
}
