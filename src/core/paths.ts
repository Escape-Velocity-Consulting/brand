import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Standard set of paths derived from a brand-root directory. The MCP server
 * resolves this once at startup; CLI shims derive it from __dirname.
 */
export interface BrandPaths {
  brandDir: string
  fontsDir: string
  templatesDir: string
  componentsDir: string
  tokensCssPath: string
  tokensJsonPath: string
}

export function resolveBrandPaths(brandDir: string): BrandPaths {
  const fonts = resolve(brandDir, 'fonts')
  const fontsFallback = resolve(brandDir, '..', 'website', 'fonts')
  return {
    brandDir,
    fontsDir: existsSync(fonts) ? fonts : fontsFallback,
    templatesDir: resolve(brandDir, 'templates'),
    componentsDir: resolve(brandDir, 'components'),
    tokensCssPath: resolve(brandDir, 'tokens.css'),
    tokensJsonPath: resolve(brandDir, 'tokens.json'),
  }
}
