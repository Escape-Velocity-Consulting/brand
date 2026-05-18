import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')
const LOGOS_DIR = resolve(BRAND_DIR, 'assets', 'logos')
const WEBSITE_LOGOS = resolve(BRAND_DIR, '..', 'website', 'brand', 'assets', 'logos')

mkdirSync(WEBSITE_LOGOS, { recursive: true })

const LONG_EDGE = 1200

function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

const DARK = '#1E1C1A'
const LIGHT = '#F9F7F4'

const variants = [
  { svg: 'logo-dark.svg',               vb: [400, 200], bg: DARK },
  { svg: 'logo-light.svg',              vb: [400, 200], bg: LIGHT },
  { svg: 'logo-transparent.svg',        vb: [400, 200], bg: null },
  { svg: 'logo-dark-square.svg',        vb: [300, 300], bg: DARK },
  { svg: 'logo-light-square.svg',       vb: [300, 300], bg: LIGHT },
  { svg: 'logo-dark-wide.svg',          vb: [600, 140], bg: DARK },
  { svg: 'logo-light-wide.svg',         vb: [600, 140], bg: LIGHT },
  { svg: 'logo-transparent-wide.svg',   vb: [600, 140], bg: null },
  { svg: 'ev-wordmark.svg',             vb: [300, 300], bg: DARK },
  { svg: 'ev-wordmark-light.svg',       vb: [300, 300], bg: LIGHT },
  { svg: 'ev-wordmark-transparent.svg', vb: [300, 300], bg: null },
] as const

for (const { svg, vb, bg } of variants) {
  const [w, h] = vb
  const scale = LONG_EDGE / Math.max(w, h)
  const outW = Math.round(w * scale)
  const outH = Math.round(h * scale)
  const input = resolve(LOGOS_DIR, svg)
  const output = resolve(WEBSITE_LOGOS, svg.replace(/\.svg$/, '.png'))
  await sharp(input, { density: 300 }).resize(outW, outH).png().toFile(output)
  console.log(`Exported: ${svg} -> ${outW}x${outH}`)

  // Tight variant: render at 2x, compute bbox of non-bg pixels manually, then extract
  const tightOutput = resolve(WEBSITE_LOGOS, svg.replace(/\.svg$/, '-tight.png'))
  const rawPipe = sharp(input, { density: 600 }).resize(outW * 2, outH * 2)
  const { data, info } = await (bg ? rawPipe.flatten({ background: bg }) : rawPipe)
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info
  const bgRgb = bg ? hexToRgb(bg) : null
  const tol = 12 // tolerance for antialiased bg pixels
  const isBg = (i: number) => {
    if (bgRgb) {
      return Math.abs(data[i] - bgRgb.r) <= tol &&
             Math.abs(data[i + 1] - bgRgb.g) <= tol &&
             Math.abs(data[i + 2] - bgRgb.b) <= tol
    }
    // transparent: alpha channel
    return channels === 4 ? data[i + 3] < 8 : false
  }

  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      if (!isBg(i)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) {
    console.warn(`  No content found in ${svg}, skipping tight`)
    continue
  }
  const tW = maxX - minX + 1
  const tH = maxY - minY + 1
  await sharp(data, { raw: { width, height, channels } })
    .extract({ left: minX, top: minY, width: tW, height: tH })
    .png()
    .toFile(tightOutput)
  console.log(`Exported: ${svg} -> ${tW}x${tH} (tight)`)
}
