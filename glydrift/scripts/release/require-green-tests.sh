#!/usr/bin/env bash
# Release gate: succeeds only if the "Glydrift tests" GitHub Actions workflow
# (.github/workflows/glydrift.yml — Chromium, Firefox and WebKit × 7 devices, screenshots included)
# has passed for one exact commit.
#
#   bash scripts/release/require-green-tests.sh <commit-sha> [--wait MINUTES]
#
# --wait: keep checking (every 30 s) while the tests are still running, up to MINUTES.
# Used by .github/workflows/glydrift-release.yml (before it starts Codemagic) and again by
# codemagic.yaml (before it builds), so no build can skip the tests.
#
# Env: GLYDRIFT_REPO (owner/name, default 27eydes-blip/Cheats)
#      GLYDRIFT_TESTS_WORKFLOW (default glydrift.yml)
#      GITHUB_TOKEN (optional for a public repo; required if the repo is private)
set -euo pipefail

SHA="${1:?usage: require-green-tests.sh <commit-sha> [--wait MINUTES]}"
WAIT_MIN=0
if [ "${2:-}" = "--wait" ]; then WAIT_MIN="${3:?--wait needs a number of minutes}"; fi
REPO="${GLYDRIFT_REPO:-27eydes-blip/Cheats}"
WORKFLOW="${GLYDRIFT_TESTS_WORKFLOW:-glydrift.yml}"
URL="https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?head_sha=${SHA}&per_page=50"
AUTH=()
if [ -n "${GITHUB_TOKEN:-}" ]; then AUTH=(-H "Authorization: Bearer ${GITHUB_TOKEN}"); fi

deadline=$(( $(date +%s) + WAIT_MIN * 60 ))
echo "Checking '${WORKFLOW}' runs for ${REPO}@${SHA:0:12} …"
while :; do
  body=$(curl -fsSL "${AUTH[@]}" -H "Accept: application/vnd.github+json" "$URL") || body=""
  # prints: <state> <details>   state = pass | fail | running | none | error
  verdict=$(printf '%s' "$body" | python3 -c '
import json, sys
try:
    runs = json.load(sys.stdin)["workflow_runs"]
except Exception:
    print("error could not read the GitHub API response"); sys.exit()
if not runs:
    print("none no test run found for this commit"); sys.exit()
ok = [r for r in runs if r["status"] == "completed" and r["conclusion"] == "success"]
busy = [r for r in runs if r["status"] != "completed"]
if ok:
    print("pass", ok[0]["html_url"])
elif busy:
    print("running", busy[0]["html_url"])
else:
    print("fail", ", ".join("%s: %s" % (r["conclusion"], r["html_url"]) for r in runs))
')
  [ -n "$verdict" ] || verdict="error the result check itself failed"
  state=${verdict%% *}; details=${verdict#* }
  case "$state" in
    pass) echo "✅ All Glydrift tests passed for this commit: $details"; exit 0 ;;
    fail) echo "❌ Glydrift tests did not pass for this commit — not building. $details"; exit 1 ;;
  esac
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "❌ Gave up waiting ($state): $details"
    if [ "$state" = "none" ]; then
      echo "   The test workflow only runs when a push changes files under glydrift/."
      echo "   Push a commit that touches glydrift/ to the release branch so the tests run."
    fi
    exit 1
  fi
  echo "… $state ($details) — checking again in 30 s"
  sleep 30
done
