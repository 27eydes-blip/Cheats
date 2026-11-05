#!/usr/bin/env bash
# © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE.
# Publish the built game to this repo's gh-pages branch.
#   PAGES_SUBDIR=glydrift (default): under /glydrift, next to the other games (the Cheats repo)
#   PAGES_SUBDIR=.                 : at the root of the site (Glydrift's own repo)
# Usage: cd glydrift && npm run deploy:pages
set -euo pipefail
cd "$(dirname "$0")/.."
SUB="${PAGES_SUBDIR:-glydrift}"
npm run build
ROOT="$(git rev-parse --show-toplevel)"
WT="$(mktemp -d)"
if git -C "$ROOT" fetch origin gh-pages 2>/dev/null; then
  git -C "$ROOT" worktree add "$WT" origin/gh-pages --detach
else
  # first publish in a new repo: start an empty gh-pages branch
  git -C "$ROOT" worktree add --detach "$WT"
  git -C "$WT" checkout --orphan gh-pages-new
  git -C "$WT" rm -rq --cached . && find "$WT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
fi
if [ "$SUB" = "." ]; then
  # the whole site is Glydrift: replace everything except git's own file
  find "$WT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  cp -R dist/. "$WT/"
  touch "$WT/.nojekyll"
  git -C "$WT" add -A .
else
  rm -rf "${WT:?}/$SUB"
  mkdir -p "$WT/$SUB"
  cp -R dist/. "$WT/$SUB/"
  git -C "$WT" add "$SUB"
fi
git -C "$WT" commit -m "Glydrift: publish $(git -C "$ROOT" rev-parse --short HEAD)" || echo "nothing to publish"
git -C "$WT" push origin HEAD:gh-pages
git -C "$ROOT" worktree remove "$WT" --force
# owner/name from https://github.com/owner/name(.git) or git@github.com:owner/name(.git)
OWNER_REPO="$(git -C "$ROOT" remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')"
OWNER="${OWNER_REPO%%/*}"; NAME="${OWNER_REPO##*/}"
PATH_PART="$NAME/"; [ "$SUB" = "." ] || PATH_PART="$NAME/$SUB/"
echo "Live at https://${OWNER,,}.github.io/${PATH_PART}"
