#!/usr/bin/env bash
# Publish the built game to the gh-pages branch under /glydrift (like the other games).
# Usage: cd glydrift && npm run deploy:pages
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
ROOT="$(git rev-parse --show-toplevel)"
WT="$(mktemp -d)"
git -C "$ROOT" fetch origin gh-pages
git -C "$ROOT" worktree add "$WT" origin/gh-pages --detach
rm -rf "$WT/glydrift"
mkdir -p "$WT/glydrift"
cp -R dist/. "$WT/glydrift/"
git -C "$WT" add glydrift
git -C "$WT" commit -m "Glydrift: publish $(git -C "$ROOT" rev-parse --short HEAD)" || echo "nothing to publish"
git -C "$WT" push origin HEAD:gh-pages
git -C "$ROOT" worktree remove "$WT" --force
echo "Live at https://27eydes-blip.github.io/Cheats/glydrift/"
