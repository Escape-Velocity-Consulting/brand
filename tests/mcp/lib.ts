/**
 * Shared fixture-running logic. Consumed by run.ts (stdio) and run-http.ts (HTTP).
 *
 * The runner is transport-agnostic: it takes an already-connected MCP Client
 * and a list of fixtures, calls each tool, validates the response, and downloads
 * any signed URLs into a per-test artifacts directory so the report has local
 * files to embed.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'

export interface FileAssertion {
  path: string
  exists?: boolean
  minBytes?: number
  maxBytes?: number
}

export interface Fixture {
  name: string
  tool: string
  args: Record<string, unknown>
  expect: {
    isError?: boolean
    structured?: Record<string, unknown>
    files?: FileAssertion[]
  }
}

export interface TestResult {
  name: string
  tool: string
  ok: boolean
  details: string[]
  ms: number
  request?: unknown
  response?: {
    isError: boolean
    structuredContent?: Record<string, unknown>
    content?: { type: string; text: string }[]
  }
}

// ─── placeholders ──────────────────────────────────────────────────────────

export function applyTmpPlaceholders(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\{\{TMP\}\}/g, tmpdir())
  if (Array.isArray(value)) return value.map(applyTmpPlaceholders)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = applyTmpPlaceholders(v)
    return out
  }
  return value
}

export function resolveStructuredRef(template: string, structured: Record<string, unknown>): string {
  return template.replace(/\{\{structured\.([^}]+)\}\}/g, (_, key: string) => {
    const parts = key.split('.')
    let cur: unknown = structured
    for (const p of parts) {
      if (cur === null || cur === undefined) return ''
      if (Array.isArray(cur)) cur = cur[parseInt(p, 10)]
      else if (typeof cur === 'object') cur = (cur as Record<string, unknown>)[p]
      else return ''
    }
    return cur === undefined || cur === null ? '' : String(cur)
  })
}

// ─── matchers ──────────────────────────────────────────────────────────────

interface MatcherResult { ok: boolean; reason?: string }

export function matchValue(actual: unknown, expected: unknown, path: string): MatcherResult {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    const m = expected as Record<string, unknown>
    if ('min' in m || 'max' in m) {
      if (typeof actual !== 'number') return { ok: false, reason: `${path}: expected number, got ${typeof actual}` }
      if (typeof m.min === 'number' && actual < m.min) return { ok: false, reason: `${path}: ${actual} < min ${m.min}` }
      if (typeof m.max === 'number' && actual > m.max) return { ok: false, reason: `${path}: ${actual} > max ${m.max}` }
      return { ok: true }
    }
    if (m.isString === true) {
      return typeof actual === 'string' ? { ok: true } : { ok: false, reason: `${path}: expected string, got ${typeof actual}` }
    }
    if (m.isArray === true) {
      if (!Array.isArray(actual)) return { ok: false, reason: `${path}: expected array, got ${typeof actual}` }
      const minLen = typeof m.minLength === 'number' ? m.minLength : 0
      if (actual.length < minLen) return { ok: false, reason: `${path}: array length ${actual.length} < ${minLen}` }
      return { ok: true }
    }
    if (typeof m.matches === 'string') {
      if (typeof actual !== 'string') return { ok: false, reason: `${path}: expected string, got ${typeof actual}` }
      return new RegExp(m.matches).test(actual) ? { ok: true } : { ok: false, reason: `${path}: "${actual}" doesn't match /${m.matches}/` }
    }
    if (actual === null || typeof actual !== 'object') {
      return { ok: false, reason: `${path}: expected object, got ${typeof actual}` }
    }
    const actualObj = actual as Record<string, unknown>
    for (const [k, v] of Object.entries(m)) {
      const r = matchValue(actualObj[k], v, `${path}.${k}`)
      if (!r.ok) return r
    }
    return { ok: true }
  }
  return actual === expected ? { ok: true } : { ok: false, reason: `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` }
}

// ─── HTTP-mode artifact materialisation ────────────────────────────────────

/**
 * Walk a structured response and download any URL-mode WriteResults into the
 * given directory. Mutates each WriteResult in place to add a `path` field
 * pointing at the local copy, so fixtures using `{{structured.X.path}}` work
 * unchanged across transports.
 *
 * No-ops on path-mode WriteResults (stdio).
 */
