// brand/scripts/generate-logos.ts
//
// Generates the full logo variant matrix (mark × frame × surface) from
// logos.config.ts. Wordmarks are assembled from pre-extracted vector glyph
// outlines (assets/logos/_glyphs.json, produced once by scripts/extract-glyphs.py
// from Space Grotesk 700). Every emitted SVG is self-contained and renders
// identically without the font installed — important for the brand kit, press,
// and partners. This step is pure Node (no font parsing, no Python) so it runs
// anywhere CI does.
//
//   npm run build:logos
//
// Emits:
//   assets/logos/<mark>-<surface>-<frame>.svg   — 54 canonical variants
//   assets/logos/<legacy>.svg                    — back-compat aliases
//   assets/logos.manifest.json                   — drives raster + Brand Site
//
// Coordinates are in a normalised 1000 units-per-em space, SVG y-down, baseline
// at y=0 (cap height ≈ 700).

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  marks, frames, surfaces, geometry, rasterSizes, legacyAliases, variantName,
  type MarkDef, type SurfaceDef, type FrameDef,
} from '../logos.config'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')
const LOGOS_DIR = resolve(BRAND_DIR, 'assets', 'logos')
const GLYPHS_PATH = resolve(LOGOS_DIR, '_glyphs.json')
const MANIFEST_PATH = resolve(BRAND_DIR, 'assets', 'logos.manifest.json')

interface Glyph { d: string; adv: number; bounds: [number, number, number, number] }
interface GlyphData { unitsPerEm: number; glyphs: Record<string, Glyph> }

const GLYPHS: GlyphData = JSON.parse(readFileSync(GLYPHS_PATH, 'utf8'))
const glyph = (ch: string): Glyph | undefined => GLYPHS.glyphs[ch]

// Cap height from a no-descender capital (E: bounds y -700..0).
const E = glyph('E')!
const capH = E.bounds[3] - E.bounds[1]

const r2 = (n: number) => Math.round(n * 100) / 100

interface Placement { ch: string; x: number; baseline: number; role: 'ink' | 'accent' }
interface Box { x1: number; y1: number; x2: number; y2: number }

// Lay out one line of text starting at startX; returns drawable glyph placements,
// the pen end-x, and the visual bounding box.
function layoutLine(text: string, baseline: number, role: 'ink' | 'accent', startX: number) {
  const items: Placement[] = []
  let x = startX
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity
  for (const ch of text) {
    const g = glyph(ch)
    if (!g) continue
    if (g.d) items.push({ ch, x, baseline, role })
    const [bx1, by1, bx2, by2] = g.bounds
    if (bx2 > bx1 || by2 > by1) {
      mnX = Math.min(mnX, x + bx1); mxX = Math.max(mxX, x + bx2)
      mnY = Math.min(mnY, baseline + by1); mxY = Math.max(mxY, baseline + by2)
    }
    x += g.adv
  }
  return { items, endX: x, minX: mnX, maxX: mxX, minY: mnY, maxY: mxY }
}

// Lay out a whole mark (shared across all surfaces of that mark).
function layoutMark(mark: MarkDef): { placements: Placement[]; box: Box } {
  const placements: Placement[] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const grow = (a: number, b: number, c: number, d: number) => {
    minX = Math.min(minX, a); minY = Math.min(minY, b)
    maxX = Math.max(maxX, c); maxY = Math.max(maxY, d)
  }

  if (mark.layout === 'stacked') {
    const lineGap = geometry.stackLineGap * capH
    mark.runs.forEach((run, i) => {
      const baseline = i * lineGap
      const line = layoutLine(run.text, baseline, run.role, 0)
      const center = (line.minX + line.maxX) / 2 // centre each line on x=0
      line.items.forEach((it) => { it.x -= center })
      placements.push(...line.items)
      grow(line.minX - center, line.minY, line.maxX - center, line.maxY)
    })
  } else {
    let x = 0
    const spaceAdv = glyph(' ')?.adv ?? 0
    mark.runs.forEach((run) => {
      const line = layoutLine(run.text, 0, run.role, x)
      placements.push(...line.items)
      grow(line.minX, line.minY, line.maxX, line.maxY)
      x = line.endX
      if (mark.key === 'inline') x += spaceAdv // word gap for the inline wordmark
    })
  }

  return { placements, box: { x1: minX, y1: minY, x2: maxX, y2: maxY } }
}

