/**
 * Generates site/_data/tooling.json — consumed by site/tooling.njk.
 * Re-run automatically as part of build:site (see scripts/build-site.sh).
 *
 * The template catalog section is derived from templates.meta.ts so it
 * stays in sync automatically. MCP tool and route definitions are static
 * — update them here when adding new tools or endpoints.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TEMPLATE_REGISTRY, type TemplateMeta } from '../templates.meta.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRAND_DIR = resolve(__dirname, '..')
const OUT = resolve(BRAND_DIR, 'site/_data/tooling.json')

// ── MCP tool groups ───────────────────────────────────────────────────────────

const TOOL_GROUPS = [
  {
    id: 'render',
    label: 'Render',
    note: 'Both transports',
    tools: [
      {
        name: 'render_template',
        description: 'Named template + Nunjucks vars (+ optional markdown body) → PNG or PDF. Output format driven by the template registry.',
        transports: ['stdio', 'http'],
      },
      {
        name: 'render_html_to_png',
        description: 'Raw HTML string → PNG screenshot. Brand fonts and tokens auto-injected.',
        transports: ['stdio', 'http'],
      },
      {
        name: 'render_html_to_pdf',
        description: 'Raw HTML → PDF. Playwright auto-paginates. Supports A4/A3/Letter/Legal or custom pixel dimensions.',
        transports: ['stdio', 'http'],
      },
      {
        name: 'render_slides',
        description: 'N pages → toggleable { viewer (HTML), pdf, pngs }. Markdown mode (=== separators) or pages mode (explicit HTML/template per slide).',
        transports: ['stdio', 'http'],
      },
    ],
  },
  {
    id: 'publish',
    label: 'Publish',
    note: 'HTTP transport only',
    tools: [
      {
        name: 'publish_artifact',
        description: 'Promote a bundle from the ephemeral store (1 h TTL) to the persistent published store. Returns a stable public URL.',
        transports: ['http'],
      },
      {
        name: 'unpublish_artifact',
        description: 'Remove a published item by ID. Idempotent.',
        transports: ['http'],
      },
      {
        name: 'list_published',
        description: 'List published items, optionally filtered by type: deck, document, image, carousel, html-pdf, html-png.',
        transports: ['http'],
      },
    ],
  },
  {
    id: 'introspect',
    label: 'Introspect',
    note: 'Both transports',
    tools: [
      {
        name: 'list_templates',
        description: 'Full template registry (output format, dims, required vars, tags). Optional tag filter.',
        transports: ['stdio', 'http'],
      },
      {
        name: 'get_tokens',
        description: 'Parsed tokens.json — colors, typography, spacing.',
        transports: ['stdio', 'http'],
      },
    ],
  },
]

const TOTAL_TOOLS = TOOL_GROUPS.reduce((n, g) => n + g.tools.length, 0)

// ── REST routes ───────────────────────────────────────────────────────────────

const ROUTES = [
  { method: 'POST',   path: '/mcp',                                    auth: 'Bearer JWT', purpose: 'Streamable HTTP transport (stateful, per-session)' },
  { method: 'GET',    path: '/mcp',                                    auth: 'Bearer JWT', purpose: 'SSE stream for an existing session' },
  { method: 'DELETE', path: '/mcp',                                    auth: 'Bearer JWT', purpose: 'Terminate a session' },
  { method: 'GET',    path: '/artifacts/<token>',                      auth: 'Signed URL', purpose: 'Download ephemeral rendered artifact (1 h TTL)' },
  { method: 'GET',    path: '/published/<id>/<file>',                  auth: 'none',       purpose: 'Download a published file' },
  { method: 'GET',    path: '/api/published',                          auth: 'none',       purpose: 'JSON list of published items (optional ?type= filter). CORS *.' },
  { method: 'GET',    path: '/api/published/<id>',                     auth: 'none',       purpose: 'JSON metadata for one published item' },
  { method: 'GET',    path: '/health',                                 auth: 'none',       purpose: "Liveness probe — { status: 'ok' }" },
  { method: 'GET',    path: '/.well-known/oauth-protected-resource',   auth: 'none',       purpose: 'RFC 9728 — points clients at the authorization server' },
  { method: 'GET',    path: '/.well-known/oauth-authorization-server', auth: 'none',       purpose: 'RFC 8414 — authorization server metadata' },
  { method: 'GET',    path: '/authorize',                              auth: 'none',       purpose: 'OAuth 2.1 code-flow entrypoint → redirects to Google login' },
  { method: 'GET',    path: '/oauth/google/callback',                  auth: 'none',       purpose: 'Google OAuth callback — issues our own auth code' },
  { method: 'POST',   path: '/token',                                  auth: 'PKCE',       purpose: 'Exchange auth-code or refresh-token for JWT access token' },
  { method: 'POST',   path: '/register',                               auth: 'none',       purpose: 'RFC 7591 Dynamic Client Registration' },
]

// ── Template catalog (derived from templates.meta.ts) ─────────────────────────

type Param = {
  name: string
  kind: 'nunjucks' | 'body' | 'doc-field'
  type: string
  required: boolean
  documented: boolean   // listed in meta.requires/optional (or known doc-field)
  used: boolean         // appears in template html (nunjucks) or doc pipeline (doc-field)
  notes?: string
}

type TemplateEntry = {
  key: string
  output: string
  description: string
  dims: string
  tags: string[]
  params: Param[]
  acceptsBody?: boolean
  bodyAs?: string
}

const TEMPLATES_DIR = resolve(BRAND_DIR, 'templates')

// Vars the rendering core auto-injects — not user-supplied, hide from params.
const SYSTEM_VARS = new Set(['FONTS_URI', 'TOKENS_CSS'])
// CONTENT/BODY are auto-populated when acceptsBody=true and markdown is passed.
const BODY_AUTO_VARS = new Set(['CONTENT', 'BODY'])

function scanTemplateVars(htmlPath: string): Set<string> {
  if (!existsSync(htmlPath)) return new Set()
  const src = readFileSync(htmlPath, 'utf8')
  const found = new Set<string>()
  const interp = /\{\{\s*([A-Z_][A-Z0-9_]*)/g
  const cond = /\{%\s*(?:if|elif|for\s+\w+\s+in)\s+([A-Z_][A-Z0-9_]*)/g
  for (const m of src.matchAll(interp)) found.add(m[1])
  for (const m of src.matchAll(cond)) found.add(m[1])
  return found
}

// Structured fields exposed by render_template for document templates
// (mirrors the Zod schema in src/mcp/tools/renderTemplate.ts).
const DOC_FIELDS: Record<string, { type: string; notes?: string }> = {
  markdown:     { type: 'markdown',  notes: 'Body content (required for documents).' },
  recipient:    { type: 'object',    notes: 'name, company, address, uid, private, extra_lines' },
  date:         { type: 'string',    notes: 'ISO YYYY-MM-DD or formatted. Defaults to today.' },
  ref:          { type: 'string',    notes: 'Reference number (e.g. invoice number).' },
  subject:      { type: 'string',    notes: 'Defaults to first H1 in body.' },
  eyebrow:      { type: 'string' },
  coverPath:    { type: 'path',      notes: 'Report only — cover image/SVG.' },
  confidential: { type: 'boolean' },
  lang:         { type: "'de' | 'en'", notes: 'Default: de' },
  attachPath:   { type: 'path',      notes: 'PDF to append at end.' },
}

function buildParams(key: string, meta: TemplateMeta): Param[] {
  const params: Param[] = []
  const documented = new Set([...(meta.requires ?? []), ...(meta.optional ?? [])])
  const requiredSet = new Set(meta.requires ?? [])
  const isDoc = meta.tags?.includes('document')

  if (isDoc) {
    // Document templates take structured fields, not Nunjucks vars.
    for (const [name, spec] of Object.entries(DOC_FIELDS)) {
      const required = name === 'markdown' || requiredSet.has(name)
      // Hide irrelevant fields per type via meta.requires/optional + sensible defaults
      const isInvoiceOnly = name === 'coverPath' && key !== 'report'
      if (isInvoiceOnly) continue
      params.push({
        name, kind: 'doc-field', type: spec.type, required,
        // Doc-fields are part of render_template's contract — always documented.
        documented: true,
        used: true,
        notes: spec.notes,
      })
    }
    return params
  }

  // Non-document: scan Nunjucks vars.
  const scanned = scanTemplateVars(resolve(TEMPLATES_DIR, `${key}.html`))
  const union = new Set<string>([...documented, ...scanned])
  for (const name of union) {
    if (SYSTEM_VARS.has(name)) continue
    const used = scanned.has(name)
    const documentedHere = documented.has(name)
    const isBody = BODY_AUTO_VARS.has(name)
    params.push({
      name,
      kind: isBody ? 'body' : 'nunjucks',
      type: isBody ? 'markdown (auto)' : 'string',
      required: requiredSet.has(name),
      documented: documentedHere || isBody,
      used: used || isBody,
      notes: !documentedHere && used ? 'Discovered in template but not in registry.'
           : documentedHere && !used && !isBody ? 'In registry but unused in template.'
           : undefined,
    })
  }
  params.sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return params
}

function dimsLabel(meta: TemplateMeta): string {
  if (meta.dims) return `${meta.dims.width}×${meta.dims.height}`
  if (meta.format) return meta.format
  return ''
}

function entryFor(key: string, meta: TemplateMeta): TemplateEntry {
  return {
    key,
    output: meta.output,
    description: meta.description,
    dims: dimsLabel(meta),
    tags: meta.tags ?? [],
    params: buildParams(key, meta),
    acceptsBody: meta.acceptsBody,
    bodyAs: meta.bodyAs,
  }
}

function filterByTag(tag: string): TemplateEntry[] {
  return Object.entries(TEMPLATE_REGISTRY)
    .filter(([, meta]) => meta.tags?.includes(tag))
    .map(([key, meta]) => entryFor(key, meta))
}

const ALL_TEMPLATES: TemplateEntry[] = Object.entries(TEMPLATE_REGISTRY)
  .map(([key, meta]) => entryFor(key, meta))
  .sort((a, b) => a.key.localeCompare(b.key))

// Lookup maps — keyed by full template key AND by basename (for the site
// pages that already use slugs like `letter` or `linkedin-banner`).
const PARAMS_BY_KEY: Record<string, Param[]> = {}
for (const t of ALL_TEMPLATES) {
  PARAMS_BY_KEY[t.key] = t.params
  const base = t.key.split('/').pop()!
  if (base !== t.key && !PARAMS_BY_KEY[base]) PARAMS_BY_KEY[base] = t.params
}

const TEMPLATE_GROUPS = [
  { id: 'documents', label: 'Documents', templates: filterByTag('document') },
  { id: 'social',    label: 'Social',    templates: filterByTag('social') },
  { id: 'carousel',  label: 'Carousel Slides', templates: filterByTag('carousel-slide') },
]

const TOTAL_TEMPLATES = TEMPLATE_GROUPS.reduce((n, g) => n + g.templates.length, 0)

// ── Write ──────────────────────────────────────────────────────────────────────

const data = {
  totalTools: TOTAL_TOOLS,
  totalTemplates: TOTAL_TEMPLATES,
  toolGroups: TOOL_GROUPS,
  templateGroups: TEMPLATE_GROUPS,
  allTemplates: ALL_TEMPLATES,
  paramsByKey: PARAMS_BY_KEY,
  routes: ROUTES,
}

writeFileSync(OUT, JSON.stringify(data, null, 2))
console.log(`tooling data → ${OUT} (${TOTAL_TOOLS} tools, ${TOTAL_TEMPLATES} templates, ${ROUTES.length} routes)`)
