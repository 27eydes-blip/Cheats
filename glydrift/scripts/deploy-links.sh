#!/usr/bin/env bash
# Publish only the link-in-bio page (glydrift/links → gh-pages /links). The game is untouched.
# Usage: cd glydrift && bash scripts/deploy-links.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(git rev-parse --show-toplevel)"
WT="$(mktemp -d)"
git -C "$ROOT" fetch origin gh-pages
git -C "$ROOT" worktree add "$WT" origin/gh-pages --detach
rm -rf "$WT/links"
mkdir -p "$WT/links"
cp -R links/. "$WT/links/"
git -C "$WT" add links
git -C "$WT" commit -m "Glydrift links page: publish $(git -C "$ROOT" rev-parse --short HEAD)" || echo "nothing to publish"
git -C "$WT" push origin HEAD:gh-pages
git -C "$ROOT" worktree remove "$WT" --force
echo "Live at https://27eydes-blip.github.io/Cheats/links/"
