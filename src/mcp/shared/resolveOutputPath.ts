import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

/**
 * Resolve a user-provided outputPath. If absolute, used as-is. If relative,
 * resolved against the MCP server's CWD (which Claude Code sets to the user's
 * conversation directory). Creates the parent dir if missing.
 */
export function resolveOutputPath(outputPath: string): string {
  const abs = isAbsolute(outputPath) ? outputPath : resolve(process.cwd(), outputPath)
  mkdirSync(dirname(abs), { recursive: true })
  return abs
}
