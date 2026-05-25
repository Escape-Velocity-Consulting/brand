import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * Resolve the brand-root directory. Order of preference:
 *   1. $BRAND_DIR env var (must exist on disk).
 *   2. Walk up from this file looking for a package.json with name "brand",
 *      OR a directory containing tokens.ts + templates/ (the brand-repo signature).
 *
 * Throws if neither lookup succeeds.
 */
export function resolveBrandDir(fromFileUrl: string): string {
  if (process.env.BRAND_DIR) {
    const candidate = resolve(process.env.BRAND_DIR)
    if (!existsSync(candidate)) {
      throw new Error(`BRAND_DIR points to a non-existent path: ${candidate}`)
    }
    return candidate
  }

  const here = dirname(new URL(fromFileUrl).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  let cur = here
  for (let i = 0; i < 8; i++) {
    const pkg = resolve(cur, 'package.json')
    if (existsSync(pkg)) {
      try {
        const meta = JSON.parse(readFileSync(pkg, 'utf-8'))
        if (meta.name === 'brand') return cur
      } catch {}
    }
    if (existsSync(resolve(cur, 'tokens.ts')) && existsSync(resolve(cur, 'templates'))) {
      return cur
    }
    const parent = dirname(cur)
    if (parent === cur) break
    cur = parent
  }

  throw new Error('Could not locate the brand directory. Set BRAND_DIR environment variable.')
}
