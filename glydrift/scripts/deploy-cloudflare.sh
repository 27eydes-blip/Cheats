#!/usr/bin/env bash
# © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE.
# Publish the built game to Cloudflare Pages (option B in PRIVATE_REPO_PLAN.md). It works with
# a private repo, and is called by the deploy job only after every test has passed.
# Needs CLOUDFLARE_API_TOKEN (Pages: Edit) and CLOUDFLARE_ACCOUNT_ID, as GitHub secrets.
# Project name: CLOUDFLARE_PAGES_PROJECT (default "glydrift") → https://glydrift.pages.dev
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CLOUDFLARE_API_TOKEN:?add the CLOUDFLARE_API_TOKEN secret (PRIVATE_REPO_PLAN.md, option B)}"
: "${CLOUDFLARE_ACCOUNT_ID:?add the CLOUDFLARE_ACCOUNT_ID secret (PRIVATE_REPO_PLAN.md, option B)}"
PROJECT="${CLOUDFLARE_PAGES_PROJECT:-glydrift}"
npm run build
npx --yes wrangler@4.157.0 pages deploy dist --project-name "$PROJECT" --branch main \
  --commit-hash "$(git rev-parse HEAD)" --commit-dirty=true
echo "Live at https://${PROJECT}.pages.dev/"
