#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

if ! command -v trivy >/dev/null 2>&1; then
  echo "trivy not installed — install with 'scoop install trivy' or 'winget install AquaSecurity.Trivy'."
  echo "Set SKIP_TRIVY=1 to bypass this check."
  exit 1
fi

trivy fs \
  --scanners vuln \
  --severity HIGH,CRITICAL \
  --ignore-unfixed \
  --ignorefile .trivyignore \
  --exit-code 1 \
  .
