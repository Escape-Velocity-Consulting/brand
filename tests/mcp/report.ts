/**
 * HTML report generator. Given an array of test results (with full request +
 * response captured), writes:
 *   <reportDir>/index.html
 *   <reportDir>/artifacts/<test-id>/<copied artifacts>
 *
 * Artifacts referenced via {{structured.<key>}}-style paths in the response are
 * copied into the report dir so the HTML is self-contained and openable from
 * file:// without cross-origin blocks.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'

export interface CapturedResult {
  name: string
  tool: string
  ok: boolean
  details: string[]
  ms: number
  request: unknown
  response: {
    isError: boolean
    structuredContent?: Record<string, unknown>
    content?: { type: string; text: string }[]
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function safeId(name: string, idx: number): string {
  return String(idx).padStart(2, '0') + '-' + name.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

/**
 * Walk structuredContent looking for output-artifact paths. Only fields whose
 * key matches the artifact-naming convention (ends in Path/Paths/Dir/path) are
 * considered, and the value must be an absolute path that exists. Paths inside
 * BRAND_DIR are excluded so the brand source repo isn't mistaken for output.
 */
const ARTIFACT_KEY_RE = /(Path|Paths|Dir|path)$/

function isArtifactPath(value: string, brandDir?: string): boolean {
  if (!/^([A-Za-z]:[\\/]|\/)/.test(value)) return false
  if (!existsSync(value)) return false
  if (brandDir) {
    const norm = value.replace(/\\/g, '/').toLowerCase()
    const bd = brandDir.replace(/\\/g, '/').toLowerCase()
    if (norm === bd || norm.startsWith(bd + '/')) return false
  }
  return true
}

function collectArtifactPaths(value: unknown, brandDir?: string, acc: string[] = [], keyMatched = false): string[] {
  if (typeof value === 'string') {
    if (keyMatched && isArtifactPath(value, brandDir)) acc.push(value)
  } else if (Array.isArray(value)) {
    // Inherit the keyMatched context — pngPaths: ["…", "…"] all qualify
    for (const v of value) collectArtifactPaths(v, brandDir, acc, keyMatched)
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      collectArtifactPaths(v, brandDir, acc, ARTIFACT_KEY_RE.test(k))
    }
  }
  return acc
}

function copyArtifact(src: string, destDir: string): { copied: string[]; primary: string } {
  mkdirSync(destDir, { recursive: true })
  const st = statSync(src)
  if (st.isFile()) {
    const name = basename(src)
    const dest = join(destDir, name)
    copyFileSync(src, dest)
    return { copied: [name], primary: name }
  }
  // directory — copy contents (one level deep, html + slides/)
  const copied: string[] = []
  let primary = ''
  const walk = (cur: string, relPath: string) => {
    for (const entry of readdirSync(cur)) {
      const full = join(cur, entry)
      const rel = relPath ? `${relPath}/${entry}` : entry
      const s = statSync(full)
      if (s.isDirectory()) {
        mkdirSync(join(destDir, rel), { recursive: true })
        walk(full, rel)
      } else {
        copyFileSync(full, join(destDir, rel))
        copied.push(rel)
        if (!primary && entry === 'index.html') primary = rel
      }
    }
  }
  walk(src, '')
  // For a directory, prefer index.html, else first .pdf, else first file
  if (!primary) {
    const pdf = copied.find((c) => c.endsWith('.pdf'))
    primary = pdf ?? copied[0] ?? ''
  }
  return { copied, primary }
}

