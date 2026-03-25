#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRAND_DIR="$(dirname "$SCRIPT_DIR")"
DEMO_DIR="$BRAND_DIR/demo"
WEBSITE_BRAND="$BRAND_DIR/../website/brand"

if [ ! -d "$DEMO_DIR" ]; then
  echo "Error: demo/ not found at $DEMO_DIR" >&2
  exit 1
fi

# Clean and recreate target
rm -rf "$WEBSITE_BRAND"
mkdir -p "$WEBSITE_BRAND"

# Copy HTML, CSS, previews, and assets
cp "$DEMO_DIR"/*.html "$WEBSITE_BRAND/"
cp "$DEMO_DIR"/*.css "$WEBSITE_BRAND/"
cp -r "$DEMO_DIR/previews" "$WEBSITE_BRAND/previews"
cp -r "$BRAND_DIR/assets" "$WEBSITE_BRAND/assets"

# Rewrite asset paths for website context
# tokens.css: ../tokens.css → ../styles/tokens.css
# fonts: ../../website/fonts/ → ../fonts/
# assets: ../assets/ → assets/ (now co-located)
for f in "$WEBSITE_BRAND"/*.html; do
  sed -i 's|href="\.\./tokens\.css"|href="../styles/tokens.css"|g' "$f"
  sed -i "s|../../website/fonts/|../fonts/|g" "$f"
  sed -i 's|\.\./assets/|assets/|g' "$f"
done

echo "Synced demo -> $WEBSITE_BRAND/"
