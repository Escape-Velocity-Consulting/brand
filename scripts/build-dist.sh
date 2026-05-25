#!/usr/bin/env bash
# Build the Brand Distribution.
# Output: brand/dist/site/ — fully self-contained, serve at /brand/ with any static server.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRAND_DIR="$(dirname "$SCRIPT_DIR")"
DIST_SITE="$BRAND_DIR/dist/site"

cd "$BRAND_DIR"

# 1. Regenerate tokens (tokens.css + tokens.json)
npm run build:tokens

# 2. Render the Brand Site
rm -rf "$DIST_SITE"
./node_modules/.bin/eleventy --config=site/.eleventy.cjs --input=site

# 3. Copy CSS + non-site assets into dist/site/
#    (11ty passthrough is finicky; doing it here keeps the dist build deterministic.)
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

echo "Built: $DIST_SITE/"
