#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_NAME="${KANSOKU_SITE_PROJECT:-kansoku-site}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-de7ecb0eaa0a328071255d557a6adb66}"

if [[ -z "${GITHUB_TOKEN:-}" ]] && command -v gh >/dev/null 2>&1; then
  GITHUB_TOKEN="$(gh auth token 2>/dev/null || true)"
  export GITHUB_TOKEN
fi
if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "warning: no GITHUB_TOKEN and gh not authenticated; release fetch may hit the anonymous rate limit" >&2
fi

pnpm --filter @kansoku/site build

if command -v wrangler >/dev/null 2>&1; then
  WRANGLER=(wrangler)
else
  WRANGLER=(npx --yes wrangler)
fi

"${WRANGLER[@]}" pages deploy apps/site/dist \
  --project-name "$PROJECT_NAME" \
  --branch main \
  --commit-dirty=true
