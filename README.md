# Escape Velocity — Brand System

The Escape Velocity brand repo. Tokens, templates, generators, and the infrastructure that ships them across four outputs:

| Output | What | Where |
|---|---|---|
| **Brand Site** | Multi-page reference at `/brand/` (overview, identity, components, documents, social, presentations, decks, workflow, download, press) | `escapevelocity.consulting/brand/` (live) · `localhost:3000/brand/` (dev) |
| **Brand Kit** | Downloadable ZIP for designers, partners, press (logos, fonts, tokens, brand guide PDF, press boilerplate) | `escapevelocity.consulting/brand/brand-kit.zip` |
| **Brand Skill** | Claude skill teaching the design system + tool routing | `dist/escape-velocity-brand.skill` (installed locally per Claude client) |
| **Brand MCP** | Streamable-HTTP MCP server with 9 render + publish tools, OAuth-gated | `https://mcp.escapevelocity.consulting/mcp` |

Single source of truth: [`BRAND_SPEC.md`](BRAND_SPEC.md). Operational details: [`docs/`](docs/). Agent-facing rules + nav: [`CLAUDE.md`](CLAUDE.md).

## Quickstart

```bash
# Dev loop — Brand Site at localhost:3000/brand/ with live reload
npm install
npm run dev

# Full publishable build — tokens → assets → site → kit
npm run build:dist

# Render a deck from markdown (CLI shim)
npm run pres -- previews/decks/my-deck.md --pdf --png

# Run the MCP server locally (stdio)
npm run mcp
```

## Where to go next

- **[`docs/README.md`](docs/README.md)** — full documentation index with role-based reading paths
- **[`docs/architecture.md`](docs/architecture.md)** — the system at a glance
- **[`docs/rules.md`](docs/rules.md)** — the 5 mandates that govern the repo
- **[`CLAUDE.md`](CLAUDE.md)** — agent operational reference

## Repository layout

See [`CLAUDE.md` § Repository layout](CLAUDE.md#repository-layout) for the tree.

## License

Brand assets under `assets/`, `fonts/`, `press/`, and `web/` are governed by [`press/LICENSE.txt`](press/LICENSE.txt) (also shipped at the root of the Brand Kit). Fonts retain their original licenses under [`fonts/LICENSES/`](fonts/LICENSES/) (SIL OFL + per-family copyrights).

Source code is internal — not currently licensed for public use.

## Contact

Tommi Enenkel · tommi@escapevelocity.consulting · [escapevelocity.consulting](https://escapevelocity.consulting)
