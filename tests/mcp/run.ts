import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { writeReport, type CapturedResult } from './report.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..', '..')
const FIXTURES_DIR = resolve(__dirname, 'fixtures')

interface FileAssertion {
  path: string
  exists?: boolean
  minBytes?: number
  maxBytes?: number
}

interface Fixture {
  name: string
  tool: string
  args: Record<string, unknown>
  expect: {
    isError?: boolean
    structured?: Record<string, unknown>
    files?: FileAssertion[]
  }
}

// --- placeholders ---

function applyTmpPlaceholders(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\{\{TMP\}\}/g, tmpdir())
  if (Array.isArray(value)) return value.map(applyTmpPlaceholders)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = applyTmpPlaceholders(v)
    return out
  }
  return value
}

function resolveStructuredRef(template: string, structured: Record<string, unknown>): string {
  return template.replace(/\{\{structured\.([^}]+)\}\}/g, (_, key) => {
    const v = structured[key]
    return v === undefined ? '' : String(v)
  })
}

// --- matchers ---

interface MatcherResult { ok: boolean; reason?: string }

function matchValue(actual: unknown, expected: unknown, path: string): MatcherResult {
  // Object-form matchers
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    const m = expected as Record<string, unknown>
    if ('min' in m || 'max' in m) {
      if (typeof actual !== 'number') return { ok: false, reason: `${path}: expected number, got ${typeof actual}` }
      if (typeof m.min === 'number' && actual < m.min) return { ok: false, reason: `${path}: ${actual} < min ${m.min}` }
      if (typeof m.max === 'number' && actual > m.max) return { ok: false, reason: `${path}: ${actual} > max ${m.max}` }
      return { ok: true }
    }
    if (m.isString === true) {
      return typeof actual === 'string'
        ? { ok: true }
        : { ok: false, reason: `${path}: expected string, got ${typeof actual}` }
    }
    if (m.isArray === true) {
      if (!Array.isArray(actual)) return { ok: false, reason: `${path}: expected array, got ${typeof actual}` }
      const minLen = typeof m.minLength === 'number' ? m.minLength : 0
      if (actual.length < minLen) return { ok: false, reason: `${path}: array length ${actual.length} < ${minLen}` }
      return { ok: true }
    }
    if (typeof m.matches === 'string') {
      if (typeof actual !== 'string') return { ok: false, reason: `${path}: expected string, got ${typeof actual}` }
      return new RegExp(m.matches).test(actual)
        ? { ok: true }
        : { ok: false, reason: `${path}: "${actual}" doesn't match /${m.matches}/` }
    }
    // Nested object — recurse
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
  // Literal
  return actual === expected
    ? { ok: true }
    : { ok: false, reason: `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` }
}

// --- runner ---

interface TestResult { name: string; tool: string; ok: boolean; details: string[]; ms: number; request?: unknown; response?: unknown }

async function runFixture(client: Client, fixture: Fixture): Promise<TestResult> {
  const details: string[] = []
  const t0 = Date.now()
  const args = applyTmpPlaceholders(fixture.args) as Record<string, unknown>

  let response: any
  try {
    response = await client.callTool({ name: fixture.tool, arguments: args })
  } catch (err) {
    return {
      name: fixture.name, tool: fixture.tool, ok: false,
      details: [`call threw: ${err instanceof Error ? err.message : String(err)}`],
      ms: Date.now() - t0,
      request: args,
    }
  }

  const isError = !!response.isError
  const expectError = fixture.expect.isError === true
  if (isError !== expectError) {
    const firstText = response.content?.find((c: any) => c.type === 'text')?.text ?? ''
    details.push(`isError mismatch: expected ${expectError}, got ${isError}. content: ${firstText.slice(0, 200)}`)
  }

  const structured: Record<string, unknown> = response.structuredContent ?? {}
  if (fixture.expect.structured) {
    for (const [k, v] of Object.entries(fixture.expect.structured)) {
      const r = matchValue(structured[k], v, k)
      if (!r.ok) details.push(`structured.${r.reason}`)
    }
  }

  if (fixture.expect.files) {
    for (const fa of fixture.expect.files) {
      const path = resolveStructuredRef(applyTmpPlaceholders(fa.path) as string, structured)
      const present = existsSync(path)
      const shouldExist = fa.exists !== false
      if (present !== shouldExist) {
        details.push(`file ${shouldExist ? 'missing' : 'unexpectedly present'}: ${path}`)
        continue
      }
      if (present) {
        const size = statSync(path).size
        if (typeof fa.minBytes === 'number' && size < fa.minBytes) {
          details.push(`file too small: ${path} (${size} < ${fa.minBytes})`)
        }
        if (typeof fa.maxBytes === 'number' && size > fa.maxBytes) {
          details.push(`file too big: ${path} (${size} > ${fa.maxBytes})`)
        }
      }
    }
  }

  return {
    name: fixture.name, tool: fixture.tool,
    ok: details.length === 0,
    details, ms: Date.now() - t0,
    request: args,
    response: {
      isError: response.isError ?? false,
      structuredContent: response.structuredContent,
      content: response.content,
    },
  }
}

