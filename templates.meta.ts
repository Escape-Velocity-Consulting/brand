/**
 * Template registry — single source of truth for what each brand template
 * produces, what dimensions/format it expects, and what inputs it requires.
 *
 * Read by:
 * - `src/mcp/tools/listTemplates.ts` — exposed to agents via the `list_templates` MCP tool
 * - `src/mcp/tools/renderTemplate.ts` — dispatches to PNG or PDF rendering based on `output`
 *
 * Adding a new template?
 * 1. Drop the `.html` file under `templates/` (or a subfolder).
 * 2. Add an entry here keyed by its template path (relative to `templates/`, without the `.html` extension).
 * 3. Run `npm run build:tokens` to regenerate `templates.meta.json`.
 */

export type TemplateOutput = 'png' | 'pdf'

export interface TemplateMeta {
  /** Output format this template produces. */
  output: TemplateOutput
  /** Short, human-readable description (shown in the list_templates response). */
  description: string
  /** For PNG templates: viewport dimensions in pixels. */
  dims?: { width: number; height: number }
  /** For PDF templates: page format. */
  format?: 'A4' | 'A3' | 'Letter' | 'Legal'
  /** For PDF templates: which footer variant to use (matches `footerTemplate` in document.ts). */
  footer?: 'document'
  /** For PDF templates: page margins. */
  margin?: { top?: string; right?: string; bottom?: string; left?: string }
  /** Whether the template has a body slot fillable via a markdown string. */
  acceptsBody?: boolean
  /** How the body is processed before injection. */
  bodyAs?: 'markdown' | 'html'
  /** Required Nunjucks variables (top-level keys). For documentation / validation. */
  requires?: string[]
  /** Optional variables (top-level keys). */
  optional?: string[]
  /** Tags for filtering / grouping (e.g. 'document', 'social', 'carousel-slide'). */
  tags?: string[]
}

// ─── Document templates ────────────────────────────────────────────────────

const DOCUMENT_DEFAULTS = {
  format: 'A4' as const,
  footer: 'document' as const,
  margin: { top: '12mm', right: '25mm', bottom: '20mm', left: '25mm' },
}

const DOCUMENTS: Record<string, TemplateMeta> = {
  letter: {
    output: 'pdf',
    description: 'Branded business letter (single or multi-page). Markdown body, optional recipient block.',
    ...DOCUMENT_DEFAULTS,
    acceptsBody: true,
    bodyAs: 'markdown',
    optional: ['recipient', 'date', 'ref', 'subject', 'eyebrow', 'confidential', 'lang'],
    tags: ['document'],
  },
  offer: {
    output: 'pdf',
    description: 'Branded offer / proposal PDF. Markdown body, recipient + date required for canonical filename.',
    ...DOCUMENT_DEFAULTS,
    acceptsBody: true,
    bodyAs: 'markdown',
    requires: ['recipient', 'date'],
    optional: ['ref', 'subject', 'eyebrow', 'lang'],
    tags: ['document'],
  },
  invoice: {
    output: 'pdf',
    description: 'Branded invoice PDF. Structured invoice line items in the body. Recipient + UID (or private flag) required.',
    ...DOCUMENT_DEFAULTS,
    acceptsBody: true,
    bodyAs: 'markdown',
    requires: ['recipient', 'date'],
    optional: ['ref', 'subject', 'lang'],
    tags: ['document'],
  },
  tos: {
    output: 'pdf',
    description: 'Terms of service / legal document. Markdown body, optional headings.',
    ...DOCUMENT_DEFAULTS,
    acceptsBody: true,
    bodyAs: 'markdown',
    optional: ['subject', 'date', 'lang'],
    tags: ['document'],
  },
  report: {
    output: 'pdf',
    description: 'Branded multi-page report. Markdown body, optional cover image.',
    ...DOCUMENT_DEFAULTS,
    acceptsBody: true,
    bodyAs: 'markdown',
    optional: ['cover', 'subject', 'eyebrow', 'lang'],
    tags: ['document'],
  },
}

