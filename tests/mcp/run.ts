import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { loadFixtures, runFixture, safeTestId, indent, type TestResult } from './lib.js'
import { writeReport, type CapturedResult } from './report.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..', '..')
const FIXTURES_DIR = resolve(__dirname, 'fixtures')

async function main() {
  const args = process.argv.slice(2)
  const verbose = args.includes('--verbose') || args.includes('-v')
  const filter = args.find((a) => !a.startsWith('-'))
  const fixtures = loadFixtures(FIXTURES_DIR, filter)
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
  for (let i = 0; i < fixtures.length; i++) {
    const fx = fixtures[i]
    const id = safeTestId(fx.tool, i + 1)
    process.stdout.write(`  ${fx.tool}/${fx.name} … `)
    const r = await runFixture(client, fx, id)
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

  if (!args.includes('--no-report')) {
    console.log('Writing HTML report…')
    try {
      const reportDir = resolve(__dirname, 'report')
      const captured: CapturedResult[] = results.map((r) => ({
        name: r.name, tool: r.tool, ok: r.ok, details: r.details, ms: r.ms,
        request: r.request,
        response: (r.response ?? { isError: false }) as CapturedResult['response'],
      }))
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
