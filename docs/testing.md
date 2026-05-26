# Testing

Three suites cover the MCP server + rendering core. All share the same data-driven JSON fixture format where applicable.

| Suite | Command | Transport | What it covers |
|---|---|---|---|
| **E2E stdio** | `npm run test:mcp` | spawns `src/mcp/server.ts` via stdio | Every tool call against the real renderer. ~6s. |
| **E2E HTTP** | `npm run test:mcp:http` | spawns `src/mcp/server-http.ts` on a free port, connects via `StreamableHTTPClientTransport` | Same fixtures as stdio + downloads every signed URL. ~6s. |
| **Unit** | `npm run test:unit` | none | `signedToken`, `artifactStore`, `bearerAuth`, `refreshTokenStore` (issue/consume/rotate/revoke/prune + disk-persistence + hash-not-raw-token-at-rest). |

Reports land in:

- `tests/mcp/report/index.html` (stdio)
- `tests/mcp/report-http/index.html` (HTTP)

Open in a browser — each test is a card with request JSON, response JSON, and inline previews of PNG artifacts + open-file links for PDFs/HTML.

## Run a subset

```bash
npm run test:mcp -- 'render_template*'
```

The glob matches against fixture filenames. Other flags:

- `--verbose` / `-v` — print request + response to stdout
- `--no-report` — skip HTML report generation

## Run HTTP suite against an already-running server (e.g. production)

```bash
MCP_HTTP_URL=https://mcp.escapevelocity.consulting/mcp \
MCP_HTTP_BEARER_TOKEN=<prod token> \
  npm run test:mcp:http
```

Useful for smoke-testing prod after a deploy. The legacy bearer is still active for this purpose.

## Fixture format

Each fixture in `tests/mcp/fixtures/<NN>-<name>.json` describes one tool call + the expected response. The runner forwards `args` to the MCP tool and asserts against `expect`.

```jsonc
{
  "name": "human-readable label",          // shown in output
  "tool": "render_template",               // MCP tool name
  "args": {                                // forwarded as tool arguments
    "template": "social/og",
    "vars": { "TITLE": "Hello" },
    "outputPath": "{{TMP}}/og.png"         // {{TMP}} → os.tmpdir()
  },
  "expect": {
    "isError": false,                      // default false
    "structured": {                        // structuredContent assertions
      "bytes": { "min": 1000 },            // numeric range
      "mime": "image/png",                 // exact match
      "width": 1200,
      "path": { "isString": true }
    },
    "files": [                             // file system assertions
      {
        "path": "{{structured.path}}",     // refs into the response
        "exists": true,
        "minBytes": 1000
      }
    ]
  }
}
```

### Placeholders

- `{{TMP}}` — `os.tmpdir()` (replaced in args before the call).
- `{{structured.<key>}}` — only inside `expect.files[].path`, looked up after the call from `structuredContent`.

### Structured matchers

For each key in `expect.structured`:

| Form                          | Matches when                                     |
|-------------------------------|--------------------------------------------------|
| literal (string/number/bool)  | value === literal                                |
| `{ "min": N }` / `{ "max": N }` | value is a number in range                     |
| `{ "isString": true }`        | typeof value === 'string'                        |
| `{ "isArray": true, "minLength": N }` | Array, length ≥ N                        |

## Adding a test

Drop a JSON file in `tests/mcp/fixtures/` matching the schema above. The runner picks it up automatically. Convention: `<NN>-<tool>.<descriptor>.json`, e.g. `04-render_template.invoice-validation-error.json`.

For the publish flow specifically (`publish_artifact` / `unpublish_artifact` / `list_published`), fixtures are only meaningful on the HTTP suite — the publish-flow tools only register on HTTP transport. The stdio runner will skip them gracefully.

## Coverage gaps (known)

- **No automated tests for the publish flow itself** (V1 of the publish work deferred them — see the [publish-flow plan history](../CLAUDE.md#publishing)). The flow has been smoke-tested manually but not pinned by fixtures.
- **No tests for the OAuth callback path** — the `/authorize` → Google → `/oauth/google/callback` → `/token` flow is exercised only by Claude Desktop in production.
- **No load tests.** The warm `BrowserPool` should handle reasonable concurrency, but we haven't benchmarked.

## See also

- [`tests/mcp/README.md`](../tests/mcp/README.md) — pointer to this doc; harness lives at `tests/mcp/run.ts`
- [mcp-server.md](mcp-server.md) — the server under test
- [troubleshooting.md](troubleshooting.md) — log-driven diagnostics for production failures
