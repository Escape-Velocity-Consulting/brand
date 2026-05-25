// Assemble the Brand Kit: dist/brand-kit/ folder + dist/brand-kit.zip.
//
// Prereqs (the meta build:dist script chains them in the right order):
//   - npm run build:tokens     → tokens.css + tokens.json
//   - npm run build:assets     → assets/raster/* + previews/*
//   - npm run build:site       → dist/site/ (needed for brand-guide.pdf)
//
// This script:
//   1. Asserts prereqs and warns if anything looks stale
//   2. Stages files into dist/brand-kit/
//   3. Generates palette.pdf, palette.ase, brand-guide.pdf, boilerplate.pdf
//   4. Writes README.txt with version stamp (git SHA + date)
//   5. Zips dist/brand-kit/ → dist/brand-kit.zip

import { execSync } from 'node:child_process'
import {
  copyFileSync, cpSync, existsSync, mkdirSync, readdirSync,
  readFileSync, rmSync, writeFileSync, createWriteStream, statSync,
} from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import archiver from 'archiver'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')
const DIST_DIR = resolve(BRAND_DIR, 'dist')
const KIT_DIR = resolve(DIST_DIR, 'brand-kit')
const KIT_ZIP = resolve(DIST_DIR, 'brand-kit.zip')

// --- Prerequisite checks --------------------------------------------------

function assertExists(path: string, fix: string) {
  if (!existsSync(path)) {
    console.error(`Missing: ${path}\n  Fix: ${fix}`)
    process.exit(1)
  }
}

assertExists(resolve(BRAND_DIR, 'tokens.css'),  'npm run build:tokens')
assertExists(resolve(BRAND_DIR, 'tokens.json'), 'npm run build:tokens')
assertExists(resolve(BRAND_DIR, 'assets', 'raster'), 'npm run build:assets')
assertExists(resolve(BRAND_DIR, 'previews'), 'npm run build:assets')
assertExists(resolve(BRAND_DIR, 'dist', 'site'), 'npm run build:site')
assertExists(resolve(BRAND_DIR, 'press', 'boilerplate.md'), 'create brand/press/boilerplate.md')
assertExists(resolve(BRAND_DIR, 'press', 'LICENSE.txt'), 'create brand/press/LICENSE.txt')
assertExists(resolve(BRAND_DIR, 'fonts', 'LICENSES'), 'create brand/fonts/LICENSES/')

// --- Reset staging dir ----------------------------------------------------

rmSync(KIT_DIR, { recursive: true, force: true })
mkdirSync(KIT_DIR, { recursive: true })
console.log(`Staging: ${KIT_DIR}`)

// --- Helpers --------------------------------------------------------------

function mkdirIn(rel: string): string {
  const p = resolve(KIT_DIR, rel)
  mkdirSync(p, { recursive: true })
  return p
}

function copyFile(src: string, destDir: string, rename?: string) {
  const dest = resolve(destDir, rename ?? basename(src))
  copyFileSync(src, dest)
}

function copyDirFiltered(srcDir: string, destDir: string, predicate: (name: string) => boolean) {
  for (const name of readdirSync(srcDir)) {
    const src = resolve(srcDir, name)
    if (!statSync(src).isFile()) continue
    if (!predicate(name)) continue
    copyFileSync(src, resolve(destDir, name))
  }
}

function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: BRAND_DIR }).toString().trim()
  } catch {
    return 'unknown'
  }
}

function isoDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// --- 1. Logos -------------------------------------------------------------

const logosSvg = mkdirIn('logos/svg')
const logosPng = mkdirIn('logos/png')

copyDirFiltered(resolve(BRAND_DIR, 'assets', 'logos'), logosSvg, (n) => n.endsWith('.svg'))

// Multi-size PNGs were already emitted by build:assets into assets/raster/.
copyDirFiltered(
  resolve(BRAND_DIR, 'assets', 'raster'),
  logosPng,
  (n) => /^(logo|ev-wordmark)[\w-]*-(?:300|512|1024|2048)\.png$/.test(n),
)
console.log('Staged: logos/')

// --- 2. Colors ------------------------------------------------------------

const colorsDir = mkdirIn('colors')
copyFile(resolve(BRAND_DIR, 'tokens.json'), colorsDir)

execSync(
  `npx tsx "${resolve(BRAND_DIR, 'scripts', 'generate-palette-pdf.ts')}" -o "${resolve(colorsDir, 'palette.pdf')}"`,
  { stdio: 'inherit', cwd: BRAND_DIR },
)
execSync(
  `npx tsx "${resolve(BRAND_DIR, 'scripts', 'generate-palette-ase.ts')}" -o "${resolve(colorsDir, 'palette.ase')}"`,
  { stdio: 'inherit', cwd: BRAND_DIR },
)
console.log('Staged: colors/')

// --- 3. Fonts -------------------------------------------------------------

const fontsDir = mkdirIn('fonts')
copyDirFiltered(resolve(BRAND_DIR, 'fonts'), fontsDir, (n) => n.endsWith('.woff2'))
cpSync(resolve(BRAND_DIR, 'fonts', 'LICENSES'), resolve(fontsDir, 'LICENSES'), { recursive: true })