export async function materialiseUrlArtifacts(structured: unknown, downloadDir: string): Promise<number> {
  if (!structured) return 0
  let count = 0
  const visit = async (v: unknown): Promise<void> => {
    if (Array.isArray(v)) { for (const e of v) await visit(e); return }
    if (!v || typeof v !== 'object') return
    const obj = v as Record<string, unknown>
    if (obj.kind === 'url' && typeof obj.url === 'string') {
      const url = obj.url
      const filename = (typeof obj.filename === 'string' && obj.filename) ? obj.filename : `artifact-${count}.bin`
      mkdirSync(downloadDir, { recursive: true })
      const dest = resolve(downloadDir, `${String(count).padStart(2, '0')}-${filename}`)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`download failed (${res.status}) for ${url}`)
      const buf = Buffer.from(await res.arrayBuffer())
      writeFileSync(dest, buf)
      obj.path = dest  // back-fill so fixture assertions on `.path` work
      count++
      return
    }
    for (const child of Object.values(obj)) await visit(child)
  }
  await visit(structured)
  return count
}

// ─── core runner ───────────────────────────────────────────────────────────

export interface RunOptions {
  /**
   * Optional per-test download directory factory. When set (HTTP mode), the
   * runner downloads every URL-mode WriteResult into this dir before checking
   * file assertions.
   */
  downloadDirFor?: (testId: string) => string
}

export async function runFixture(client: Client, fixture: Fixture, testId: string, opts: RunOptions = {}): Promise<TestResult> {
  const details: string[] = []
  const t0 = Date.now()
  const args = applyTmpPlaceholders(fixture.args) as Record<string, unknown>

  let response: any
  try {
    response = await client.callTool({ name: fixture.tool, arguments: args })
  } catch (err) {
    return { name: fixture.name, tool: fixture.tool, ok: false, details: [`call threw: ${err instanceof Error ? err.message : String(err)}`], ms: Date.now() - t0, request: args }
  }

  const isError = !!response.isError
  const expectError = fixture.expect.isError === true
  if (isError !== expectError) {
    const firstText = response.content?.find((c: any) => c.type === 'text')?.text ?? ''
    details.push(`isError mismatch: expected ${expectError}, got ${isError}. content: ${firstText.slice(0, 200)}`)
  }

  const structured: Record<string, unknown> = response.structuredContent ?? {}

  // HTTP-mode: materialise URL artifacts first so subsequent path assertions work
  if (opts.downloadDirFor && !isError) {
    try {
      await materialiseUrlArtifacts(structured, opts.downloadDirFor(testId))
    } catch (err) {
      details.push(`artifact download failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (fixture.expect.structured) {
    for (const [k, v] of Object.entries(fixture.expect.structured)) {
      const r = matchValue(structured[k], v, k)
      if (!r.ok) details.push(`structured.${r.reason}`)
    }
  }

  if (fixture.expect.files) {
    for (const fa of fixture.expect.files) {
      const path = resolveStructuredRef(applyTmpPlaceholders(fa.path) as string, structured)
      const present = path !== '' && existsSync(path)
      const shouldExist = fa.exists !== false
      if (present !== shouldExist) {
        details.push(`file ${shouldExist ? 'missing' : 'unexpectedly present'}: ${path}`)
        continue
      }
      if (present) {
        const size = statSync(path).size
        if (typeof fa.minBytes === 'number' && size < fa.minBytes) details.push(`file too small: ${path} (${size} < ${fa.minBytes})`)
        if (typeof fa.maxBytes === 'number' && size > fa.maxBytes) details.push(`file too big: ${path} (${size} > ${fa.maxBytes})`)
      }
    }
  }

  return {
    name: fixture.name, tool: fixture.tool,
    ok: details.length === 0, details, ms: Date.now() - t0,
    request: args,
    response: { isError: response.isError ?? false, structuredContent: response.structuredContent, content: response.content },
  }
}

export function loadFixtures(fixturesDir: string, filter?: string): Fixture[] {
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.json')).sort()
  const filtered = filter ? files.filter((f) => new RegExp(filter.replace(/\*/g, '.*')).test(f)) : files
  return filtered.map((f) => JSON.parse(readFileSync(resolve(fixturesDir, f), 'utf-8')) as Fixture)
}

export function safeTestId(tool: string, index: number): string {
  return `${String(index).padStart(2, '0')}-${tool}`
}

export function indent(s: string, n: number): string {
  const pad = ' '.repeat(n)
  return s.split('\n').map((l) => pad + l).join('\n')
}
