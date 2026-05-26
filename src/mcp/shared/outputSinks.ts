import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { basename, extname, isAbsolute, resolve } from 'node:path'
import type { Bundle, BundleStore, BundleType } from './bundleStore.js'
import { resolveOutputPath } from './resolveOutputPath.js'

/**
 * What a tool gets back from `ctx.outputSink.write()`. Discriminated union so
 * downstream tool code can return it directly without branching on transport.
 */
export type WriteResult =
  | { kind: 'path';  path: string; bytes: number; mime: string; filename: string }
  | { kind: 'url';   url: string;  bytes: number; mime: string; filename: string; expiresAt: string }

export interface WriteOptions {
  /** MIME type of the buffer. Used to pick file extension and Content-Type on download. */
  mime: string
  /**
   * Default filename used when the caller hasn't given one. Pure name, no path.
   * E.g. "letter.pdf", "og.png". The extension should match `mime`.
   */
  suggestedName: string
  /**
   * Output path the caller asked for (CWD-relative or absolute).
   * - LocalOutputSink: honored — file is written there.
   * - RemoteOutputSink: only the basename is used as a download-filename hint.
   */
  requestedPath?: string
  /**
   * Logical name within an open bundle (e.g. "slides/slide-01.png"). When the
   * sink is in a bundle scope, this is recorded in the bundle manifest so the
   * publish flow can recreate the directory layout. Falls back to `suggestedName`
   * if unset.
   */
  bundleRelativeName?: string
}

export interface BundleScopeOptions {
  type: BundleType
  title: string
  /** Relative name of the file to open first (e.g. "index.html"). */
  primaryFile?: string
  /** Relative name of the thumbnail file used by listings. */
  thumbnailFile?: string
}

export interface OutputSink {
  write(buffer: Buffer, opts: WriteOptions): Promise<WriteResult>
  /**
   * Open a bundle scope. Subsequent write() calls are recorded against the
   * bundle. Only the RemoteOutputSink implements this meaningfully — the local
   * sink no-ops (returns empty bundleId).
   */
  beginBundle(opts: BundleScopeOptions): string
  /** Finalize the current bundle. Returns the persisted Bundle, or null on local. */
  endBundle(): Bundle | null
  /** Marker for logging / introspection. */
  readonly kind: 'local' | 'remote'
}

// --- Local (stdio) ---

/**
 * Stdio-mode sink. Writes to the requested path (CWD-relative or absolute),
 * falling back to `<cwd>/<suggestedName>` when no path was given. Returns the
 * absolute file path so the agent can read it back.
 *
 * Bundle methods are no-ops: in stdio mode, files write to user-chosen paths
 * and publishing isn't a concept on this transport.
 */
export class LocalOutputSink implements OutputSink {
  readonly kind = 'local' as const

  async write(buffer: Buffer, opts: WriteOptions): Promise<WriteResult> {
    const target = opts.requestedPath ?? opts.suggestedName
    const path = resolveOutputPath(target)
    writeFileSync(path, buffer)
    return {
      kind: 'path',
      path,
      bytes: buffer.length,
      mime: opts.mime,
      filename: basename(path),
    }
  }

  beginBundle(_opts: BundleScopeOptions): string {
    return ''
  }

  endBundle(): Bundle | null {
    return null
  }
}

// --- Remote (HTTP) ---

/**
 * Function signature for the artifact-store wiring on the HTTP server. Wired
 * up in src/mcp/server-http.ts; kept as a callback so this module stays free
 * of artifact-store implementation details.
 */
export interface RemoteArtifactWriter {
  (buffer: Buffer, opts: { mime: string; filename: string }): Promise<{ url: string; expiresAt: string; uuid: string }>
}

interface InFlightBundle {
  bundleId: string
  type: BundleType
  title: string
  primaryFile?: string
  thumbnailFile?: string
  files: Bundle['files']
}

/**
 * HTTP-mode sink. Writes the buffer through the artifact store and returns a
 * signed download URL. `requestedPath` is treated purely as a filename hint
 * for the resulting Content-Disposition header.
 *
 * Bundle scope (optional): when a bundleStore is provided, callers can wrap a
 * sequence of writes in beginBundle()/endBundle() and a manifest file is
 * persisted alongside the artifacts. The publish flow promotes that bundle
 * to the persistent published store.
 */
export class RemoteOutputSink implements OutputSink {
  readonly kind = 'remote' as const
  private current: InFlightBundle | null = null

