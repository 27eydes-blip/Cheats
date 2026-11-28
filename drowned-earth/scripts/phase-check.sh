#!/usr/bin/env bash
# Per-phase gate: build, data, boat/weapons/controller tests, route performance. Writes a summary.
# usage: scripts/phase-check.sh <label> <outdir>
cd "$(dirname "$0")/.."
L=$1; O=$2; mkdir -p "$O"
ok=1
npx vite build --outDir "$O/build" > "$O/$L-build.log" 2>&1 && echo "build PASS" || { echo "build FAIL"; ok=0; }
node scripts/validate-data.mjs > "$O/$L-validate.log" 2>&1 && echo "validate PASS" || { echo "validate FAIL"; ok=0; }
for t in boat-test weapons-test controller-test portage-test raft-collision-test npc-traits-test npc-life-test; do
  timeout 1500 node scripts/$t.mjs > "$O/$L-$t.log" 2>&1 && echo "$t PASS ($(grep -c '^PASS' "$O/$L-$t.log") checks)" || { echo "$t FAIL: $(grep -E '^FAIL|ERRORS' "$O/$L-$t.log" | head -3 | tr '\n' ' ')"; ok=0; }
done
timeout 1500 node scripts/route-perf.mjs > "$O/$L-route.json" 2>&1 && echo "route-perf ran" || { echo "route-perf FAIL"; ok=0; }
node -e "const t=require('fs').readFileSync('$O/$L-route.json','utf8');const j=JSON.parse(t.slice(t.indexOf('{'),t.lastIndexOf('}')+1));for(const[k,v]of Object.entries(j.stats))console.log(k.padEnd(12),'calls',v.calls,'tris',v.tris,'shaders',v.shaderCompiles,'worst',v.worstMs+'ms','avgFps',v.avgFps)" 2>/dev/null
[ $ok = 1 ] && echo "ALL PASS" || echo "SOMETHING FAILED"
