#!/usr/bin/env bash
# build-skill.sh — Package escape-velocity-brand into a thin guidance .skill file
#
# Usage:
#   cd brand && npm run build:skill
#
# Output:
#   dist/escape-velocity-brand.skill (~20–50KB ZIP — SKILL.md + reference sidecar only)
#
# Phase 3 redesign: the skill no longer ships generators, templates, fonts,
# tokens, or a setup.sh bootstrap. All rendering is delegated to the brand-mcp
# MCP server (https://mcp.escapevelocity.consulting/mcp), registered once per
# workstation. The skill ships only:
#   - SKILL.md (workflow guidance, mental model, tool reference)
#   - references/brand-reference.md (token table, CSS vars, design patterns)
# This keeps the skill light and lets it author on-brand HTML even when the
# MCP isn't registered (graceful degradation).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGE_DIR="$BRAND_DIR/dist/.stage/escape-velocity-brand"
DIST_DIR="$BRAND_DIR/dist"

# ── 1. Clean staging ─────────────────────────────────────────────────────────

rm -rf "$BRAND_DIR/dist/.stage"
mkdir -p "$STAGE_DIR"

# ── 2. SKILL.md ──────────────────────────────────────────────────────────────

cp "$BRAND_DIR/skill/escape-velocity-brand/SKILL.md" "$STAGE_DIR/"
echo "  Copied SKILL.md"

# ── 3. Reference sidecar ─────────────────────────────────────────────────────

mkdir -p "$STAGE_DIR/references"
cp "$BRAND_DIR/BRAND_SKILL.md" "$STAGE_DIR/references/brand-reference.md"
echo "  Copied brand reference"

# ── 4. Package as .skill (ZIP) ───────────────────────────────────────────────

mkdir -p "$DIST_DIR"
cd "$BRAND_DIR/dist/.stage"
rm -f "$DIST_DIR/escape-velocity-brand.skill"

# Use Python's zipfile (forward-slash separators per ZIP spec).
WIN_DEST=$(cygpath -w "$DIST_DIR/escape-velocity-brand.skill" 2>/dev/null || echo "$DIST_DIR/escape-velocity-brand.skill")
python -c "
import os, zipfile
src = 'escape-velocity-brand'
dest = r'$WIN_DEST'
with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        for f in files:
            full = os.path.join(root, f)
            arc = full.replace(os.sep, '/')
            z.write(full, arc)
"

# ── 5. Cleanup & report ──────────────────────────────────────────────────────

rm -rf "$BRAND_DIR/dist/.stage"

SIZE=$(du -h "$DIST_DIR/escape-velocity-brand.skill" | cut -f1)
echo ""
echo "Built: dist/escape-velocity-brand.skill ($SIZE)"