  constructor(
    private readonly writer: RemoteArtifactWriter,
    private readonly bundleStore?: BundleStore,
  ) {}

  async write(buffer: Buffer, opts: WriteOptions): Promise<WriteResult> {
    const filename = pickFilename(opts)
    const { url, expiresAt, uuid } = await this.writer(buffer, { mime: opts.mime, filename })
    if (this.current) {
      this.current.files.push({
        relativeName: opts.bundleRelativeName ?? filename,
        artifactUuid: uuid,
        filename,
        mime: opts.mime,
        bytes: buffer.length,
      })
    }
    return {
      kind: 'url',
      url,
      bytes: buffer.length,
      mime: opts.mime,
      filename,
      expiresAt,
    }
  }

  beginBundle(opts: BundleScopeOptions): string {
    if (!this.bundleStore) return '' // no-op if not wired
    if (this.current) {
      // Defensive: a previous scope was never closed. Discard it.
      this.current = null
    }
    const bundleId = generateBundleId()
    this.current = {
      bundleId,
      type: opts.type,
      title: opts.title,
      primaryFile: opts.primaryFile,
      thumbnailFile: opts.thumbnailFile,
      files: [],
    }
    return bundleId
  }

  endBundle(): Bundle | null {
    if (!this.current || !this.bundleStore) return null
    const bundle: Bundle = {
      bundleId: this.current.bundleId,
      type: this.current.type,
      title: this.current.title,
      primaryFile: this.current.primaryFile,
      thumbnailFile: this.current.thumbnailFile,
      files: this.current.files,
      createdAt: new Date().toISOString(),
    }
    this.bundleStore.write(bundle)
    this.current = null
    return bundle
  }
}

// --- Multi-output helpers ---

/**
 * Some tools (carousel, presentation) write a directory of files. They need
 * to write each individually through the sink. We expose a small helper that
 * takes a logical (file-relative-to-bundle) path and produces a sink result.
 *
 * For LocalOutputSink, multi-file outputs target a directory; we resolve each
 * relative path under it. For RemoteOutputSink, every file becomes its own
 * independent signed URL (and is recorded against any open bundle scope).
 */
export interface BundleEntryOptions {
  /** Logical relative name within the bundle (e.g. "slides/slide-01.png"). */
  relativeName: string
  mime: string
  /** Bundle root (LocalOutputSink only — required when emitting multi-file output). */
  bundleDir?: string
}

export async function writeBundleEntry(sink: OutputSink, buffer: Buffer, opts: BundleEntryOptions): Promise<WriteResult> {
  if (sink.kind === 'local') {
    if (!opts.bundleDir) throw new Error('LocalOutputSink bundle entry requires bundleDir')
    const target = isAbsolute(opts.bundleDir)
      ? resolve(opts.bundleDir, opts.relativeName)
      : resolve(process.cwd(), opts.bundleDir, opts.relativeName)
    return sink.write(buffer, {
      mime: opts.mime,
      suggestedName: opts.relativeName,
      requestedPath: target,
    })
  }
  // Remote: filename is the leaf name; the URL is independent for each entry.
  // The relativeName is recorded against any open bundle scope on the sink.
  return sink.write(buffer, {
    mime: opts.mime,
    suggestedName: basename(opts.relativeName),
    bundleRelativeName: opts.relativeName,
  })
}

// --- Internals ---

function pickFilename(opts: WriteOptions): string {
  if (opts.requestedPath) {
    const base = basename(opts.requestedPath)
    if (base) return base
  }
  return opts.suggestedName
}

function generateBundleId(): string {
  // 8 random bytes → 11 chars of base64url; slice to 10. Same shape as
  // PublishedStore's IDs but different ID space (different prefix in path
  // disambiguates them at rest).
  return randomBytes(8).toString('base64url').slice(0, 10)
}

/** Extension hint for a mime. Used by the artifact store when picking a file extension. */
export function extensionForMime(mime: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
    'text/html': '.html',
    'application/json': '.json',
    'application/octet-stream': '.bin',
  }
  return map[mime] ?? '.bin'
}

/** Pick an extension by suggested filename first, falling back to mime. */
export function extensionForOpts(opts: { mime: string; filename?: string }): string {
  if (opts.filename) {
    const ext = extname(opts.filename)
    if (ext) return ext
  }
  return extensionForMime(opts.mime)
}
