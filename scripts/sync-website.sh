#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRAND_DIR="$(dirname "$SCRIPT_DIR")"
WEBSITE_STYLES="$BRAND_DIR/../website/styles"

if [ ! -d "$WEBSITE_STYLES" ]; then
  echo "Error: website/styles/ not found at $WEBSITE_STYLES" >&2
  exit 1
fi

cp "$BRAND_DIR/tokens.css" "$WEBSITE_STYLES/tokens.css"
echo "Synced tokens.css -> $WEBSITE_STYLES/tokens.css"