const STYLES = `
:root {
  --bg: #F9F7F4; --card: #ffffff; --text: #1A1816; --body: #5C5650; --muted: #807A74;
  --border: #E8E5E0; --accent: #E8865A; --terracotta: #D4784A;
  --pass: #16A34A; --fail: #C2484A;
  --code-bg: #1E1C1A; --code-text: #F5F3F0;
  --font-head: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 24px 64px; background: var(--bg); color: var(--text); font-family: var(--font-body); line-height: 1.5; }
.container { max-width: 1100px; margin: 0 auto; }
h1 { font-family: var(--font-head); font-weight: 700; font-size: 32px; margin: 0 0 8px; letter-spacing: -0.01em; }
h1 .accent { color: var(--accent); }
.subtitle { color: var(--muted); margin: 0 0 24px; font-size: 14px; }
.summary { display: flex; gap: 8px; align-items: center; margin-bottom: 32px; padding: 12px 16px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; font-family: var(--font-mono); font-size: 13px; }
.summary .stat { padding: 2px 10px; border-radius: 6px; font-weight: 600; }
.stat.pass { background: rgba(22,163,74,.12); color: var(--pass); }
.stat.fail { background: rgba(194,72,74,.12); color: var(--fail); }
.stat.total { background: rgba(0,0,0,.05); color: var(--text); }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 20px; overflow: hidden; }
.card-header { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.badge { font-family: var(--font-mono); font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
.badge.pass { background: rgba(22,163,74,.12); color: var(--pass); }
.badge.fail { background: rgba(194,72,74,.12); color: var(--fail); }
.tool { font-family: var(--font-mono); font-size: 13px; color: var(--terracotta); font-weight: 500; }
.name { font-weight: 500; color: var(--text); flex: 1; }
.timing { font-family: var(--font-mono); font-size: 12px; color: var(--muted); }
.fail-details { padding: 10px 18px; background: rgba(194,72,74,.06); color: var(--fail); font-family: var(--font-mono); font-size: 12px; }
.fail-details > div { padding: 2px 0; }
.body { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
.body > section { padding: 16px 18px; }
.body > section + section { border-left: 1px solid var(--border); }
.body h3 { font-family: var(--font-head); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 0 0 8px; font-weight: 600; }
pre { margin: 0; background: var(--code-bg); color: var(--code-text); padding: 12px 14px; border-radius: 8px; font-family: var(--font-mono); font-size: 12px; line-height: 1.5; overflow-x: auto; max-height: 320px; overflow-y: auto; }
.artifacts { padding: 16px 18px; border-top: 1px solid var(--border); background: rgba(232,134,90,.04); }
.artifacts h3 { font-family: var(--font-head); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 0 0 12px; font-weight: 600; }
.artifact-list { display: flex; flex-wrap: wrap; gap: 12px; }
.artifact { display: flex; flex-direction: column; gap: 6px; padding: 10px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; max-width: 320px; }
.artifact img { display: block; max-width: 300px; max-height: 200px; width: auto; height: auto; border-radius: 4px; background: #f0f0f0; border: 1px solid var(--border); }
.artifact .meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-family: var(--font-mono); font-size: 11px; color: var(--muted); }
.artifact a { color: var(--terracotta); text-decoration: none; font-weight: 500; word-break: break-all; }
.artifact a:hover { color: var(--accent); text-decoration: underline; }
.artifact .type-tag { background: rgba(212,120,74,.12); color: var(--terracotta); padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
.no-artifacts { padding: 12px 16px; color: var(--muted); font-style: italic; font-size: 13px; }
details { margin-top: 8px; }
details summary { cursor: pointer; font-size: 12px; color: var(--muted); user-select: none; }
details summary:hover { color: var(--text); }
@media (max-width: 700px) { .body { grid-template-columns: 1fr; } .body > section + section { border-left: none; border-top: 1px solid var(--border); } }
`

interface ArtifactInfo { name: string; relPath: string; type: 'png' | 'pdf' | 'html' | 'other' }

function classifyArtifact(name: string): ArtifactInfo['type'] {
  const ext = extname(name).toLowerCase()
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.svg') return 'png'
  if (ext === '.pdf') return 'pdf'
  if (ext === '.html' || ext === '.htm') return 'html'
  return 'other'
}

function renderArtifact(art: ArtifactInfo): string {
  const href = `artifacts/${art.relPath}`
  if (art.type === 'png') {
    return `
      <div class="artifact">
        <a href="${escapeHtml(href)}" target="_blank"><img src="${escapeHtml(href)}" alt="${escapeHtml(art.name)}"></a>
        <div class="meta"><span class="type-tag">PNG</span><a href="${escapeHtml(href)}" target="_blank">${escapeHtml(art.name)}</a></div>
      </div>
    `
  }
  const tag = art.type.toUpperCase()
  return `
    <div class="artifact">
      <div class="meta"><span class="type-tag">${tag}</span><a href="${escapeHtml(href)}" target="_blank">${escapeHtml(art.name)}</a></div>
    </div>
  `
}

