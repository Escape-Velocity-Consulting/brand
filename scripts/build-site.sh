#!/usr/bin/env bash
# Build the Brand Site into dist/site/ (self-contained, ready to serve at /brand/).
# Does NOT regenerate tokens or assets — those are separate build steps.
# Run `npm run build:tokens` and `npm run build:assets` first if their inputs changed.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRAND_DIR="$(dirname "$SCRIPT_DIR")"
DIST_SITE="$BRAND_DIR/dist/site"

cd "$BRAND_DIR"

# Regenerate tooling page data from templates.meta.ts
./node_modules/.bin/tsx "$BRAND_DIR/scripts/gen-tooling-data.ts"

# Render the Brand Site
rm -rf "$DIST_SITE"
./node_modules/.bin/eleventy --config=site/.eleventy.cjs --input=site

# Copy CSS + non-site assets into dist/site/
cp "$BRAND_DIR/site/site.css"  "$DIST_SITE/site.css"
cp "$BRAND_DIR/site/print.css" "$DIST_SITE/print.css"
cp "$BRAND_DIR/tokens.css"     "$DIST_SITE/tokens.css"
cp -r "$BRAND_DIR/assets"      "$DIST_SITE/assets"

if   [ -d "$BRAND_DIR/fonts" ];          then cp -r "$BRAND_DIR/fonts" "$DIST_SITE/fonts"
elif [ -d "$BRAND_DIR/../website/fonts" ]; then cp -r "$BRAND_DIR/../website/fonts" "$DIST_SITE/fonts"
else echo "Warning: no fonts/ at brand/fonts/ or website/fonts/" >&2
fi

# Document previews
[ -d "$BRAND_DIR/previews" ] && cp -r "$BRAND_DIR/previews" "$DIST_SITE/previews"

# Press assets consumed by site/press.njk. eleventy already created dist/site/press/
# (for the rendered press/index.html), so merge files into it rather than copying
# the whole dir (which would nest as dist/site/press/press/).
if [ -d "$BRAND_DIR/press" ]; then
  mkdir -p "$DIST_SITE/press"
  [ -f "$BRAND_DIR/press/boilerplate.md" ] && cp "$BRAND_DIR/press/boilerplate.md" "$DIST_SITE/press/"
  [ -d "$BRAND_DIR/press/photos" ] && cp -r "$BRAND_DIR/press/photos" "$DIST_SITE/press/photos"
fi

# Brand Kit zip (so the /brand/download/ button works during dev too).
# build:dist regenerates this from scratch; here we just shadow-copy whatever
# was last produced by build:kit so dev iterations don't 404.
if [ -f "$BRAND_DIR/dist/brand-kit.zip" ]; then
  cp "$BRAND_DIR/dist/brand-kit.zip" "$DIST_SITE/brand-kit.zip"
fi

# Claude skill (so the /brand/escape-velocity-brand.skill download link works).
# build:skill regenerates this; shadow-copy if it exists.
if [ -f "$BRAND_DIR/dist/escape-velocity-brand.skill" ]; then
  cp "$BRAND_DIR/dist/escape-velocity-brand.skill" "$DIST_SITE/escape-velocity-brand.skill"
fi

echo "Built: $DIST_SITE/"
