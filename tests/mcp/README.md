# MCP end-to-end tests

Data-driven test harness for the brand-engine MCP server. Each fixture in
`fixtures/` is a JSON file describing one tool call + the expected response.
The runner spawns the server over stdio, calls every fixture, and reports
PASS/FAIL.

## Run

```bash
npm run test:mcp
```

Runs every fixture in `fixtures/`. Exit code 0 on success, 1 on any failure.

After the run, an HTML report is written to `tests/mcp/report/index.html` —
open it in a browser to see each test as a card with:
- request JSON
- response JSON
- inline previews of PNG artifacts + open-file links for PDFs/HTML/etc.

Artifacts are copied into `tests/mcp/report/artifacts/<test-id>/` so the report
is self-contained and openable from `file://` without cross-origin issues.

To run a subset, pass a glob:

```bash
npm run test:mcp -- 'render_image*'
```

Other flags:
- `--verbose` / `-v` — also print request + response to stdout.
- `--no-report` — skip HTML report generation.

## Fixture format

```jsonc
{
  "name": "human-readable label",          // shown in output
  "tool": "render_image",                  // MCP tool name
  "args": {                                // forwarded as tool arguments
    "template": "templates/social/og.html",
    "preset": "og",
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
- `{{structured.<key>}}` — only inside `expect.files[].path`, looked up after
  the call from `structuredContent`.

### Structured matchers

For each key in `expect.structured`:

| Form                          | Matches when                                     |
|-------------------------------|--------------------------------------------------|
| literal (string/number/bool)  | value === literal                                |
| `{ "min": N }` / `{ "max": N }` | value is a number in range                     |
| `{ "isString": true }`        | typeof value === 'string'                        |
| `{ "isArray": true, "minLength": N }` | Array, length ≥ N                        |
| `{ "matches": "regex" }`      | string matches regex                             |

### File assertions

```jsonc
{ "path": "<abs path>", "exists": true, "minBytes": 100 }
{ "path": "<abs path>", "exists": false }
```

## Adding a test

1. Drop a new `.json` file into `fixtures/`. Name it after the tool + scenario,
   e.g. `render_carousel.linkedin-portrait.json`.
2. Run `npm run test:mcp`.
3. Iterate.

The runner does not clean up generated files in `{{TMP}}` — useful for visually
inspecting renders after a test run.
