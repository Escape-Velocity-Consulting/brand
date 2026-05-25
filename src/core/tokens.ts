import { existsSync, readFileSync } from 'node:fs'
import { GeneratorError } from './errors.js'
import type { BrandPaths } from './paths.js'

export function loadTokensCss(paths: BrandPaths): string {
  if (!existsSync(paths.tokensCssPath)) {
    throw new GeneratorError(
      'TOKENS_CSS_MISSING',
      `tokens.css not found at ${paths.tokensCssPath}. Run: npm run build:tokens`,
    )
  }
  return readFileSync(paths.tokensCssPath, 'utf-8')
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