export function writeReport(results: CapturedResult[], reportDir: string, brandDir?: string): string {
  // Fresh artifacts dir
  const artifactsRoot = join(reportDir, 'artifacts')
  if (existsSync(artifactsRoot)) rmSync(artifactsRoot, { recursive: true, force: true })
  mkdirSync(artifactsRoot, { recursive: true })

  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'

  const cards = results.map((r, i) => {
    const id = safeId(r.tool, i + 1)
    const testDir = join(artifactsRoot, id)

    // Collect artifacts from the response. Prefer directories (they bring their
    // siblings — fonts/, components/, etc. — needed for HTML viewers to work
    // standalone). Drop individual files that are inside any kept directory.
    const candidates = [...new Set(collectArtifactPaths(r.response.structuredContent, brandDir))]
    const dirs: string[] = []
    const files: string[] = []
    for (const p of candidates) {
      try {
        const st = statSync(p)
        if (st.isDirectory()) dirs.push(p)
        else if (st.isFile()) files.push(p)
      } catch {}
    }
    const isUnder = (f: string, d: string) => {
      const dn = d.replace(/[\\/]+$/, '')
      return f.startsWith(dn + '\\') || f.startsWith(dn + '/')
    }
    const filesToKeep = files.filter((f) => !dirs.some((d) => isUnder(f, d)))
    const toCopy = [...dirs, ...filesToKeep]

    const arts: ArtifactInfo[] = []
    for (const src of toCopy) {
      try {
        const { copied } = copyArtifact(src, testDir)
        for (const name of copied) {
          // Only surface top-level entries in the UI. Files inside subfolders
          // (fonts/, components/, etc.) are copied so HTML viewers work, but
          // they're noise in the artifact card.
          if (name.includes('/') || name.includes('\\')) continue
          arts.push({ name, relPath: `${id}/${name}`, type: classifyArtifact(name) })
        }
      } catch (err) {
        // Skip silently — broken artifact reference shouldn't crash the report
      }
    }

    const reqJson = escapeHtml(JSON.stringify(r.request, null, 2))
    const respJson = escapeHtml(JSON.stringify({
      isError: r.response.isError,
      structuredContent: r.response.structuredContent,
      content: r.response.content,
    }, null, 2))

    const failBlock = r.ok ? '' : `
      <div class="fail-details">
        ${r.details.map((d) => `<div>${escapeHtml(d)}</div>`).join('')}
      </div>`

    const artifactsBlock = arts.length === 0
      ? '<div class="no-artifacts">No artifacts captured for this test.</div>'
      : `<div class="artifacts">
           <h3>Output Artifacts</h3>
           <div class="artifact-list">${arts.map(renderArtifact).join('')}</div>
         </div>`

    return `
      <div class="card">
        <div class="card-header">
          <span class="badge ${r.ok ? 'pass' : 'fail'}">${r.ok ? 'PASS' : 'FAIL'}</span>
          <span class="tool">${escapeHtml(r.tool)}</span>
          <span class="name">${escapeHtml(r.name)}</span>
          <span class="timing">${r.ms}ms</span>
        </div>
        ${failBlock}
        <div class="body">
          <section>
            <h3>Request</h3>
            <pre>${reqJson}</pre>
          </section>
          <section>
            <h3>Response</h3>
            <pre>${respJson}</pre>
          </section>
        </div>
        ${artifactsBlock}
      </div>
    `
  }).join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>brand-engine MCP — E2E test report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>${STYLES}</style>
</head>
<body>
  <div class="container">
    <h1>brand-engine MCP <span class="accent">E2E report</span></h1>
    <p class="subtitle">Generated ${escapeHtml(ts)}</p>
    <div class="summary">
      <span class="stat total">${results.length} total</span>
      <span class="stat pass">${passed} passed</span>
      ${failed > 0 ? `<span class="stat fail">${failed} failed</span>` : ''}
      <span style="flex:1"></span>
      <span style="color: var(--muted)">Total time: ${results.reduce((a, r) => a + r.ms, 0)}ms</span>
    </div>
    ${cards}
  </div>
</body>
</html>`

  const indexPath = join(reportDir, 'index.html')
  writeFileSync(indexPath, html, 'utf-8')
  return indexPath
}