// ─── Social templates ──────────────────────────────────────────────────────

const SOCIAL: Record<string, TemplateMeta> = {
  'social/og': {
    output: 'png',
    description: 'Open Graph image (1200×630). For website / blog post sharing.',
    dims: { width: 1200, height: 630 },
    optional: ['TITLE', 'SUBTITLE', 'EYEBROW'],
    tags: ['social', 'og'],
  },
  'social/linkedin-banner': {
    output: 'png',
    description: 'LinkedIn profile banner (1584×396).',
    dims: { width: 1584, height: 396 },
    optional: ['TITLE', 'SUBTITLE'],
    tags: ['social', 'linkedin'],
  },
  'social/twitter-banner': {
    output: 'png',
    description: 'Twitter/X profile banner (1500×500).',
    dims: { width: 1500, height: 500 },
    optional: ['TITLE', 'SUBTITLE'],
    tags: ['social', 'twitter'],
  },
  'social/youtube-banner': {
    output: 'png',
    description: 'YouTube channel banner (2560×1440, safe area ~1546×423).',
    dims: { width: 2560, height: 1440 },
    optional: ['TITLE', 'SUBTITLE'],
    tags: ['social', 'youtube'],
  },
  'social/announcement': {
    output: 'png',
    description: 'Announcement post (1200×630). Bold title + body copy.',
    dims: { width: 1200, height: 630 },
    optional: ['TITLE', 'BODY', 'EYEBROW'],
    tags: ['social'],
  },
  'social/quote-card': {
    output: 'png',
    description: 'Square quote card (1200×1200). Quote + attribution.',
    dims: { width: 1200, height: 1200 },
    optional: ['QUOTE', 'AUTHOR'],
    tags: ['social'],
  },
  'social/stats-card': {
    output: 'png',
    description: 'Square stats card (1200×1200). Big number + label + context.',
    dims: { width: 1200, height: 1200 },
    optional: ['NUMBER', 'LABEL', 'CONTEXT'],
    tags: ['social'],
  },
}

// ─── Carousel slide templates ──────────────────────────────────────────────

const CAROUSEL: Record<string, TemplateMeta> = {
  'carousel/title': {
    output: 'png',
    description: 'Carousel title slide (LinkedIn portrait 1080×1350). Eyebrow + big number + body.',
    dims: { width: 1080, height: 1350 },
    optional: ['EYEBROW', 'BIGNUMBER', 'TITLE', 'BODY'],
    tags: ['carousel-slide', 'linkedin'],
  },
  'carousel/numbered-item': {
    output: 'png',
    description: 'Carousel numbered list item (1080×1350). Used inside multi-slide carousels.',
    dims: { width: 1080, height: 1350 },
    optional: ['TITLE', 'BODY', 'PROGRESS'],
    tags: ['carousel-slide', 'linkedin'],
  },
  'carousel/cta': {
    output: 'png',
    description: 'Carousel CTA / closing slide (1080×1350).',
    dims: { width: 1080, height: 1350 },
    optional: ['CTA', 'SUBTITLE'],
    tags: ['carousel-slide', 'linkedin'],
  },
}

// ─── Combined registry ─────────────────────────────────────────────────────

export const TEMPLATE_REGISTRY: Record<string, TemplateMeta> = {
  ...DOCUMENTS,
  ...SOCIAL,
  ...CAROUSEL,
}

/** Resolve a template key to its `.html` path under the `templates/` directory. */
export function templateFilePath(key: string): string {
  return `${key}.html`
}

/** Look up metadata by template key. Throws if unknown. */
export function getTemplateMeta(key: string): TemplateMeta {
  const meta = TEMPLATE_REGISTRY[key]
  if (!meta) {
    throw new Error(`Unknown template: ${key}. Available: ${Object.keys(TEMPLATE_REGISTRY).join(', ')}`)
  }
  return meta
}
