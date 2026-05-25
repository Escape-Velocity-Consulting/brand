import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import MarkdownIt from 'markdown-it'

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractTitle(text: string): string {
  const match = text.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : ''
}

/**
 * Convert markdown to body HTML, resolving image references relative to the
 * source directory. Local SVGs are inlined (so they inherit page fonts); other
 * images get absolute file:// URLs so the PDF renderer (which loads HTML from
 * tmpdir) can still resolve them.
 *
 * @param text  Raw markdown.
 * @param mdDir Directory used to resolve relative image paths.
 * @param keepTitle Pass true to keep the first H1; false strips it (default).
 */
export function mdToHtmlFromText(text: string, mdDir: string, keepTitle = false): { body: string; title: string } {
  const title = extractTitle(text)
  let cleaned = text
  if (title && !keepTitle) {
    cleaned = text.replace(new RegExp(`^#\\s+${escapeRegex(title)}\\s*$`, 'm'), '')
  }

  const md = new MarkdownIt({ html: true, typographer: true })
  let body = md.render(cleaned)

  body = body.replace(/<img([^>]*?)\ssrc="([^"]+)"([^>]*)>/g, (match, pre, src, post) => {
    if (/^(https?:|data:|file:|\/)/i.test(src)) return match
    const decoded = decodeURI(src)
    const absPath = resolve(mdDir, decoded)
    if (absPath.toLowerCase().endsWith('.svg') && existsSync(absPath)) {
      const svgRaw = readFileSync(absPath, 'utf-8')
      const svgEl = svgRaw.replace(/<\?xml[^?]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').trim()
      return `<span class="inline-svg">${svgEl}</span>`
    }
    const fileUrl = pathToFileURL(absPath).href
    return `<img${pre} src="${fileUrl}"${post}>`
  })

  return { body, title }
}

export function mdToHtmlFromFile(mdPath: string, keepTitle = false): { body: string; title: string } {
  const text = readFileSync(mdPath, 'utf-8')
  return mdToHtmlFromText(text, dirname(mdPath), keepTitle)
}
