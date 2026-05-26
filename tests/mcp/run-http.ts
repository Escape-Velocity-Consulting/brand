/**
 * HTTP E2E runner. Spawns server-http.ts on a free port with test secrets,
 * connects via StreamableHTTPClientTransport, runs all fixtures, downloads
 * each artifact URL into the report's artifacts/ dir.
 *
 * Same fixtures as run.ts (stdio). The shared lib materialises URL artifacts
 * into local paths before file assertions, so fixtures work unchanged across
 * transports.
 *
 * Env overrides:
 *   MCP_HTTP_URL                  — point at an already-running server (e.g. prod). Skips local spawn.
 *   MCP_HTTP_BEARER_TOKEN         — bearer for that server. Required with MCP_HTTP_URL.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { loadFixtures, runFixture, safeTestId, indent, type TestResult } from './lib.js'
import { writeReport, type CapturedResult } from './report.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..', '..')
const FIXTURES_DIR = resolve(__dirname, 'fixtures')
const FIXTURES_HTTP_DIR = resolve(__dirname, 'fixtures-http')
const REPORT_DIR = resolve(__dirname, 'report-http')

async function findFreePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', rej)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        srv.close(() => res(port))
      } else {
        srv.close(() => rej(new Error('Could not allocate a port')))
      }
    })
  })
}

interface SpawnedServer {
  url: string
  bearer: string
  proc: ChildProcess
  storeDir: string
}

async function spawnLocalServer(): Promise<SpawnedServer> {
  const port = await findFreePort()
  const bearer = randomBytes(24).toString('hex')
  const signingSecret = randomBytes(32).toString('hex')
  const storeDir = resolve(tmpdir(), `brand-mcp-e2e-${randomBytes(6).toString('hex')}`)
  const baseUrl = `http://127.0.0.1:${port}`

  // Run the COMPILED JS if dist/ exists (simulates production), else use tsx.
  // Toggle explicitly via MCP_E2E_USE_DIST=1 to force compiled mode.
  const distEntry = resolve(BRAND_DIR, 'dist/src/mcp/server-http.js')
  const useDist = process.env.MCP_E2E_USE_DIST === '1'
  const cmd = useDist ? 'node' : 'npx'
  const args = useDist ? [distEntry] : ['tsx', resolve(BRAND_DIR, 'src/mcp/server-http.ts')]

  console.log(`Spawning local HTTP server on ${baseUrl} (${useDist ? 'compiled' : 'tsx'})…`)
  const proc = spawn(cmd, args, {
    env: {
      ...process.env,
      BRAND_DIR,
      MCP_BEARER_TOKEN: bearer,
      MCP_SIGNING_SECRET: signingSecret,
      MCP_PUBLIC_BASE_URL: baseUrl,
      MCP_PORT: String(port),
      MCP_BIND_HOST: '127.0.0.1',
      MCP_TMP_DIR: storeDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',  // npx is npx.cmd on Windows
  })
  proc.stdout?.on('data', (d) => process.stderr.write(`[server-http stdout] ${d}`))
  proc.stderr?.on('data', (d) => process.stderr.write(`[server-http] ${d}`))

  // Wait for /health to respond
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/health`)
      if (r.ok) {
        console.log('Server ready.')
        return { url: `${baseUrl}/mcp`, bearer, proc, storeDir }
      }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  proc.kill()
  throw new Error('Server did not respond on /health within 15s')
}

async function main() {
  const args = process.argv.slice(2)
  const verbose = args.includes('--verbose') || args.includes('-v')
  const filter = args.find((a) => !a.startsWith('-'))
  const sharedFixtures = loadFixtures(FIXTURES_DIR, filter)
  const httpFixtures = existsSync(FIXTURES_HTTP_DIR) ? loadFixtures(FIXTURES_HTTP_DIR, filter) : []
  const fixtures = [...sharedFixtures, ...httpFixtures]
  if (fixtures.length === 0) {
    console.error('No fixtures found.')
    process.exit(1)
  }

  const externalUrl = process.env.MCP_HTTP_URL
  const externalBearer = process.env.MCP_HTTP_BEARER_TOKEN

  let serverUrl: string
  let bearer: string
  let spawned: SpawnedServer | null = null

  if (externalUrl) {
    if (!externalBearer) {
      console.error('MCP_HTTP_URL is set but MCP_HTTP_BEARER_TOKEN is not. Refusing to call without auth.')
      process.exit(1)
    }
    serverUrl = externalUrl
    bearer = externalBearer
    console.log(`Using external HTTP MCP server: ${serverUrl}`)
  } else {
    spawned = await spawnLocalServer()
    serverUrl = spawned.url
    bearer = spawned.bearer
  }

  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
  })
  const client = new Client({ name: 'brand-mcp-e2e-http', version: '0.1.0' })
  await client.connect(transport)
  console.log('Connected. Running fixtures:\n')

  mkdirSync(REPORT_DIR, { recursive: true })
  // Download URLs into a tmp staging dir (not inside REPORT_DIR — writeReport
  // wipes its own artifacts/ subdir on each run, which would delete these).
  // writeReport will re-discover and copy them in from here.
  const downloadsRoot = resolve(tmpdir(), `brand-mcp-e2e-downloads-${randomBytes(4).toString('hex')}`)
  mkdirSync(downloadsRoot, { recursive: true })

  const results: TestResult[] = []
  for (let i = 0; i < fixtures.length; i++) {
    const fx = fixtures[i]
    const id = safeTestId(fx.tool, i + 1)
    process.stdout.write(`  ${fx.tool}/${fx.name} … `)
    const r = await runFixture(client, fx, id, {
      downloadDirFor: (testId) => resolve(downloadsRoot, testId),
    })
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

  await client.close().catch(() => {})

  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log(`\n${passed}/${results.length} passed${failed ? `, ${failed} failed` : ''} (total ${results.reduce((a, r) => a + r.ms, 0)}ms)`)

  if (!args.includes('--no-report')) {
    console.log('Writing HTML report…')
    try {
      const captured: CapturedResult[] = results.map((r) => ({
        name: r.name, tool: r.tool, ok: r.ok, details: r.details, ms: r.ms,
        request: r.request,
        response: (r.response ?? { isError: false }) as CapturedResult['response'],
      }))
      const indexPath = writeReport(captured, REPORT_DIR, BRAND_DIR)
      console.log(`Report: ${indexPath}`)
    } catch (err) {
      console.error('writeReport threw:', err)
    }
  }

  if (spawned) {
    spawned.proc.kill('SIGTERM')
  }

  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('Runner crashed:', err)
  process.exit(1)
})
