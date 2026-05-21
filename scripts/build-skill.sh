#!/usr/bin/env bash
# build-skill.sh — Package brand-engine into a self-contained .skill file
#
# Usage:
#   cd brand && npm run build:skill
#
# Output:
#   dist/brand-engine.skill (~2MB ZIP containing everything except node_modules)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGE_DIR="$BRAND_DIR/dist/.stage/brand-engine"
DIST_DIR="$BRAND_DIR/dist"

# ── 1. Clean staging ─────────────────────────────────────────────────────────

rm -rf "$BRAND_DIR/dist/.stage"
mkdir -p "$STAGE_DIR"

# ── 2. Copy skill core ───────────────────────────────────────────────────────

cp "$BRAND_DIR/skill/brand-engine/SKILL.md" "$STAGE_DIR/"
cp "$BRAND_DIR/skill/brand-engine/setup.sh" "$STAGE_DIR/"
cp "$BRAND_DIR/package.json" "$STAGE_DIR/"
cp "$BRAND_DIR/tsconfig.json" "$STAGE_DIR/"
cp "$BRAND_DIR/tokens.ts" "$STAGE_DIR/"
cp "$BRAND_DIR/tokens.css" "$STAGE_DIR/"

echo "  Copied skill core files"

# ── 3. Generators ────────────────────────────────────────────────────────────

mkdir -p "$STAGE_DIR/generators"
cp "$BRAND_DIR/generators/"*.ts "$STAGE_DIR/generators/"

echo "  Copied generators"

# ── 4. Scripts ────────────────────────────────────────────────────────────────

mkdir -p "$STAGE_DIR/scripts"
cp "$BRAND_DIR/scripts/export-assets.ts" "$STAGE_DIR/scripts/"
cp "$BRAND_DIR/scripts/build-tokens.ts" "$STAGE_DIR/scripts/"

echo "  Copied scripts"

# ── 5. Templates ─────────────────────────────────────────────────────────────

mkdir -p "$STAGE_DIR/templates/social"
mkdir -p "$STAGE_DIR/templates/carousel"
cp "$BRAND_DIR/templates/"*.html "$STAGE_DIR/templates/"
cp "$BRAND_DIR/templates/social/"*.html "$STAGE_DIR/templates/social/"
cp "$BRAND_DIR/templates/carousel/"*.html "$STAGE_DIR/templates/carousel/"

echo "  Copied templates"

# ── 6. Logos ──────────────────────────────────────────────────────────────────

mkdir -p "$STAGE_DIR/assets/logos"
cp "$BRAND_DIR/assets/logos/"*.svg "$STAGE_DIR/assets/logos/"

echo "  Copied logos"

# ── 7. Fonts (self-contained) ────────────────────────────────────────────────

mkdir -p "$STAGE_DIR/fonts"
cp "$BRAND_DIR/../website/fonts/"*.woff2 "$STAGE_DIR/fonts/"

echo "  Copied fonts"

# ── 8. References ────────────────────────────────────────────────────────────

mkdir -p "$STAGE_DIR/references"
cp "$BRAND_DIR/BRAND_SKILL.md" "$STAGE_DIR/references/brand-reference.md"
cp "$BRAND_DIR/AGENT_GUIDE.md" "$STAGE_DIR/references/agent-guide.md"

echo "  Copied references"

# ── 9. Package as .skill (ZIP) ───────────────────────────────────────────────

mkdir -p "$DIST_DIR"
cd "$BRAND_DIR/dist/.stage"
rm -f "$DIST_DIR/brand-engine.skill"

# Use Python's zipfile (forward-slash separators, per ZIP spec).
# PowerShell's Compress-Archive writes backslashes, which Claude's skill installer rejects.
WIN_DEST=$(cygpath -w "$DIST_DIR/brand-engine.skill" 2>/dev/null || echo "$DIST_DIR/brand-engine.skill")
python -c "
import os, zipfile
src = 'brand-engine'
dest = r'$WIN_DEST'
with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        for f in files:
            full = os.path.join(root, f)
            arc = full.replace(os.sep, '/')
            z.write(full, arc)
"

# ── 10. Cleanup & report ─────────────────────────────────────────────────────

rm -rf "$BRAND_DIR/dist/.stage"

SIZE=$(du -h "$DIST_DIR/brand-engine.skill" | cut -f1)
echo ""
echo "Built: dist/brand-engine.skill ($SIZE)"
