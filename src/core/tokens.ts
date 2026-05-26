import { existsSync, readFileSync } from 'node:fs'
import { GeneratorError } from './errors.js'
import type { BrandPaths } from './paths.js'

/**
 * Build @font-face declarations for all brand fonts, resolved against the
 * given fontsUri (a file:// URL or HTTP base). Prepended to TOKENS_CSS so
 * that any HTML — template or skill-authored custom HTML — loads fonts without
 * needing its own @font-face block.
 */
export function buildFontFaceCss(fontsUri: string): string {
  return `
@font-face {
  font-family: 'Space Grotesk';
  src: url('${fontsUri}/space-grotesk.woff2') format('woff2');
  font-weight: 400 700;
  font-display: swap;
}
@font-face {
  font-family: 'Space Grotesk';
  src: url('${fontsUri}/space-grotesk-ext.woff2') format('woff2');
  font-weight: 400 700;
  font-display: swap;
  unicode-range: U+0100-024F;
}
@font-face {
  font-family: 'Manrope';
  src: url('${fontsUri}/manrope.woff2') format('woff2');
  font-weight: 400 800;
  font-display: swap;
}
@font-face {
  font-family: 'Manrope';
  src: url('${fontsUri}/manrope-ext.woff2') format('woff2');
  font-weight: 400 800;
  font-display: swap;
  unicode-range: U+0100-024F;
}
@font-face {
  font-family: 'Inter';
  src: url('${fontsUri}/inter.woff2') format('woff2');
  font-weight: 400 700;
  font-display: swap;
}
@font-face {
  font-family: 'Inter';
  src: url('${fontsUri}/inter-ext.woff2') format('woff2');
  font-weight: 400 700;
  font-display: swap;
  unicode-range: U+0100-024F;
}
@font-face {
  font-family: 'JetBrains Mono';
  src: url('${fontsUri}/jetbrains-mono.woff2') format('woff2');
  font-weight: 400 500;
  font-display: swap;
}
@font-face {
  font-family: 'JetBrains Mono';
  src: url('${fontsUri}/jetbrains-mono-ext.woff2') format('woff2');
  font-weight: 400 500;
  font-display: swap;
  unicode-range: U+0100-024F;
}
`.trimStart()
}

export function loadTokensCss(paths: BrandPaths, fontsUri?: string): string {
  if (!existsSync(paths.tokensCssPath)) {
    throw new GeneratorError(
      'TOKENS_CSS_MISSING',
      `tokens.css not found at ${paths.tokensCssPath}. Run: npm run build:tokens`,
    )
  }
  const tokensCss = readFileSync(paths.tokensCssPath, 'utf-8')
  return fontsUri ? buildFontFaceCss(fontsUri) + tokensCss : tokensCss
}

export function loadTokensJson(paths: BrandPaths): unknown {
  if (!existsSync(paths.tokensJsonPath)) {
    throw new GeneratorError(
      'TOKENS_JSON_MISSING',
      `tokens.json not found at ${paths.tokensJsonPath}. Run: npm run build:tokens`,
    )
  }
  return JSON.parse(readFileSync(paths.tokensJsonPath, 'utf-8'))
}