function indent(s: string, n: number): string {
  const pad = ' '.repeat(n)
  return s.split('\n').map((l) => pad + l).join('\n')
}

function loadFixtures(filter?: string): Fixture[] {
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json')).sort()
  const filtered = filter
    ? files.filter((f) => new RegExp(filter.replace(/\*/g, '.*')).test(f))
    : files
  return filtered.map((f) => {
    const content = JSON.parse(readFileSync(resolve(FIXTURES_DIR, f), 'utf-8'))
    return { ...content, __file: f } as Fixture & { __file: string }
  })
}

async function main() {
  const args = process.argv.slice(2)
  const verbose = args.includes('--verbose') || args.includes('-v')
  const filter = args.find((a) => !a.startsWith('-'))
  const fixtures = loadFixtures(filter)
  if (fixtures.length === 0) {
    console.error('No fixtures found.')
    process.exit(1)
  }

  console.log(`Spawning brand-engine MCP server (brandDir=${BRAND_DIR})…`)
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', resolve(BRAND_DIR, 'src/mcp/server.ts')],
    env: { ...process.env, BRAND_DIR },
  })
  const client = new Client({ name: 'brand-mcp-e2e', version: '0.1.0' })
  await client.connect(transport)
  console.log('Connected. Running fixtures:\n')

  const results: TestResult[] = []
  for (const fixture of fixtures) {
    process.stdout.write(`  ${fixture.tool}/${fixture.name} … `)
    const r = await runFixture(client, fixture)
    results.push(r)
    if (r.ok) {
      console.log(`PASS (${r.ms}ms)`)
    } else {
      console.log(`FAIL (${r.ms}ms)`)
      for (const d of r.details) console.log(`      ${d}`)
    }
    if (verbose) {
      console.log('      --- request ---')
      console.log(indent(JSON.stringify(r.request, null, 2), 6))
      console.log('      --- response ---')
      console.log(indent(JSON.stringify(r.response, null, 2), 6))
      console.log('')
    }
  }

  await client.close()

  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log(`\n${passed}/${results.length} passed${failed ? `, ${failed} failed` : ''} (total ${results.reduce((a, r) => a + r.ms, 0)}ms)`)

  // Always write HTML report (with copied artifacts) unless --no-report passed
  if (!args.includes('--no-report')) {
    const reportDir = resolve(__dirname, 'report')
    const captured: CapturedResult[] = results.map((r) => ({
      name: r.name, tool: r.tool, ok: r.ok, details: r.details, ms: r.ms,
      request: r.request,
      response: (r.response ?? { isError: false }) as CapturedResult['response'],
    }))
    console.log('Writing HTML report…')
    try {
      const indexPath = writeReport(captured, reportDir, BRAND_DIR)
      console.log(`Report: ${indexPath}`)
    } catch (err) {
      console.error('writeReport threw:', err)
    }
  }

  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('Runner crashed:', err)
  process.exit(1)
})
