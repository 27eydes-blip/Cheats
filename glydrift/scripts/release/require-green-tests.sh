#!/usr/bin/env bash
# © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE.
#
# Release gate: succeeds only if the "Glydrift tests" GitHub Actions workflow
# (.github/workflows/glydrift.yml) really ran and passed for one exact commit:
# every browser job ("Tests (chromium|firefox|webkit)") and the "Server checks" job concluded
# "success". A run whose jobs were skipped doesn't count, even though GitHub calls it a success.
#
#   bash scripts/release/require-green-tests.sh <commit-sha> [--wait MINUTES]
#
# --wait: keep checking (every 30 s) while the tests are still running, up to MINUTES.
# Used by .github/workflows/glydrift-release.yml (before it starts Codemagic) and again by
# codemagic.yaml (before it builds), so no build can skip the tests.
#
# Env: GLYDRIFT_REPO (owner/name, default 27eydes-blip/Cheats)
#      GLYDRIFT_TESTS_WORKFLOW (default glydrift.yml)
#      GITHUB_TOKEN or GH_ACTIONS_READ_TOKEN: needed once the repo is private. In GitHub Actions
#      it's the workflow's own token. In Codemagic it's a secret variable in the
#      glydrift_signing group (a fine-grained token with read-only "Actions" access to this
#      one repo). Never put a token in the code.
set -euo pipefail
SHA="${1:?usage: require-green-tests.sh <commit-sha> [--wait MINUTES]}"
WAIT_MIN=0
if [ "${2:-}" = "--wait" ]; then WAIT_MIN="${3:?--wait needs a number of minutes}"; fi
export SHA WAIT_MIN
exec python3 -I - <<'PY'
import json, os, sys, time, urllib.error, urllib.request

SHA, WAIT = os.environ["SHA"], int(os.environ["WAIT_MIN"])
REPO = os.environ.get("GLYDRIFT_REPO") or "27eydes-blip/Cheats"
WORKFLOW = os.environ.get("GLYDRIFT_TESTS_WORKFLOW") or "glydrift.yml"
TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_ACTIONS_READ_TOKEN") or ""
REQUIRED = {"Tests (chromium)", "Tests (firefox)", "Tests (webkit)", "Server checks (Supabase rules)"}
API = "https://api.github.com/repos/" + REPO


class Denied(Exception):
    pass


def get(path):
    req = urllib.request.Request(API + path, headers={"Accept": "application/vnd.github+json"})
    if TOKEN:
        req.add_header("Authorization", "Bearer " + TOKEN)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 404):
            raise Denied(e.code)
        raise


def verdict():
    """('pass'|'fail'|'running'|'none', details)"""
    runs = get(f"/actions/workflows/{WORKFLOW}/runs?head_sha={SHA}&per_page=50")["workflow_runs"]
    if not runs:
        return "none", "no test run found for this commit"
    busy, bad = [], []
    for r in runs:
        if r["status"] != "completed":
            busy.append(r["html_url"])
            continue
        jobs = get(f"/actions/runs/{r['id']}/jobs?per_page=100")["jobs"]
        result = {j["name"]: j["conclusion"] for j in jobs}
        missing = sorted(n for n in REQUIRED if result.get(n) != "success")
        if not missing:
            return "pass", r["html_url"]
        bad.append(f"{r['html_url']} ({', '.join(f'{n}: {result.get(n) or 'did not run'}' for n in missing)})")
    if busy:
        return "running", busy[0]
    return "fail", "; ".join(bad)


print(f"Checking '{WORKFLOW}' runs for {REPO}@{SHA[:12]} …", flush=True)
deadline = time.time() + WAIT * 60
while True:
    try:
        state, details = verdict()
    except Denied as e:
        if not TOKEN:
            print(f"❌ GitHub said {e}: the repo is private (or renamed) and no token was given.")
            print(f"   Add GH_ACTIONS_READ_TOKEN (read-only Actions access to {REPO}) — see PRIVATE_REPO_PLAN.md.")
        else:
            print(f"❌ GitHub said {e}: the token can't read Actions on {REPO} (expired, or wrong repo).")
        sys.exit(1)
    except Exception as e:  # network trouble or a GitHub hiccup: retry while waiting
        state, details = "error", f"couldn't reach GitHub ({e})"
    if state == "pass":
        print(f"✅ All Glydrift tests passed for this commit: {details}")
        sys.exit(0)
    if state == "fail":
        print(f"❌ Glydrift tests did not all pass for this commit — not building. {details}")
        sys.exit(1)
    if time.time() >= deadline:
        print(f"❌ Gave up waiting ({state}): {details}")
        if state == "none":
            print("   The test workflow only runs when a push changes files under glydrift/.")
            print("   Push a commit that touches glydrift/ to the release branch so the tests run.")
        sys.exit(1)
    print(f"… {state} ({details}) — checking again in 30 s", flush=True)
    time.sleep(30)
PY
