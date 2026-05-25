import sharp from 'sharp'

// Re-export the canonical HTML→PNG primitive from render.ts. This module is
// preserved for backward compatibility with callers that historically imported
// renderHtmlToPng from '../core/image.js' (CLI shim, older MCP tools).
export { renderHtmlToPng } from './render.js'

export const IMAGE_PRESETS: Record<string, { width: number; height: number }> = {
  'og':                 { width: 1200, height: 630 },
  'linkedin-banner':    { width: 1584, height: 396 },
  'linkedin-post':      { width: 1200, height: 1200 },
  'linkedin-landscape': { width: 1200, height: 627 },
  'linkedin-portrait':  { width: 1080, height: 1350 },
  'square':             { width: 1000, height: 1000 },
  'twitter-banner':     { width: 1500, height: 500 },
  'youtube-banner':     { width: 2560, height: 1440 },
  'instagram-post':     { width: 1080, height: 1080 },
  'instagram-story':    { width: 1080, height: 1920 },
  'a4':                 { width: 794, height: 1123 },
}

/**
 * SVG → PNG via sharp. No browser needed.
 */
export async function renderSvgToPng(input: { svgPath: string }, dims: { width: number; height: number }): Promise<Buffer> {
  return sharp(input.svgPath)
    .resize(dims.width, dims.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}
