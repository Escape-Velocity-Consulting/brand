/**
 * Structured stderr logger for the MCP HTTP server.
 *
 * Output shape:
 *   [escape-velocity-brand MCP/http] evt=<event_name> key1=value1 key2="value with spaces" ...
 *
 * Line-oriented, greppable without jq. Matches the existing
 * `[escape-velocity-brand MCP/http] …` prefix used throughout the codebase.
 *
 * Privacy: never log raw tokens, Authorization headers, client secrets, or
 * Google ID tokens. Use `truncId` for session IDs / OAuth codes / refresh
 * token IDs. Use `redactIp` for client IPs (default off — DSGVO-conscious).
 */
const PREFIX = '[escape-velocity-brand MCP/http]'

export type LogFields = Record<string, unknown>

/**
 * Write one structured event to stderr.
 *
 * Numbers and booleans are rendered as-is. Strings containing whitespace or
 * `=` are double-quoted. `Error` values are rendered via `.message` only
 * (never `.stack` — file paths leak). `undefined`/`null` fields are dropped.
 */
export function log(event: string, fields?: LogFields): void {
  const parts: string[] = [`${PREFIX} evt=${event}`]
  if (fields) {
    for (const key of Object.keys(fields)) {
      const v = fields[key]
      if (v === undefined || v === null) continue
      parts.push(`${key}=${formatValue(v)}`)
    }
  }
  process.stderr.write(parts.join(' ') + '\n')
}

function formatValue(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Error) return quoteIfNeeded(v.message)
  if (typeof v === 'string') return quoteIfNeeded(v)
  // Fallback: best-effort JSON. Avoid throwing.
  try { return quoteIfNeeded(JSON.stringify(v)) }
  catch { return '"<unserializable>"' }
}

function quoteIfNeeded(s: string): string {
  if (s === '') return '""'
  // Quote if it contains whitespace, '=', '"', or newline. Escape embedded quotes/newlines.
  if (/[\s="\\]/.test(s) || s.includes('\n')) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`
  }
  return s
}

/**
 * Truncate an opaque ID for logging. Returns the first `keep` chars + '…'.
 * Use for session IDs, OAuth flow IDs, auth codes, refresh-token hashes.
 *
 * Enough to correlate within a log window; not enough to replay if the file
 * leaks.
 */
export function truncId(id: string | undefined, keep = 8): string | undefined {
  if (!id) return undefined
  if (id.length <= keep) return id
  return id.slice(0, keep) + '…'
}

/**
 * Honor `MCP_LOG_IP` env knob for client IP logging.
 *   - `none` (default) — return undefined; field will be dropped.
 *   - `truncated` — /16 IPv4, /48 IPv6.
 *   - `full` — return as-is (opt-in only).
 *
 * DSGVO note: even truncated IPs can be personal data. Default off.
 */
export function redactIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined
  const mode = (process.env.MCP_LOG_IP ?? 'none').toLowerCase()
  if (mode === 'full') return ip
  if (mode !== 'truncated') return undefined

  // IPv4: keep first two octets, zero the rest.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(ip)
  if (v4) return `${v4[1]}.${v4[2]}.0.0/16`

  // IPv4-mapped IPv6 (::ffff:1.2.3.4).
  const v4mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(ip)
  if (v4mapped) return redactIp(v4mapped[1])

  // IPv6: keep first three groups (/48), zero the rest.
  if (ip.includes(':')) {
    const groups = ip.split(':').slice(0, 3).join(':')
    return `${groups}::/48`
  }
  return undefined
}

/**
 * Truncate a User-Agent string for logging. Caps at 80 chars; enough to
 * distinguish Claude Desktop / Claude Code / mcp-remote / curl.
 */
export function truncUa(ua: string | undefined): string | undefined {
  if (!ua) return undefined
  return ua.length <= 80 ? ua : ua.slice(0, 80) + '…'
}
