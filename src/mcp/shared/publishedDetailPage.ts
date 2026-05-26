/**
 * Server-side render of the publication detail page served at
 * `GET /published/<id>`. This is the canonical share URL for any published
 * artifact — it wraps the underlying viewer/PDF/MD with metadata and CTAs.
 *
 * Template: `templates/published-detail.html`. The route handler in
 * `server-http.ts` calls `renderPublishedDetailPage(...)` and pipes the result
 * back as HTML.
 */
import type { BrandPaths } from '../../core/paths.js'
import { getTemplateEnv } from '../../core/templates.js'
import { loadTokensCss } from '../../core/tokens.js'
import type { PublishedItem } from './publishedStore.js'

const TYPE_LABELS: Record<string, string> = {
  deck: 'Slide deck',
  carousel: 'Carousel',
  document: 'Document',
  image: 'Image',
  'html-pdf': 'Document',
  'html-png': 'Image',
}

const OPEN_LABELS: Record<string, string> = {
  deck: 'Open deck',
  carousel: 'Open carousel',
  document: 'Open document',
  image: 'Open image',
  'html-pdf': 'Open document',
  'html-png': 'Open image',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function renderPublishedDetailPage(
  item: PublishedItem,
  publicBaseUrl: string,
  paths: BrandPaths,
): string {
  const base = publicBaseUrl.replace(/\/+$/, '')
  const detailUrl = `${base}/published/${item.id}`
  const urlFor = (relativeName: string) =>
    `${base}/published/${item.id}/${relativeName.split('/').map(encodeURIComponent).join('/')}`

  // Decks have an index.html viewer + a PDF + per-slide PNGs + source.md.
  // Other types may just have a single primary file. View URL points to the
  // viewer (decks) or the primary file (everything else).
  const isDeck = item.type === 'deck'
  const hasIndexHtml = item.files.some((f) => f.relativeName === 'index.html')
  const viewUrl = isDeck && hasIndexHtml
    ? `${base}/published/${item.id}/view`
    : item.primaryFile ? urlFor(item.primaryFile) : undefined

  const pdfFile = item.files.find((f) => f.mime === 'application/pdf')
  const mdFile = item.files.find((f) => f.relativeName === 'source.md')

  // First four slide thumbnails for the preview strip (deck only).
  const thumbnails: string[] = []
  if (isDeck) {
    const slidePngs = item.files
      .filter((f) => /^slides\/slide-\d+\.png$/.test(f.relativeName))
      .sort((a, b) => a.relativeName.localeCompare(b.relativeName))
      .slice(0, 4)
    for (const f of slidePngs) thumbnails.push(urlFor(f.relativeName))
  }

  const env = getTemplateEnv(paths.templatesDir)
  const tokensCss = loadTokensCss(paths)

  return env.render('published-detail.html', {
    TITLE: item.title,
    TYPE_LABEL: TYPE_LABELS[item.type] ?? item.type,
    OPEN_LABEL: OPEN_LABELS[item.type] ?? 'Open',
    PUBLISHED_AT: item.publishedAt,
    PUBLISHED_AT_LABEL: formatDate(item.publishedAt),
    DETAIL_URL: detailUrl,
    VIEW_URL: viewUrl,
    PDF_URL: pdfFile ? urlFor(pdfFile.relativeName) : undefined,
    MD_URL: mdFile ? urlFor(mdFile.relativeName) : undefined,
    THUMBNAILS: thumbnails,
    THUMBNAIL_URL: item.thumbnailFile ? urlFor(item.thumbnailFile) : undefined,
    TOKENS_CSS: tokensCss,
  })
}
