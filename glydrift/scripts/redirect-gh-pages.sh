#!/usr/bin/env bash
# THE SWITCH: replace the old GitHub Pages copy (27eydes-blip.github.io/Cheats/glydrift/) with a
# redirect to https://glydrift.com. Run only once glydrift.com is live and tested.
# (seasons.json stays here too, for installed copies that still read it.)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(git rev-parse --show-toplevel)"
WT="$(mktemp -d)"
git -C "$ROOT" fetch origin gh-pages
git -C "$ROOT" worktree add "$WT" origin/gh-pages --detach
rm -rf "$WT/glydrift"
mkdir -p "$WT/glydrift"
cp redirect/index.html redirect/sw.js public/seasons.json "$WT/glydrift/"
git -C "$WT" add -A glydrift
git -C "$WT" commit -m "Glydrift: the old address now redirects to https://glydrift.com" || echo "nothing to publish"
git -C "$WT" push origin HEAD:gh-pages
git -C "$ROOT" worktree remove "$WT" --force
echo "https://27eydes-blip.github.io/Cheats/glydrift/ now redirects to https://glydrift.com/"