writeFileSync(resolve(fontsDir, 'README.txt'), `Escape Velocity — Fonts
========================

Four font families are shipped in this directory as woff2 files:

  - Space Grotesk  → headlines
  - Manrope        → UI labels
  - Inter          → body text
  - JetBrains Mono → technical accents

All four are licensed under the SIL Open Font License v1.1 — see
LICENSES/OFL.txt and LICENSES/COPYRIGHTS.txt.

To install on a workstation, use the matching desktop format from
Google Fonts (the woff2 here is the web format):

  - https://fonts.google.com/specimen/Space+Grotesk
  - https://fonts.google.com/specimen/Manrope
  - https://fonts.google.com/specimen/Inter
  - https://fonts.google.com/specimen/JetBrains+Mono
`)
console.log('Staged: fonts/')

// --- 4. Guidelines (brand-guide.pdf) -------------------------------------

const guidelinesDir = mkdirIn('guidelines')
execSync(
  `npx tsx "${resolve(BRAND_DIR, 'scripts', 'generate-brand-guide-pdf.ts')}" -o "${resolve(guidelinesDir, 'brand-guide.pdf')}"`,
  { stdio: 'inherit', cwd: BRAND_DIR },
)
console.log('Staged: guidelines/')

// --- 5. Social samples ---------------------------------------------------

const socialDir = mkdirIn('social')
const SOCIAL_FILES = [
  'linkedin-banner.png',
  'twitter-banner-sample.png',
  'youtube-banner-sample.png',
  'og-sample.png',
  'announcement-sample.png',
  'quote-card-sample.png',
  'stats-card-sample.png',
]
for (const name of SOCIAL_FILES) {
  const src = resolve(BRAND_DIR, 'assets', 'raster', name)
  if (existsSync(src)) copyFile(src, socialDir)
  else console.warn(`Social asset missing, skipping: ${name}`)
}
console.log('Staged: social/')

// --- 6. Documents (sample PDFs from previews/) ---------------------------

const documentsDir = mkdirIn('documents')
copyDirFiltered(resolve(BRAND_DIR, 'previews'), documentsDir, (n) => n.endsWith('.pdf'))
console.log('Staged: documents/')

// --- 7. Press (boilerplate + photos) -------------------------------------

const pressDir = mkdirIn('press')
copyFile(resolve(BRAND_DIR, 'press', 'boilerplate.md'), pressDir)

const photosSrc = resolve(BRAND_DIR, 'press', 'photos')
if (existsSync(photosSrc)) {
  cpSync(photosSrc, resolve(pressDir, 'photos'), { recursive: true })
}

// Render boilerplate.pdf via existing pdf.ts generator (letter format)
execSync(
  `npx tsx "${resolve(BRAND_DIR, 'generators', 'pdf.ts')}" "${resolve(BRAND_DIR, 'press', 'boilerplate.md')}" ` +
  `--type letter --subject "Escape Velocity — Press & Boilerplate" --lang en ` +
  `-o "${resolve(pressDir, 'boilerplate.pdf')}"`,
  { stdio: 'inherit', cwd: BRAND_DIR },
)
console.log('Staged: press/')

// --- 8. README + LICENSE at kit root -------------------------------------

const sha = gitSha()
const date = isoDate()

copyFile(resolve(BRAND_DIR, 'press', 'LICENSE.txt'), KIT_DIR)

writeFileSync(resolve(KIT_DIR, 'README.txt'), `Escape Velocity — Brand Kit
=============================

Generated: ${date}
Version:   brand@${sha}

This kit contains everything a designer, partner, or journalist needs
to represent Escape Velocity Consulting correctly.

Contents
--------

  logos/svg/          Vector logo masters — preferred for any new use.
  logos/png/          Raster logos at 300 / 512 / 1024 / 2048 px.
  colors/             Color palette: PDF swatch sheet, Adobe .ase swatches,
                      and tokens.json (raw values).
  fonts/              The four brand fonts (woff2) + SIL OFL licenses.
                      See fonts/README.txt for desktop install pointers.
  guidelines/         Brand guide as a single PDF — printed from the
                      Brand Site at /brand/.
  social/             Sample social graphics (LinkedIn banner, OG cards,
                      quote/stats samples, X/YouTube banners).
  documents/          Sample document templates (letter, offer, invoice,
                      ToS, report) as PDF.
  press/              Boilerplate copy (DE + EN), founder photos, and
                      boilerplate.pdf.

LICENSE.txt          Usage terms for the assets in this kit.

The latest version of this kit is always at:
  https://escapevelocity.consulting/brand/brand-kit.zip

Contact for questions or permission requests:
  Tommi Enenkel
  tommi.enenkel@escapevelocity.consulting
  +43 660 6522083
`)
console.log('Staged: README.txt + LICENSE.txt')

// --- 9. Zip ---------------------------------------------------------------

await new Promise<void>((res, rej) => {
  const output = createWriteStream(KIT_ZIP)
  const archive = archiver('zip', { zlib: { level: 9 } })
  output.on('close', () => res())
  output.on('error', rej)
  archive.on('error', rej)
  archive.pipe(output)
  // Place files under a single top-level folder inside the zip
  archive.directory(KIT_DIR, 'escape-velocity-brand-kit')
  archive.finalize()
})

console.log(`Wrote ${KIT_ZIP}`)
