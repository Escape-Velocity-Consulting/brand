import type { PublishedItem } from './publishedStore.js'

/**
 * API-shaped view of a PublishedItem — same data as meta.json but with
 * canonical URLs computed from `publicBaseUrl`. Used both by the MCP tools
 * (publish_artifact / list_published) and by the HTTP routes
 * (`GET /api/published[/<id>]`).
 *
 * Why not store URLs in meta.json: publicBaseUrl can change (dev vs prod,
 * domain migrations). Keep meta.json portable, compute URLs at read time.
 */
export interface PublishedApiItem {
  id: string
  type: PublishedItem['type']
  title: string
  publishedAt: string
  primaryFile?: string
  thumbnailFile?: string
  primaryUrl?: string
  thumbnailUrl?: string
  files: Array<{
    relativeName: string
    filename: string
    mime: string
    bytes: number
    url: string
  }>
}

export function publishedItemToApi(item: PublishedItem, publicBaseUrl: string): PublishedApiItem {
  const base = publicBaseUrl.replace(/\/+$/, '')
  const urlFor = (relativeName: string) =>
    `${base}/published/${item.id}/${relativeName.split('/').map(encodeURIComponent).join('/')}`
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    publishedAt: item.publishedAt,
    primaryFile: item.primaryFile,
    thumbnailFile: item.thumbnailFile,
    primaryUrl: item.primaryFile ? urlFor(item.primaryFile) : undefined,
    thumbnailUrl: item.thumbnailFile ? urlFor(item.thumbnailFile) : undefined,
    files: item.files.map((f) => ({
      relativeName: f.relativeName,
      filename: f.filename,
      mime: f.mime,
      bytes: f.bytes,
      url: urlFor(f.relativeName),
    })),
  }
}
