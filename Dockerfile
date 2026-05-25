# syntax=docker/dockerfile:1.7

# ─── Stage 1: build TypeScript + tokens.json ───────────────────────────────
# Use the Playwright image even at build so Chromium system deps are
# consistent across stages — no native-binary surprises between build & run.
FROM mcr.microsoft.com/playwright:v1.50.0-jammy AS build
WORKDIR /app

# Patch OS packages before building so CVE scanners don't flag unfixed vulns
# carried in from the base image (dirmngr, git, etc.).
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# Install all deps (incl. devDeps for tsc / tsx / build-tokens script).
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Bring in sources needed to compile + regenerate tokens.
COPY tsconfig.mcp.json ./
COPY tokens.ts ./
COPY scripts ./scripts
COPY src ./src

# Regenerate tokens.json (gitignored) from tokens.ts, then compile.
RUN npx tsx scripts/build-tokens.ts \
 && npx tsc -p tsconfig.mcp.json


# ─── Stage 2: runtime ──────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.50.0-jammy
WORKDIR /app

# Patch OS packages — clears dirmngr/git/related Ubuntu CVEs flagged by Trivy.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# Non-root user. Playwright's base image ships with `pwuser`, but creating our
# own keeps /app ownership clean and decouples from upstream changes.
RUN groupadd -r appgroup && useradd -r -g appgroup -d /app -s /usr/sbin/nologin appuser

# Production deps only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled core + MCP server.
COPY --from=build /app/dist        ./dist
# Generated tokens (tokens.css is committed; tokens.json is generated above).
COPY tokens.css                     ./tokens.css
COPY --from=build /app/tokens.json  ./tokens.json
COPY tokens.ts                      ./tokens.ts

# Brand assets needed at render time.
COPY templates                      ./templates
COPY fonts                          ./fonts
COPY components                     ./components

# Artifact store directory (matches MCP_TMP_DIR default below).
RUN mkdir -p /tmp/brand-mcp && chown -R appuser:appgroup /app /tmp/brand-mcp

USER appuser

EXPOSE 8080

# Liveness probe — admin's Caddy can hit this directly if desired.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

ENV NODE_ENV=production \
    MCP_PORT=8080 \
    MCP_BIND_HOST=0.0.0.0 \
    MCP_TMP_DIR=/tmp/brand-mcp

# Container expects these env vars at runtime (injected by the platform):
#   MCP_BEARER_TOKEN, MCP_SIGNING_SECRET, MCP_PUBLIC_BASE_URL
# Optional: MCP_ARTIFACT_TTL_SECONDS, MCP_CLEANUP_INTERVAL_SECONDS, MCP_ALLOWED_ORIGINS.

CMD ["node", "dist/src/mcp/server-http.js"]
