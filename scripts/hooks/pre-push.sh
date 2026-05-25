#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HOOK_DIR/../.." && pwd)"
cd "$REPO_ROOT"

if [[ "${SKIP_TRIVY:-}" == "1" ]]; then
  echo "[pre-push] SKIP_TRIVY=1 — skipping Trivy scan."
  exit 0
fi

ZERO="0000000000000000000000000000000000000000"

# MCP-relevant path globs (mirrors .github/workflows/deploy-mcp.yml triggers).
# Lines are bash regex anchored at start of path.
MCP_PATTERNS=(
  '^src/'
  '^templates/'
  '^fonts/'
  '^components/'
  '^tokens\.ts$'
  '^tokens\.css$'
  '^package\.json$'
  '^package-lock\.json$'
  '^tsconfig\.mcp\.json$'
  '^scripts/build-tokens\.ts$'
  '^Dockerfile$'
  '^\.dockerignore$'
  '^\.github/workflows/deploy-mcp\.yml$'
)

matches_mcp() {
  local file="$1"
  for pat in "${MCP_PATTERNS[@]}"; do
    if [[ "$file" =~ $pat ]]; then
      return 0
    fi
  done
  return 1
}

# Collect changed files across all refs being pushed.
changed_files=""
while read -r local_ref local_sha remote_ref remote_sha; do
  if [[ -z "${local_sha:-}" || "$local_sha" == "$ZERO" ]]; then
    continue  # branch delete
  fi
  if [[ -z "${remote_sha:-}" || "$remote_sha" == "$ZERO" ]]; then
    # New branch on remote — compare against origin/main if available, else just list everything in the commit.
    if git rev-parse --verify origin/main >/dev/null 2>&1; then
      range_files=$(git diff --name-only "origin/main..$local_sha" || true)
    else
      range_files=$(git diff-tree --no-commit-id --name-only -r "$local_sha" || true)
    fi
  else
    range_files=$(git diff --name-only "$remote_sha..$local_sha" || true)
  fi
  changed_files+="$range_files"$'\n'
done

# Dedupe and filter.
unique_files=$(printf '%s' "$changed_files" | sort -u | sed '/^$/d')

if [[ -z "$unique_files" ]]; then
  echo "[pre-push] No changed files detected — skipping Trivy scan."
  exit 0
fi

mcp_hit=0
while IFS= read -r f; do
  if matches_mcp "$f"; then
    mcp_hit=1
    break
  fi
done <<< "$unique_files"

if [[ "$mcp_hit" -eq 0 ]]; then
  echo "[pre-push] No MCP-relevant changes — skipping Trivy scan."
  exit 0
fi

echo "[pre-push] MCP-relevant changes detected — running Trivy filesystem scan…"
exec bash "$HOOK_DIR/trivy-fs.sh"
