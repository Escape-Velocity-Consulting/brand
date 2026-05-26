/**
 * Generate the auto-managed sections of `skill/escape-velocity-brand/SKILL.md`
 * from `templates.meta.ts`.
 *
 * Why: routing is a classification decision that works best when the model has
 * the full option set in context up front. We bake the catalog + routing map
 * straight into SKILL.md (which is loaded eagerly when the skill activates)
 * rather than into a sidecar file under `references/` (which is loaded only
 * on demand — too late for routing).
 *
 * The script edits SKILL.md in place. Marker comments delimit the managed
 * regions. Re-run `npm run build:skill-catalog` (or `npm run build:skill`)
 * whenever `templates.meta.ts` changes.
 *
 * Idempotent: running twice produces no diff on the second run.
 * Fails loudly if either marker pair is missing.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TEMPLATE_REGISTRY, type TemplateMeta } from '../templates.meta.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const brandDir = resolve(__dirname, '..')
const skillMdPath = resolve(brandDir, 'skill/escape-velocity-brand/SKILL.md')

const CATALOG_START = '<!-- AUTO-GENERATED:CATALOG — edit templates.meta.ts and run `npm run build:skill` -->'
const CATALOG_END = '<!-- /AUTO-GENERATED:CATALOG -->'
const ROUTING_START = '<!-- AUTO-GENERATED:ROUTING — edit templates.meta.ts and run `npm run build:skill` -->'
const ROUTING_END = '<!-- /AUTO-GENERATED:ROUTING -->'

interface Entry { key: string; meta: TemplateMeta }

function partition(): { documents: Entry[]; social: Entry[]; carousel: Entry[] } {
  const documents: Entry[] = []
  const social: Entry[] = []
  const carousel: Entry[] = []
  for (const [key, meta] of Object.entries(TEMPLATE_REGISTRY)) {
    const tags = meta.tags ?? []
    if (tags.includes('document')) documents.push({ key, meta })
    else if (tags.includes('carousel-slide')) carousel.push({ key, meta })
    else if (tags.includes('social') || key.startsWith('social/')) social.push({ key, meta })
  }
  return { documents, social, carousel }
}

function fmtList(arr: string[] | undefined, fallback = '—'): string {
  if (!arr || arr.length === 0) return fallback
  return arr.map((v) => `\`${v}\``).join(', ')
}

function fmtDims(meta: TemplateMeta): string {
  if (meta.dims) return `${meta.dims.width}×${meta.dims.height}`
  if (meta.format) return meta.format
  return '—'
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

function renderCatalog(): string {
  const { documents, social, carousel } = partition()

  const docRows = documents
    .map((e) => `| \`${e.key}\` | ${e.meta.description} | ${fmtList(e.meta.requires, '_(none)_')} |`)
    .join('\n')

  const socialRows = social
    .map((e) => `| \`${e.key}\` | ${fmtDims(e.meta)} | ${e.meta.description} | ${fmtList(e.meta.optional)} |`)
    .join('\n')

  const carouselRows = carousel
    .map((e) => `| \`${e.key}\` | ${fmtDims(e.meta)} | ${e.meta.description} | ${fmtList(e.meta.optional)} |`)
    .join('\n')

  return [
    '## Template catalog',
    '',
    '_Snapshot generated from `templates.meta.ts`. Call `list_templates` if you suspect drift since the skill was built._',
    '',
    '### Documents (PDF, A4)',
    '',
    'Call as `render_template({ template: KEY, markdown: BODY, ...vars })`. Each accepts a markdown body and the listed required vars.',
    '',
    '| Key | Use for | Required vars |',
    '|-----|---------|---------------|',
    docRows,
    '',
    '### Social (PNG)',
    '',
    'Call as `render_template({ template: KEY, vars: { ... } })`.',
    '',
    '| Key | Dimensions | Use for | Optional vars |',
    '|-----|------------|---------|---------------|',
    socialRows,
    '',
    '### Carousel slides (PNG)',
    '',
    'Used **inside** `render_slides({ pages: [{ template: KEY, vars }, ...] })`, not directly via `render_template`.',
    '',
    '| Key | Dimensions | Role | Optional vars |',
    '|-----|------------|------|---------------|',
    carouselRows,
  ].join('\n')
}

// ─── Routing map ─────────────────────────────────────────────────────────────

function renderCallExpr(key: string, meta: TemplateMeta): string {
  // Generate a canonical-looking render_template call for this template.
  const isDoc = (meta.tags ?? []).includes('document')
  const parts: string[] = [`template: '${key}'`]
  if (isDoc) {
    parts.push("markdown: '...'")
    if (meta.requires && meta.requires.length > 0) {
      parts.push(meta.requires.map((r) => `${r}: ...`).join(', '))
    }
  } else {
    parts.push('vars: { ... }')
  }
  return `\`render_template({ ${parts.join(', ')} })\``
}

function renderRouting(): string {
  // One row per template with non-empty prompts.
  const templateRows = Object.entries(TEMPLATE_REGISTRY)
    .filter(([, meta]) => (meta.prompts ?? []).length > 0)
    .map(([key, meta]) => {
      const phrasings = (meta.prompts ?? []).join(', ')
      return `| ${phrasings} | ${renderCallExpr(key, meta)} |`
    })
    .join('\n')

  // Hardcoded multi-template / fallback rows. These don't live in the registry
  // because they orchestrate multiple templates (render_slides) or have no
  // template at all (custom HTML fallback).
  const tailRows = [
    `| LinkedIn carousel, Carousel post, multi-slide post | \`render_slides({ pages: [{ template: 'carousel/title', vars }, { template: 'carousel/numbered-item', vars }, ...], dimensions: 'linkedin-portrait', outputs: { pdf: true, pngs: true } })\` |`,
    `| Slide deck, presentation, Präsentation, Foliendeck | \`render_slides({ markdown: '...', dimensions: 'slide-16-9', outputs: { viewer: true, pdf: true } })\` |`,
    `| Long custom multi-page PDF | \`render_html_to_pdf({ html: '...', format: 'A4' })\` |`,
    `| Custom one-off design with no template match | \`render_html_to_png({ html: '...', width, height })\` or \`render_html_to_pdf\` |`,
  ].join('\n')

  return [
    '## Routing',
    '',
    '> **Default to `render_template` (or `render_slides` for multi-page).**',
    '> Custom HTML via `render_html_to_png` / `render_html_to_pdf` is the **last resort** — only when nothing in the table below matches. If the user mentions any phrasing in the left column, use the mapped tool.',
    '',
    '| If user asks for ... | Use ... |',
    '|---------------------|---------|',
    templateRows,
    tailRows,
    '',
    'If nothing matches and the request feels like it _should_ have a template, call `list_templates` before falling back to custom HTML — the registry may have grown since this skill was built.',
  ].join('\n')
}

// ─── Marker replacement ──────────────────────────────────────────────────────

function replaceBlock(
  src: string,
  startMarker: string,
  endMarker: string,
  body: string,
  label: string,
): string {
  const startIdx = src.indexOf(startMarker)
  const endIdx = src.indexOf(endMarker)
  if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) {
    throw new Error(
      `[build-skill-catalog] missing or malformed marker block for ${label} in ${skillMdPath}\n` +
        `  expected start: ${startMarker}\n` +
        `  expected end:   ${endMarker}`,
    )
  }
  const before = src.slice(0, startIdx + startMarker.length)
  const after = src.slice(endIdx)
  return `${before}\n\n${body}\n\n${after}`
}

function main() {
  const src = readFileSync(skillMdPath, 'utf-8')
  let next = src
  next = replaceBlock(next, CATALOG_START, CATALOG_END, renderCatalog(), 'CATALOG')
  next = replaceBlock(next, ROUTING_START, ROUTING_END, renderRouting(), 'ROUTING')

  if (next === src) {
    console.log(`[build-skill-catalog] no change: ${skillMdPath}`)
    return
  }
  writeFileSync(skillMdPath, next, 'utf-8')
  console.log(`[build-skill-catalog] updated: ${skillMdPath}`)
}

main()
