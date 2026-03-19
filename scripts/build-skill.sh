#!/usr/bin/env bash
# build-skill.sh — Compile brand-engine.skill from source
#
# What it does:
#   1. Copies BRAND_SKILL.md and AGENT_GUIDE.md into skill/brand-engine/references/
#   2. Validates that SKILL.md is not a placeholder
#   3. Runs package_skill.py to produce dist/brand-engine.skill
#
# Usage:
#   cd brand && npm run build:skill
#
# Requirements:
#   skill-creator must be installed. Expected at:
#     ~/.claude/plugins/*/skill-creator/scripts/package_skill.py
#   OR at the hardcoded fallback:
#     /sessions/loving-trusting-tesla/mnt/.skills/skills/skill-creator/scripts/package_skill.py

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_DIR="$BRAND_DIR/skill/brand-engine"
REFS_DIR="$SKILL_DIR/references"
DIST_DIR="$BRAND_DIR/dist"

# ── 1. Locate skill-creator ───────────────────────────────────────────────────

# Try common locations in order
SKILL_CREATOR_DIR=""

# Option A: Cowork plugin cache (current machine pattern)
COWORK_CANDIDATE=$(find /sessions/loving-trusting-tesla/mnt/.skills/skills/skill-creator \
  -name "package_skill.py" -maxdepth 3 2>/dev/null | head -1)
if [ -n "$COWORK_CANDIDATE" ]; then
  SKILL_CREATOR_DIR="$(dirname "$(dirname "$COWORK_CANDIDATE")")"
fi

# Option B: user home plugins
if [ -z "$SKILL_CREATOR_DIR" ]; then
  HOME_CANDIDATE=$(find ~/.claude/plugins -name "package_skill.py" -maxdepth 6 2>/dev/null | head -1)
  if [ -n "$HOME_CANDIDATE" ]; then
    SKILL_CREATOR_DIR="$(dirname "$(dirname "$HOME_CANDIDATE")")"
  fi
fi

if [ -z "$SKILL_CREATOR_DIR" ]; then
  echo ""
  echo "❌  Cannot find package_skill.py."
  echo ""
  echo "    The skill-creator plugin is required to build .skill files."
  echo "    Install it in Cowork, then re-run: cd brand && npm run build:skill"
  echo ""
  echo "    Expected locations searched:"
  echo "      /sessions/loving-trusting-tesla/mnt/.skills/skills/skill-creator/"
  echo "      ~/.claude/plugins/**/skill-creator/"
  echo ""
  exit 1
fi

echo "✓  skill-creator found at: $SKILL_CREATOR_DIR"

# ── 2. Validate SKILL.md ──────────────────────────────────────────────────────

SKILL_MD="$SKILL_DIR/SKILL.md"
if [ ! -f "$SKILL_MD" ]; then
  echo "❌  SKILL.md not found at $SKILL_MD"
  exit 1
fi

# Reject placeholder (must have YAML frontmatter with name:)
if ! grep -q "^name:" "$SKILL_MD"; then
  echo "❌  SKILL.md looks like a placeholder — missing 'name:' in frontmatter."
  echo "    Edit $SKILL_MD before packaging."
  exit 1
fi

echo "✓  SKILL.md validated"

# ── 3. Copy reference files into references/ ─────────────────────────────────

mkdir -p "$REFS_DIR"

cp "$BRAND_DIR/BRAND_SKILL.md"  "$REFS_DIR/brand-reference.md"
cp "$BRAND_DIR/AGENT_GUIDE.md"  "$REFS_DIR/agent-guide.md"

echo "✓  References copied:"
echo "     BRAND_SKILL.md  → references/brand-reference.md"
echo "     AGENT_GUIDE.md  → references/agent-guide.md"

# ── 4. Run packager ───────────────────────────────────────────────────────────

mkdir -p "$DIST_DIR"

echo "📦  Packaging skill…"

cd "$SKILL_CREATOR_DIR"
python -m scripts.package_skill "$SKILL_DIR" "$DIST_DIR"

# ── 5. Report ─────────────────────────────────────────────────────────────────

OUTPUT="$DIST_DIR/brand-engine.skill"
if [ -f "$OUTPUT" ]; then
  SIZE=$(du -h "$OUTPUT" | cut -f1)
  echo ""
  echo "✅  Built: dist/brand-engine.skill ($SIZE)"
  echo ""
  echo "    Install in Cowork: Settings → Plugins → Install from file"
  echo ""
else
  echo ""
  echo "⚠️   Packager ran but dist/brand-engine.skill not found."
  echo "    Check output above for errors."
  echo ""
  exit 1
fi
