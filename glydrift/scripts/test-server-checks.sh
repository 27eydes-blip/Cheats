#!/usr/bin/env bash
# © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE.
#
# Server-side rules test: applies every migration in supabase/migrations to a brand-new,
# throwaway PostgreSQL database and attacks it the way a cheater with the public key would
# (supabase/tests/server_checks.test.sql). It never touches the real Supabase project.
#
#   npm run test:server
#
# Needs a local PostgreSQL server. PGHOST / PGPORT / PGUSER pick it, as for psql. The test
# creates and drops a database called glydrift_server_test.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=glydrift_server_test
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true' EXIT
run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" "$@" >/dev/null 2>&1; }
run -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do
  run -f "$f" || { echo "❌ migration failed: $f"; psql -v ON_ERROR_STOP=1 -d "$DB" -f "$f" | tail -5; exit 1; }
done
run -f supabase/migrations/"$(ls supabase/migrations | tail -1)" || { echo "❌ newest migration can't be re-run"; exit 1; }
out=$(psql -q -d "$DB" -f supabase/tests/server_checks.test.sql 2>&1)
echo "$out" | grep -E "PASS|FAIL" | sed 's/^ *//'
fails=$(psql -Atq -d "$DB" -c "select count(*) from t.results where not ok")
total=$(psql -Atq -d "$DB" -c "select count(*) from t.results")
if echo "$out" | grep -q "ERROR"; then echo "$out" | grep ERROR; exit 1; fi
[ "$fails" = "0" ] && [ "$total" -gt 0 ] || { echo "❌ $fails of $total server checks failed"; exit 1; }
echo "✅ all $total server checks passed"