function frameViewBox(frame: FrameDef, box: Box) {
  const w = box.x2 - box.x1, h = box.y2 - box.y1
  if (frame.key === 'bare') return { x: box.x1, y: box.y1, w, h }
  if (frame.key === 'margin' || frame.key === 'padded') {
    const pad = (frame.key === 'padded' ? geometry.paddedPad : geometry.marginPad) * capH
    return { x: box.x1 - pad, y: box.y1 - pad, w: w + 2 * pad, h: h + 2 * pad }
  }
  const pad = geometry.squarePad * capH
  const side = Math.max(w, h) + 2 * pad
  const cx = (box.x1 + box.x2) / 2, cy = (box.y1 + box.y2) / 2
  return { x: cx - side / 2, y: cy - side / 2, w: side, h: side }
}

function buildSvg(mark: MarkDef, surface: SurfaceDef, frame: FrameDef, placements: Placement[], box: Box) {
  const vb = frameViewBox(frame, box)
  const W = Math.round(vb.w), H = Math.round(vb.h)
  const ink = (role: 'ink' | 'accent') => (role === 'ink' ? surface.ink : surface.accent)

  let bgRect = ''
  if (surface.bg) {
    const rx = r2(Math.min(vb.w, vb.h) * geometry.cornerRadius)
    bgRect = `\n  <rect x="${r2(vb.x)}" y="${r2(vb.y)}" width="${r2(vb.w)}" height="${r2(vb.h)}" rx="${rx}" fill="${surface.bg}"/>`
  }

  const paths = placements
    .map((p) => `    <path d="${glyph(p.ch)!.d}" transform="translate(${r2(p.x)} ${r2(p.baseline)})" fill="${ink(p.role)}"/>`)
    .join('\n')

  const svg =
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(vb.x)} ${r2(vb.y)} ${r2(vb.w)} ${r2(vb.h)}" width="${W}" height="${H}" role="img" aria-label="Escape Velocity — ${mark.label}, ${surface.label}">${bgRect}
  <g>
${paths}
  </g>
</svg>
`
  return { svg, w: W, h: H }
}

// ── Generate ────────────────────────────────────────────────────────────────
interface ManifestEntry {
  name: string
  mark: string; markLabel: string
  surface: string; surfaceLabel: string
  frame: string; frameLabel: string
  svg: string
  pngs: string[]
  w: number; h: number
  bg: string | null
  transparent: boolean
  checker: 'light' | 'dark' | null
  caption: string
}

mkdirSync(LOGOS_DIR, { recursive: true })

const manifest: ManifestEntry[] = []
const layouts = new Map(marks.map((m) => [m.key, layoutMark(m)]))

for (const mark of marks) {
  const { placements, box } = layouts.get(mark.key)!
  for (const surface of surfaces) {
    for (const frame of frames) {
      const name = variantName(mark.key, surface.key, frame.key)
      const { svg, w, h } = buildSvg(mark, surface, frame, placements, box)
      writeFileSync(resolve(LOGOS_DIR, `${name}.svg`), svg)
      manifest.push({
        name,
        mark: mark.key, markLabel: mark.label,
        surface: surface.key, surfaceLabel: surface.label,
        frame: frame.key, frameLabel: frame.label,
        svg: `${name}.svg`,
        pngs: rasterSizes.map((s) => `${name}-${s}.png`),
        w, h,
        bg: surface.bg,
        transparent: !!surface.transparent,
        // Backdrop for transparent previews: dark behind light ink, light behind dark ink.
        checker: surface.transparent ? (surface.key.includes('light') ? 'dark' : 'light') : null,
        caption: `${mark.label} · ${surface.label} · ${frame.label}`,
      })
    }
  }
}

for (const a of legacyAliases) {
  const src = resolve(LOGOS_DIR, `${variantName(a.mark, a.surface, a.frame)}.svg`)
  copyFileSync(src, resolve(LOGOS_DIR, a.file))
}

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')

console.log(`Generated ${manifest.length} logo variants + ${legacyAliases.length} legacy aliases.`)
console.log(`Manifest: assets/logos.manifest.json (capHeight=${r2(capH)})`)
