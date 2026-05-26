/**
 * Throwaway smoke test: generate the QR-with-URL PNG that publish_artifact
 * would bake onto a deck title slide. Inspect the output at
 * previews/decks/smoke-qr.png.
 */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateQrPng, printableUrl } from '../src/mcp/shared/qrInject.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const url = 'https://mcp.escapevelocity.consulting/published/TestAbc123'
  console.log('label:', printableUrl(url))
  const buf = await generateQrPng(url)
  const out = resolve(__dirname, '..', 'previews', 'decks', 'smoke-qr.png')
  writeFileSync(out, buf)
  console.log('Wrote ' + out + ' (' + buf.length + ' bytes)')
}

main().catch((e) => { console.error(e); process.exit(1) })
