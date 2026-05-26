/**
 * Throwaway smoke test: render the published-detail page template with a
 * sample PublishedItem and write to previews/decks/smoke-detail.html for
 * visual inspection. Not part of the test suite.
 */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveBrandPaths } from '../src/core/paths.js'
import { renderPublishedDetailPage } from '../src/mcp/shared/publishedDetailPage.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const paths = resolveBrandPaths(resolve(__dirname, '..'))

const html = renderPublishedDetailPage(
  {
    id: 'TestAbc123',
    type: 'deck',
    title: 'KI Masterclass für Geschäftsführer',
    publishedAt: '2026-05-28T13:00:00.000Z',
    primaryFile: 'index.html',
    thumbnailFile: 'slides/slide-01.png',
    files: [
      { relativeName: 'index.html', filename: 'index.html', mime: 'text/html', bytes: 5000 },
      { relativeName: 'masterclass.pdf', filename: 'masterclass.pdf', mime: 'application/pdf', bytes: 100000 },
      { relativeName: 'source.md', filename: 'source.md', mime: 'text/markdown', bytes: 2000 },
      { relativeName: 'slides/slide-01.png', filename: 'slide-01.png', mime: 'image/png', bytes: 50000 },
      { relativeName: 'slides/slide-02.png', filename: 'slide-02.png', mime: 'image/png', bytes: 50000 },
      { relativeName: 'slides/slide-03.png', filename: 'slide-03.png', mime: 'image/png', bytes: 50000 },
      { relativeName: 'slides/slide-04.png', filename: 'slide-04.png', mime: 'image/png', bytes: 50000 },
    ],
  },
  'https://mcp.example.com',
  paths,
)

const out = resolve(__dirname, '..', 'previews', 'decks', 'smoke-detail.html')
writeFileSync(out, html)
console.log('Wrote ' + out + ' (' + html.length + ' bytes)')
