import { writeFileSync } from 'node:fs'
import { basename, extname, isAbsolute, resolve } from 'node:path'
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
}

export interface OutputSink {
  write(buffer: Buffer, opts: WriteOptions): Promise<WriteResult>
  /** Marker for logging / introspection. */
  readonly kind: 'local' | 'remote'
}

// --- Local (stdio) ---

/**
 * Stdio-mode sink. Writes to the requested path (CWD-relative or absolute),
 * falling back to `<cwd>/<suggestedName>` when no path was given. Returns the
 * absolute file path so the agent can read it back.
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
}

// --- Remote (HTTP) ---

/**
 * Function signature for the artifact-store wiring on the HTTP server. Wired
 * up in src/mcp/server-http.ts; kept as a callback so this module stays free
 * of artifact-store implementation details.
 */
export interface RemoteArtifactWriter {
  (buffer: Buffer, opts: { mime: string; filename: string }): Promise<{ url: string; expiresAt: string }>
}

/**
 * HTTP-mode sink. Writes the buffer through the artifact store and returns a
 * signed download URL. `requestedPath` is treated purely as a filename hint
 * for the resulting Content-Disposition header.
 */
export class RemoteOutputSink implements OutputSink {
  readonly kind = 'remote' as const
  constructor(private readonly writer: RemoteArtifactWriter) {}

  async write(buffer: Buffer, opts: WriteOptions): Promise<WriteResult> {
    const filename = pickFilename(opts)
    const { url, expiresAt } = await this.writer(buffer, { mime: opts.mime, filename })
    return {
      kind: 'url',
      url,
      bytes: buffer.length,
      mime: opts.mime,
      filename,
      expiresAt,
    }
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
 * independent signed URL.
 */
export interface BundleOptions {
  /** Logical relative name within the bundle (e.g. "slides/slide-01.png"). */
  relativeName: string
  mime: string
  /** Bundle root (LocalOutputSink only — required when emitting multi-file output). */
  bundleDir?: string
}

export async function writeBundleEntry(sink: OutputSink, buffer: Buffer, opts: BundleOptions): Promise<WriteResult> {
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
  // Remote: filename is the leaf name; the URL is independent for each entry
  return sink.write(buffer, {
    mime: opts.mime,
    suggestedName: basename(opts.relativeName),
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
