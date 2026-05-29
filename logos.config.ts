// brand/logos.config.ts — Declarative source of truth for the logo variant matrix.
//
// Every logo the system produces is one cell of  mark × frame × surface.
// This file only DECLARES the matrix and colour mapping (sourced from tokens.ts).
// Geometry + file emission lives in scripts/generate-logos.ts, which reads this
// config, outlines the wordmark with opentype.js, and writes:
//   - assets/logos/<mark>-<surface>-<frame>.svg   (54 outlined, self-contained SVGs)
//   - assets/logos/<legacy>.svg                    (back-compat aliases)
//   - assets/logos.manifest.json                   (drives raster + Brand Site page)
//
// Naming:  {mark}-{surface}-{frame}.svg
//   e.g.   inline-dark-margin.svg, monogram-transparent-light-bare.svg

import { colors } from './tokens'

// ── Marks: what is actually drawn ───────────────────────────────────────────
// Each mark is a list of coloured runs. `ink`/`accent` are resolved per surface.
export type RunRole = 'ink' | 'accent'
export interface MarkRun { text: string; role: RunRole }
export interface MarkDef {
  key: string
  label: string
  layout: 'inline' | 'stacked' | 'inline' // inline = one line, stacked = two lines
  runs: MarkRun[]
  description: string
}

export const marks: MarkDef[] = [
  {
    key: 'monogram',
    label: 'Monogram',
    layout: 'inline',
    runs: [{ text: 'E', role: 'ink' }, { text: 'V', role: 'accent' }],
    description: 'EV monogram — avatars, app icons, favicons, tight spaces.',
  },
  {
    key: 'stacked',
    label: 'Stacked',
    layout: 'stacked',
    runs: [{ text: 'Escape', role: 'ink' }, { text: 'Velocity', role: 'accent' }],
    description: 'Two-line lockup — roughly square footprint, balanced presence.',
  },
  {
    key: 'inline',
    label: 'Inline',
    layout: 'inline',
    runs: [{ text: 'Escape', role: 'ink' }, { text: 'Velocity', role: 'accent' }],
    description: 'Single-line wordmark — headers, signatures, wide placements.',
  },
]

// ── Frames: canvas shape + padding around the mark ──────────────────────────
export type FrameKey = 'square' | 'margin' | 'bare'
export interface FrameDef {
  key: FrameKey
  label: string
  description: string
}

export const frames: FrameDef[] = [
  { key: 'square', label: 'Square', description: '1:1 canvas, mark centred. For avatars & profile images.' },
  { key: 'margin', label: 'Margin', description: 'Natural ratio with clear-space padding. Standard usage lockup.' },
  { key: 'padded', label: 'Padded', description: 'Natural ratio with generous margin — roomier than Margin.' },
  { key: 'bare',   label: 'Bare',   description: 'Tight crop, zero padding. When you control the surrounding space.' },
]

// ── Surfaces: background + ink/accent resolution ────────────────────────────
// `bg: null` → transparent (no background rect). `solid` surfaces get a rounded
// rectangle in the background colour.
export interface SurfaceDef {
  key: string
  label: string
  bg: string | null
  ink: string       // colour for `ink` runs
  accent: string    // colour for `accent` runs
  transparent?: boolean
  description: string
}

export const surfaces: SurfaceDef[] = [
  {
    key: 'dark', label: 'Dark', bg: colors.black,
    ink: colors.light, accent: colors.accent,
    description: 'On warm black. Light ink, orange accent.',
  },
  {
    key: 'light', label: 'Light', bg: colors.cream,
    ink: colors.text, accent: colors.terracotta,
    description: 'On warm cream. Near-black ink, terracotta accent.',
  },
  {
    key: 'terracotta', label: 'Terracotta', bg: colors.terracotta,
    ink: colors.cream, accent: colors.cream,
    description: 'On terracotta. Whole wordmark in cream (single colour).',
  },
  {
    key: 'transparent-light', label: 'Transparent · Light', bg: null, transparent: true,
    ink: colors.light, accent: colors.accent,
    description: 'No background, light ink + orange accent. Over dark photos/areas.',
  },
  {
    key: 'transparent-dark', label: 'Transparent · Dark', bg: null, transparent: true,
    ink: colors.text, accent: colors.terracotta,
    description: 'No background, dark ink + terracotta accent. Over light photos/areas.',
  },
  {
    key: 'transparent-mono-light', label: 'Transparent · Mono light', bg: null, transparent: true,
    ink: colors.light, accent: colors.light,
    description: 'No background, everything light (single colour). Knockout for graphics.',
  },
  {
    key: 'transparent-mono-dark', label: 'Transparent · Mono dark', bg: null, transparent: true,
    ink: colors.text, accent: colors.text,
    description: 'No background, everything dark (single colour). Knockout for graphics.',
  },
]

// ── Geometry knobs (multipliers of cap height; glyphs are in 1000-em units) ──
export const geometry = {
  marginPad: 0.55,       // × capHeight — clear space for the `margin` frame
  paddedPad: 1.4,        // × capHeight — generous margin for the `padded` frame
  squarePad: 0.62,       // × capHeight — minimum breathing room inside `square`
  stackLineGap: 1.20,    // × capHeight — baseline-to-baseline distance, stacked mark
  cornerRadius: 0.06,    // × min(boxW, boxH) — rounded-rect radius on solid surfaces
}

// ── Raster sizes (px) ───────────────────────────────────────────────────────
// 4096 ≈ 416 DPI at 25 cm — comfortably above 300 DPI for large-format / apparel print.
export const rasterSizes = [300, 512, 1024, 2048, 4096] as const

// ── Legacy filename aliases (old name → matrix cell) ────────────────────────
// Keeps existing consumers (site/index.njk, build-kit regex, external links,
// brand kit, press) working after the switch to the systematic naming scheme.
export interface LegacyAlias { file: string; mark: string; surface: string; frame: FrameKey }
export const legacyAliases: LegacyAlias[] = [
  { file: 'ev-wordmark.svg',             mark: 'monogram', surface: 'dark',              frame: 'square' },
  { file: 'ev-wordmark-light.svg',       mark: 'monogram', surface: 'light',             frame: 'square' },
  { file: 'ev-wordmark-transparent.svg', mark: 'monogram', surface: 'transparent-dark',  frame: 'square' },
  { file: 'logo-dark.svg',               mark: 'stacked',  surface: 'dark',              frame: 'margin' },
  { file: 'logo-dark-square.svg',        mark: 'stacked',  surface: 'dark',              frame: 'square' },
  { file: 'logo-light.svg',              mark: 'stacked',  surface: 'light',             frame: 'margin' },
  { file: 'logo-light-square.svg',       mark: 'stacked',  surface: 'light',             frame: 'square' },
  { file: 'logo-transparent.svg',        mark: 'stacked',  surface: 'transparent-dark',  frame: 'margin' },
  { file: 'logo-dark-wide.svg',          mark: 'inline',   surface: 'dark',              frame: 'margin' },
  { file: 'logo-light-wide.svg',         mark: 'inline',   surface: 'light',             frame: 'margin' },
  { file: 'logo-transparent-wide.svg',   mark: 'inline',   surface: 'transparent-dark',  frame: 'margin' },
]

export const variantName = (mark: string, surface: string, frame: string) =>
  `${mark}-${surface}-${frame}`
