// Generate an Adobe Swatch Exchange (.ase) file from tokens.json.
// Format reference: https://www.selapa.net/swatches/colors/fileformats.php
//
// Layout: one ASE group per category, with one RGB color per token.
// Token-sourced: never hardcode hex.
//
// Usage: tsx scripts/generate-palette-ase.ts [-o output.ase]

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')
const TOKENS_JSON_PATH = resolve(BRAND_DIR, 'tokens.json')

const { values } = parseArgs({
  options: { output: { type: 'string', short: 'o' } },
})
const outputPath = resolve(values.output ?? resolve(BRAND_DIR, 'dist', 'palette.ase'))

if (!existsSync(TOKENS_JSON_PATH)) {
  console.error(`Missing ${TOKENS_JSON_PATH} — run \`npm run build:tokens\` first.`)
  process.exit(1)
}

const tokens = JSON.parse(readFileSync(TOKENS_JSON_PATH, 'utf8')) as {
  colors: Record<string, string>
  secondaryColors: Record<string, string>
}

// --- ASE block types ------------------------------------------------------

const BLOCK_GROUP_START = 0xc001
const BLOCK_GROUP_END = 0xc002
const BLOCK_COLOR = 0x0001
const COLOR_TYPE_NORMAL = 2

// UTF-16 BE encoded name with terminating null + u16 length-in-chars prefix.
function encodeName(name: string): Buffer {
  const chars = [...name]
  const len = chars.length + 1 // includes terminating null
  const buf = Buffer.alloc(2 + len * 2)
  buf.writeUInt16BE(len, 0)
  for (let i = 0; i < chars.length; i++) {
    buf.writeUInt16BE(chars[i].charCodeAt(0), 2 + i * 2)
  }
  // trailing null already zero-init
  return buf
}

function hexToFloats(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

function colorBlock(name: string, hex: string): Buffer {
  const nameBuf = encodeName(name)
  const [r, g, b] = hexToFloats(hex)
  const body = Buffer.alloc(nameBuf.length + 4 + 12 + 2) // name + "RGB " + 3xf32 + colorType
  let o = 0
  nameBuf.copy(body, o); o += nameBuf.length
  body.write('RGB ', o, 4, 'ascii'); o += 4
  body.writeFloatBE(r, o); o += 4
  body.writeFloatBE(g, o); o += 4
  body.writeFloatBE(b, o); o += 4
  body.writeUInt16BE(COLOR_TYPE_NORMAL, o)
  const block = Buffer.alloc(6 + body.length)
  block.writeUInt16BE(BLOCK_COLOR, 0)
  block.writeUInt32BE(body.length, 2)
  body.copy(block, 6)
  return block
}

function groupStartBlock(name: string): Buffer {
  const nameBuf = encodeName(name)
  const block = Buffer.alloc(6 + nameBuf.length)
  block.writeUInt16BE(BLOCK_GROUP_START, 0)
  block.writeUInt32BE(nameBuf.length, 2)
  nameBuf.copy(block, 6)
  return block
}

function groupEndBlock(): Buffer {
  const block = Buffer.alloc(6)
  block.writeUInt16BE(BLOCK_GROUP_END, 0)
  block.writeUInt32BE(0, 2)
  return block
}

// --- Color metadata (display names) --------------------------------------

const CATEGORIES: { label: string; entries: { key: string; name: string }[] }[] = [
  {
    label: 'Foundation',
    entries: [
      { key: 'cream',      name: 'Warm Cream' },
      { key: 'black',      name: 'Warm Black' },
      { key: 'terracotta', name: 'Terracotta' },
    ],
  },
  {
    label: 'Accents',
    entries: [
      { key: 'terracottaHover', name: 'Terracotta Hover' },
      { key: 'accent',          name: 'Accent' },
    ],
  },
  {
    label: 'Neutrals',
    entries: [
      { key: 'light',  name: 'Light' },
      { key: 'muted',  name: 'Muted' },
      { key: 'subtle', name: 'Subtle' },
      { key: 'body',   name: 'Body' },
      { key: 'text',   name: 'Text' },
    ],
  },
  {
    label: 'Document Neutrals',
    entries: [
      { key: 'docText',   name: 'Doc Text' },
      { key: 'docBorder', name: 'Doc Border' },
    ],
  },
]

const SECONDARY = {
  label: 'Secondary (Tags)',
  entries: [
    { key: 'blue',  name: 'Blue' },
    { key: 'green', name: 'Green' },
  ],
}

// --- Assemble blocks ------------------------------------------------------

const blocks: Buffer[] = []

function pushGroup(label: string, source: Record<string, string>, entries: { key: string; name: string }[]) {
  const colored = entries.filter((e) => source[e.key])
  if (colored.length === 0) return
  blocks.push(groupStartBlock(label))
  for (const { key, name } of colored) {
    blocks.push(colorBlock(`EV / ${name}`, source[key]))
  }
  blocks.push(groupEndBlock())
}

for (const cat of CATEGORIES) pushGroup(cat.label, tokens.colors, cat.entries)
pushGroup(SECONDARY.label, tokens.secondaryColors, SECONDARY.entries)

// --- Header + concat ------------------------------------------------------

const header = Buffer.alloc(12)
header.write('ASEF', 0, 4, 'ascii')
header.writeUInt16BE(1, 4) // major version
header.writeUInt16BE(0, 6) // minor version
header.writeUInt32BE(blocks.length, 8)

const out = Buffer.concat([header, ...blocks])
writeFileSync(outputPath, out)
console.log(`Wrote ${outputPath} (${blocks.length} blocks, ${out.length} bytes)`)
