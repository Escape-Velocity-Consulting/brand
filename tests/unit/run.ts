/**
 * Unit tests for the HTTP-mode primitives: signedToken, artifactStore, bearerAuth.
 *
 * Plain assertion-based; no framework. Run with `npm run test:unit`.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateSecret, sign, verify } from '../../src/mcp/shared/signedToken.js'
import { ArtifactStore } from '../../src/mcp/shared/artifactStore.js'
import { constantTimeEqual } from '../../src/mcp/shared/bearerAuth.js'
import { RefreshTokenStore, __testing as rtTesting } from '../../src/mcp/shared/refreshTokenStore.js'

let failures = 0
function check(label: string, cond: unknown, detail?: string) {
  const ok = !!cond
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// ─── signedToken ───────────────────────────────────────────────────────────

function testSignedToken() {
  console.log('\n# signedToken')
  const secret = generateSecret()

  // round-trip
  const { token, uuid, expiresAt } = sign(secret, 60)
  const v = verify(secret, token)
  check('round-trip verifies', v !== null && v.uuid === uuid && v.expiresAt.getTime() === expiresAt.getTime())

  // tamper with hmac
  const tampered = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0')
  check('hmac tamper rejected', verify(secret, tampered) === null)

  // tamper with payload (change one char in uuid)
  const parts = token.split('.')
  const tamperedUuid = parts[0].slice(0, -1) + (parts[0].endsWith('0') ? '1' : '0')
  const tampered2 = [tamperedUuid, parts[1], parts[2]].join('.')
  check('payload tamper rejected', verify(secret, tampered2) === null)

  // wrong secret
  const otherSecret = generateSecret()
  check('different-secret rejected', verify(otherSecret, token) === null)

  // expired
  const past = sign(secret, 1)
  // Force expiry by passing a future "now"
  const future = new Date(past.expiresAt.getTime() + 2000)
  check('expired token rejected', verify(secret, past.token, future) === null)

  // malformed
  check('garbage rejected', verify(secret, 'not-a-token') === null)
  check('empty rejected', verify(secret, '') === null)
  check('two-dot rejected', verify(secret, 'a.b') === null)

  // pre-supplied uuid
  const fixed = sign(secret, 60, 'fixed-uuid-1234')
  check('uuid passthrough', verify(secret, fixed.token)?.uuid === 'fixed-uuid-1234')
}

// ─── artifactStore ─────────────────────────────────────────────────────────

async function testArtifactStore() {
  console.log('\n# artifactStore (async)')
  const storeDir = mkdtempSync(join(tmpdir(), 'brand-mcp-store-'))
  const secret = generateSecret()
  const store = new ArtifactStore({
    storeDir,
    publicBaseUrl: 'https://mcp.example.com',
    signingSecret: secret,
    ttlSeconds: 3600,
  })

  // write a buffer
  const png = Buffer.from('fakepngbytes')
  const result = await store.write(png, { mime: 'image/png', filename: 'test.png' })
  check('URL prefix correct', result.url.startsWith('https://mcp.example.com/artifacts/'))

  const token = result.url.split('/').pop()!
  const resolved = store.resolve(token)
  check('resolves to file + meta', resolved !== null && resolved.meta.filename === 'test.png' && resolved.meta.mime === 'image/png')
  if (resolved) {
    const onDisk = readFileSync(resolved.filePath)
    check('bytes round-trip', onDisk.equals(png))
  }

  // tamper rejection
  check('store rejects truncated token', store.resolve(token.slice(0, -1)) === null)
  check('store rejects garbage token', store.resolve('not-a-real-token') === null)

  // unknown uuid (well-formed token, no file on disk)
  const ghostToken = sign(secret, 60).token
  check('store rejects unknown uuid', store.resolve(ghostToken) === null)

  // cleanup with no expired files removes nothing
  const fresh = store.cleanupOnce(0)
  check('cleanup keeps fresh files', fresh.removed === 0)

  // make a file ancient via mtime manipulation
  const ancient = mkdtempSync(join(tmpdir(), 'brand-mcp-store-'))
  const ancientStore = new ArtifactStore({
    storeDir: ancient,
    publicBaseUrl: 'https://x.tld',
    signingSecret: secret,
    ttlSeconds: 1, // 1s TTL
  })
  const r = await ancientStore.write(Buffer.from('old'), { mime: 'image/png', filename: 'old.png' })
  const oldToken = r.url.split('/').pop()!
  const old = ancientStore.resolve(oldToken)
  check('ancient file initially resolvable', old !== null)
  if (old) {
    // Force mtime way back
    const past = new Date(Date.now() - 86_400_000)
    const fs = await import('node:fs')
    fs.utimesSync(old.filePath, past, past)
    const metaPath = old.filePath.replace(/\.[^.]+$/, '.meta')
    fs.utimesSync(metaPath, past, past)
    const swept = ancientStore.cleanupOnce(0)
    check('cleanup removes ancient files', swept.removed >= 2, `removed ${swept.removed}`)
  }

  rmSync(storeDir, { recursive: true, force: true })
  rmSync(ancient, { recursive: true, force: true })
}

// ─── bearerAuth ───────────────────────────────────────────────────────────

function testBearerAuth() {
  console.log('\n# bearerAuth')
  check('equal strings match', constantTimeEqual('abc', 'abc'))
  check('unequal strings differ', !constantTimeEqual('abc', 'abd'))
  check('different lengths differ', !constantTimeEqual('abc', 'abcd'))
  check('empty equal', constantTimeEqual('', ''))
  check('one empty differs', !constantTimeEqual('', 'a'))
}

// ─── refreshTokenStore ────────────────────────────────────────────────────

function testRefreshTokenStore() {
  console.log('\n# refreshTokenStore')
  const dir = mkdtempSync(join(tmpdir(), 'brand-mcp-rt-'))
  const filePath = join(dir, 'refresh-tokens.json')

  // 1. Issue → consume happy path
  const store = new RefreshTokenStore(filePath)
  const issued = store.issue('a@example.com', 3600)
  check('issued token has rt_ prefix', issued.token.startsWith('rt_'))
  check('issued token is long', issued.token.length > 30)
  check('store has one record', store.count() === 1)
  const consumed = store.consume(issued.token)
  check('consume returns sub', consumed !== null && consumed.sub === 'a@example.com')
  check('consume removes record (single-use)', store.count() === 0)

  // 2. Double-consume rejected
  const reuse = store.consume(issued.token)
  check('reuse rejected after consume', reuse === null)

  // 3. Unknown token rejected
  const ghost = store.consume('rt_definitely-not-in-store')
  check('unknown token rejected', ghost === null)

  // 4. Expired token rejected (still deleted)
  const expired = store.issue('b@example.com', -10) // already expired
  check('expired token persisted before consume', store.count() === 1)
  const consumedExpired = store.consume(expired.token)
  check('expired consume returns null', consumedExpired === null)
  check('expired consume still removes record', store.count() === 0)

  // 5. Persists to disk (round-trip via fresh instance)
  const issued2 = store.issue('c@example.com', 3600)
  const store2 = new RefreshTokenStore(filePath)
  check('record survives reload', store2.count() === 1)
  const consumed2 = store2.consume(issued2.token)
  check('reload-consume returns correct sub', consumed2 !== null && consumed2.sub === 'c@example.com')

  // 6. Raw token never on disk (only hash)
  const issued3 = store.issue('d@example.com', 3600)
  const raw = readFileSync(filePath, 'utf-8')
  check('raw token not in store file', !raw.includes(issued3.token))
  // The hash should be present (hex SHA-256, 64 chars).
  const expectedHash = rtTesting.hashToken(issued3.token)
  check('hash IS in store file', raw.includes(expectedHash))

  // 7. revoke() drops all for a sub
  store.issue('e@example.com', 3600)
  store.issue('e@example.com', 3600)
  store.issue('f@example.com', 3600)
  const beforeRevoke = store.count()
  const removed = store.revoke('e@example.com')
  check('revoke returns count removed', removed === 2)
  check('revoke leaves other subs alone', store.count() === beforeRevoke - 2)

  // 8. prune() drops expired
  store.issue('g@example.com', -1) // expired
  store.issue('h@example.com', 3600)
  const pruneResult = store.prune()
  check('prune reports pruned count', pruneResult.pruned >= 1)
  // Live count should reflect non-expired entries only.
  check('prune leaves live records', pruneResult.live === store.count())

  // 9. Two independent tokens for same sub
  const a1 = store.issue('i@example.com', 3600)
  const a2 = store.issue('i@example.com', 3600)
  check('two issues for same sub differ', a1.token !== a2.token)
  const c1 = store.consume(a1.token)
  check('first consume succeeds', c1 !== null)
  const c2 = store.consume(a2.token)
  check('second consume (independent) succeeds', c2 !== null)

  rmSync(dir, { recursive: true, force: true })
}

// ─── runner ────────────────────────────────────────────────────────────────

async function main() {
  testSignedToken()
  await testArtifactStore()
  testBearerAuth()
  testRefreshTokenStore()
  console.log(`\n${failures === 0 ? 'All unit tests passed.' : `${failures} test(s) FAILED.`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('Unit runner crashed:', err)
  process.exit(1)
})
