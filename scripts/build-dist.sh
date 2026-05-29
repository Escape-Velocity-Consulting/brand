#!/usr/bin/env bash
# Full Brand Distribution build: tokens → assets → site → kit.
# Produces dist/site/ (Brand Site) and dist/brand-kit.zip (Brand Kit),
# and copies the kit zip into dist/site/ so it ships with the site.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRAND_DIR="$(dirname "$SCRIPT_DIR")"
DIST_SITE="$BRAND_DIR/dist/site"
KIT_ZIP="$BRAND_DIR/dist/brand-kit.zip"

cd "$BRAND_DIR"

# 1. Tokens (cheap, always run)
npm run build:tokens

# 2. Assets (rasters + document previews). Slow — Playwright renders.
npm run build:assets

# 3. Claude skill — must run before build:site, which shadow-copies
#    dist/escape-velocity-brand.skill into dist/site/ for the download link.
npm run build:skill

# 4. Brand Site
npm run build:site

# 5. Brand Kit (depends on tokens, assets, previews, dist/site/)
npm run build:kit

# 6. Ship the kit alongside the site
if [ -f "$KIT_ZIP" ]; then
  cp "$KIT_ZIP" "$DIST_SITE/brand-kit.zip"
  echo "Copied kit zip into dist/site/brand-kit.zip"
fi

echo "Brand Distribution built: $DIST_SITE/ (+ $KIT_ZIP)"
