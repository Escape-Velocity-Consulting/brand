#!/usr/bin/env bash
# build-skill.sh — Package escape-velocity-brand into a self-sufficient .skill bundle
#
# Usage:
#   cd brand && npm run build:skill
#
# Output:
#   dist/escape-velocity-brand.skill (~570 KB ZIP)
#
# Architecture: the skill is the primary on-brand asset creator. It ships
# templates, tokens, fonts, logos, the brand reference, the canonical spec,
# the website-prototyping web kit, and the press boilerplate — everything
# needed to author any brand asset offline. The escape-velocity-brand MCP
# server (https://mcp.escapevelocity.consulting/mcp) is an OPTIONAL extension
# that adds Playwright-based pixel rendering (HTML → PNG/PDF) and server-side
# publishing. When the MCP is unavailable, the skill still authors finished
# HTML from the canonical templates and hands it to the user.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGE_DIR="$BRAND_DIR/dist/.stage/escape-velocity-brand"
DIST_DIR="$BRAND_DIR/dist"

cd "$BRAND_DIR"

# ── 0a. Ensure tokens.json exists (gitignored; must be rebuilt from tokens.ts) ─

npx tsx scripts/build-tokens.ts
echo "  Rebuilt tokens.css + tokens.json"

# ── 0b. Regenerate auto-managed sections in SKILL.md ────────────────────────
#
# build-skill-catalog.ts reads templates.meta.ts and replaces the catalog +
# routing blocks in the source SKILL.md in place. Edit-in-place so the diff
# is committed alongside registry changes (drift visible in PRs).

npx tsx scripts/build-skill-catalog.ts
echo "  Refreshed catalog + routing in SKILL.md"

# ── 1. Clean staging ─────────────────────────────────────────────────────────

rm -rf "$BRAND_DIR/dist/.stage"
mkdir -p "$STAGE_DIR"

# ── 2. SKILL.md ──────────────────────────────────────────────────────────────

cp "$BRAND_DIR/skill/escape-velocity-brand/SKILL.md" "$STAGE_DIR/"
echo "  Copied SKILL.md"

# ── 3. References ────────────────────────────────────────────────────────────

mkdir -p "$STAGE_DIR/references"
cp "$BRAND_DIR/BRAND_SKILL.md" "$STAGE_DIR/references/brand-reference.md"
cp "$BRAND_DIR/BRAND_SPEC.md"  "$STAGE_DIR/references/brand-spec.md"
npx tsx scripts/build-skill-catalog.ts --emit-json "$STAGE_DIR/references/templates.meta.json"
echo "  Copied references (brand-reference, brand-spec, templates.meta.json)"

# ── 4. Tokens ────────────────────────────────────────────────────────────────

mkdir -p "$STAGE_DIR/tokens"
cp "$BRAND_DIR/tokens.css"  "$STAGE_DIR/tokens/tokens.css"
cp "$BRAND_DIR/tokens.json" "$STAGE_DIR/tokens/tokens.json"
echo "  Copied tokens (css + json)"

# ── 5. Templates ─────────────────────────────────────────────────────────────

cp -R "$BRAND_DIR/templates" "$STAGE_DIR/templates"
echo "  Copied templates ($(find "$STAGE_DIR/templates" -name '*.html' | wc -l) files)"

# ── 6. Fonts ─────────────────────────────────────────────────────────────────

cp -R "$BRAND_DIR/fonts" "$STAGE_DIR/fonts"
echo "  Copied fonts ($(find "$STAGE_DIR/fonts" -name '*.woff2' | wc -l) woff2 files)"

# ── 7. Logo SVGs ─────────────────────────────────────────────────────────────

mkdir -p "$STAGE_DIR/assets"
cp -R "$BRAND_DIR/assets/logos" "$STAGE_DIR/assets/logos"
echo "  Copied logo SVGs ($(find "$STAGE_DIR/assets/logos" -name '*.svg' | wc -l) files)"

# ── 8. Portable components ───────────────────────────────────────────────────

cp -R "$BRAND_DIR/components" "$STAGE_DIR/components"
echo "  Copied components"

# ── 9. Brand Kit web bundle (for website prototypes) ─────────────────────────

mkdir -p "$STAGE_DIR/web"
cp "$BRAND_DIR/web/starter.html" "$STAGE_DIR/web/starter.html"
cp "$BRAND_DIR/web/README.md"    "$STAGE_DIR/web/README.md"
cp "$BRAND_DIR/site/site.css"    "$STAGE_DIR/web/site.css"
cp "$BRAND_DIR/site/print.css"   "$STAGE_DIR/web/print.css"
echo "  Copied web bundle (starter + brand site CSS)"

# ── 10. Press boilerplate ────────────────────────────────────────────────────

mkdir -p "$STAGE_DIR/press"
cp "$BRAND_DIR/press/boilerplate.md" "$STAGE_DIR/press/boilerplate.md"
echo "  Copied press boilerplate"

# ── 11. Package as .skill (ZIP) ──────────────────────────────────────────────

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

# ── 12. Cleanup & report ─────────────────────────────────────────────────────

rm -rf "$BRAND_DIR/dist/.stage"

SIZE=$(du -h "$DIST_DIR/escape-velocity-brand.skill" | cut -f1)
echo ""
echo "Built: dist/escape-velocity-brand.skill ($SIZE)"
