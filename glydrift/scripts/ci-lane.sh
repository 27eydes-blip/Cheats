#!/usr/bin/env bash
# Glydrift CI: which test lane a push needs. Prints "lane=<none|fast|full>" and "reason=<…>"
# (GitHub Actions appends them to $GITHUB_OUTPUT). Run from the repository root.
#
#   none  only docs changed (README, *.md, docs/, marketing/): no tests, nothing to publish
#   fast  a small change (text, colours, one hero, one bug fix): the smoke suite on iPhone
#         Safari (WebKit) and Chromium, in parallel
#   full  everything else: the whole suite on all three browsers and every device profile
#
# How it decides, in order:
#   1. the nightly run, or a run started by hand with lane=full/fast: that lane
#   2. anything touching purchases, accounts, saving or the leaderboard: ALWAYS full
#      (even with [fast] in the commit message)
#   3. [full] or [fast] in the newest commit message: that lane
#   4. only docs: none
#   5. gameplay, levels, obstacles, realms, music, the build, the tests or CI itself, a merge
#      that combines two lines of work, more than 15 files, or an unknown base: full
#   6. otherwise: fast
#
# Inputs (environment): EVENT (push | pull_request | schedule | workflow_dispatch),
# BASE (the commit this push is compared with: the branch's previous head, or the pull
# request's base), MSG (the newest commit message), DISPATCH_LANE (auto | fast | full).
set -uo pipefail
H="${HEAD_REF:-HEAD}" # the commit being judged (HEAD in CI)

say() {
  echo "lane=$1"
  echo "reason=$2"
  exit 0
}

[ "${EVENT:-}" = "schedule" ] && say full "nightly check of the live version"
if [ "${EVENT:-}" = "workflow_dispatch" ] && [ "${DISPATCH_LANE:-auto}" != "auto" ]; then
  say "$DISPATCH_LANE" "chosen by hand"
fi

base="${BASE:-}"
if [ -z "$base" ] || [[ "$base" =~ ^0+$ ]] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  # a new branch: compare with what's live (the release branch) instead
  base=$(git merge-base "$H" "origin/${LIVE_BRANCH:-claude/glydrift-arcade-game-7hznpc}" 2>/dev/null || echo "")
  [ -n "$base" ] || say full "no earlier commit to compare with"
fi
files=$(git diff --name-only "$base" "$H" -- glydrift .github/workflows/glydrift.yml .github/actions/glydrift-setup)
[ -n "$files" ] || say none "no game files changed"
count=$(printf '%s\n' "$files" | wc -l | tr -d ' ')

# 2. purchases, accounts, saving and the leaderboard always get the full suite
PROTECTED='^glydrift/(src/online/|src/data/(save|passPlus|plusGate|driftPass|founding|progression)\.js|supabase/|ios-plugin/|ios/|capacitor\.config\.json)'
hit=$(printf '%s\n' "$files" | grep -E "$PROTECTED" | head -3 | tr '\n' ' ')
[ -n "$hit" ] && say full "touches purchases, accounts, saving or the leaderboard: ${hit}"

# 3. the owner's choice in the commit message
case "${MSG:-}" in
  *"[full]"*) say full "[full] in the commit message" ;;
  *"[fast]"*) say fast "[fast] in the commit message" ;;
esac

# 4. docs only
DOCS='(\.md$|^glydrift/docs/|^glydrift/marketing/|^glydrift/LICENSE)'
if ! printf '%s\n' "$files" | grep -vqE "$DOCS"; then
  say none "docs only ($count files)"
fi

# 5. big changes
BIG='^(\.github/|glydrift/(src/(scenes/GameScene\.js|levels/|obstacles/|biomes/|audio/music|config\.js|tuning\.js|main\.js)|public/music/|package(-lock)?\.json|vite\.config|playwright\.config|index\.html|tests/(e2e/helpers|e2e/levelBot|serve|summary-reporter)|scripts/))'
hit=$(printf '%s\n' "$files" | grep -E "$BIG" | head -3 | tr '\n' ' ')
[ -n "$hit" ] && say full "gameplay, levels, music, build, tests or CI changed: ${hit}"
if [ "$(git rev-list --parents -n 1 "$H" | wc -w)" -gt 2 ]; then
  # a merge whose first parent also moved on since the branches split combines two lines of work
  mb=$(git merge-base "$H^1" "$H^2" 2>/dev/null || echo "")
  if [ -n "$mb" ] && [ -n "$(git diff --name-only "$mb" "$H^1" -- glydrift)" ]; then
    say full "a merge that combines two lines of work"
  fi
fi
[ "$count" -gt 15 ] && say full "$count files changed"

say fast "small change ($count files)"
