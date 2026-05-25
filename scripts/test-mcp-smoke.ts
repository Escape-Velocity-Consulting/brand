import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

/**
 * Spawns the MCP server as a subprocess via stdio and exercises every tool.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')

function check(label: string, ok: boolean, detail?: string) {
  const sym = ok ? 'PASS' : 'FAIL'
  console.log(`[${sym}] ${label}${detail ? ' — ' + detail : ''}`)
  if (!ok) process.exitCode = 1
}

async function main() {
  const tmp = tmpdir()

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', resolve(BRAND_DIR, 'src/mcp/server.ts')],
    env: { ...process.env, BRAND_DIR },
  })
  const client = new Client({ name: 'brand-mcp-smoke', version: '0.0.1' })
  await client.connect(transport)
  console.log('Connected to brand-mcp server.')

  // 1. list tools
  const tools = await client.listTools()
  const names = tools.tools.map((t) => t.name).sort()
  console.log('Tools:', names.join(', '))
  const expected = ['get_tokens', 'list_templates', 'render_carousel', 'render_document', 'render_image', 'render_image_html', 'render_presentation']
  check('all tools registered', JSON.stringify(names) === JSON.stringify(expected), names.join(','))

  // 2. list_templates
  const lt = await client.callTool({ name: 'list_templates', arguments: {} })
  const ltData = (lt as any).structuredContent
  check('list_templates returns categories',
    ltData && Array.isArray(ltData.documents) && Array.isArray(ltData.social) && Array.isArray(ltData.carousel),
    `${ltData?.documents?.length} docs, ${ltData?.social?.length} social, ${ltData?.carousel?.length} carousel`)

  // 3. get_tokens
  const gt = await client.callTool({ name: 'get_tokens', arguments: {} })
  const gtData = (gt as any).structuredContent
  check('get_tokens returns tokens',
    !!gtData?.tokens && typeof gtData.tokens === 'object',
    Object.keys(gtData?.tokens ?? {}).join(','))

  // 4. render_image — og preset
  const ogPath = resolve(tmp, 'mcp-test-og.png')
  if (existsSync(ogPath)) unlinkSync(ogPath)
  const ri = await client.callTool({
    name: 'render_image',
    arguments: {
      template: 'templates/social/og.html',
      type: 'html',
      preset: 'og',
      outputPath: ogPath,
    },
  })
  const riData = (ri as any).structuredContent
  check('render_image (og preset) produces file',
    !!riData?.path && existsSync(riData.path) && riData.bytes > 0,
    `${riData?.bytes} bytes`)

  // 5. render_image_html — raw HTML
  const rawPath = resolve(tmp, 'mcp-test-raw.png')
  if (existsSync(rawPath)) unlinkSync(rawPath)
  const rih = await client.callTool({
    name: 'render_image_html',
    arguments: {
      html: '<!DOCTYPE html><html><body style="background:#E8865A;color:white;display:flex;align-items:center;justify-content:center;font-size:48px;margin:0;height:100vh"><div>{{ LABEL }}</div></body></html>',
      vars: { LABEL: 'MCP works' },
      width: 800,
      height: 400,
      outputPath: rawPath,
    },
  })
  const rihData = (rih as any).structuredContent
  check('render_image_html produces file',
    !!rihData?.path && existsSync(rihData.path) && rihData.bytes > 0,
    `${rihData?.bytes} bytes`)

  // 6. render_document — letter
  const letterPath = resolve(tmp, 'mcp-test-letter.pdf')
  if (existsSync(letterPath)) unlinkSync(letterPath)
  const rd = await client.callTool({
    name: 'render_document',
    arguments: {
      type: 'letter',
      markdown: '# Hello from MCP\n\nDies ist ein Testbrief, gerendert über den MCP-Server.\n\nMit freundlichen Grüßen,\nTommi',
      recipient: { name: 'Test Person', extra_lines: ['Beispielstraße 1', '1010 Wien'] },
      outputPath: letterPath,
    },
  })
  const rdData = (rd as any).structuredContent
  check('render_document (letter) produces file',
    !!rdData?.path && existsSync(rdData.path) && rdData.bytes > 0,
    `${rdData?.bytes} bytes`)

  // 7. render_carousel — minimal 2-slide spec
  const carouselPath = resolve(tmp, 'mcp-test-carousel.pdf')
  if (existsSync(carouselPath)) unlinkSync(carouselPath)
  const rc = await client.callTool({
    name: 'render_carousel',
    arguments: {
      spec: {
        format: 'linkedin-portrait',
        slides: [
          { template: 'templates/carousel/title.html', vars: { EYEBROW: 'MCP', BIGNUMBER: '1' } },
          { template: 'templates/carousel/cta.html', vars: { CTA: 'Done' } },
        ],
      },
      outputPath: carouselPath,
    },
  })
  const rcData = (rc as any).structuredContent
  check('render_carousel produces PDF + slides',
    !!rcData?.pdfPath && existsSync(rcData.pdfPath) && rcData.slideCount === 2,
    `${rcData?.slideCount} slides`)

  // 8. render_presentation — markdown inline, no PDF/PNG (fast)
  const presDir = resolve(tmp, 'mcp-test-pres')
  const rp = await client.callTool({
    name: 'render_presentation',
    arguments: {
      markdown: '<!-- @type: title -->\n# Smoke Test\n> Eyebrow text\n\n===\n\n<!-- @type: content -->\n## Hello\n\nMCP rendered this.',
      outputDir: presDir,
      stem: 'smoke',
    },
  })
  const rpData = (rp as any).structuredContent
  check('render_presentation produces index.html',
    !!rpData?.htmlPath && existsSync(rpData.htmlPath) && rpData.slideCount === 2,
    `${rpData?.slideCount} slides`)

  await client.close()
  console.log('Done.')
}

main().catch((err) => {
  console.error('Smoke test failed:', err)
  process.exit(1)
})
