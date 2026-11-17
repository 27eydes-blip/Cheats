#!/usr/bin/env bash
# Nightly crash digest (read-only, no AI): the last 24 hours of crash_reports, summarised as
# Markdown on stdout. Needs GLYDRIFT_READONLY_DB_URL (a connection string for the read-only role
# from supabase/admin/nightly_readonly_role.sql, stored as a GitHub secret). Without it: says so
# and exits 0, so the nightly sweep goes on quietly.
set -uo pipefail
if [ -z "${GLYDRIFT_READONLY_DB_URL:-}" ]; then
  echo "_Crash digest skipped: no read-only database secret set._"
  exit 0
fi
q() {
  PGCONNECT_TIMEOUT=20 psql "$GLYDRIFT_READONLY_DB_URL" -X -q -A -F ' | ' -P footer=off \
    -v ON_ERROR_STOP=1 -c "set default_transaction_read_only = on; $1" 2>&1
}
total=$(q "select count(*) from public.crash_reports where created_at > now() - interval '24 hours'" | tail -1)
if ! [[ "$total" =~ ^[0-9]+$ ]]; then
  echo "_Crash digest unavailable: the database didn't answer (${total:0:200})._"
  exit 0
fi
echo "### Crash reports, last 24 hours: $total"
[ "$total" = 0 ] && exit 0
echo
echo "Most common (kind · message · how many · builds):"
echo '```'
q "select kind, left(coalesce(message, ''), 120), count(*), string_agg(distinct coalesce(build, '?'), ', ')
     from public.crash_reports where created_at > now() - interval '24 hours'
    group by 1, 2 order by 3 desc limit 10"
echo '```'
echo "By browser and device (top 5):"
echo '```'
q "select left(coalesce(browser, '?'), 60), left(coalesce(device, '?'), 60), count(*)
     from public.crash_reports where created_at > now() - interval '24 hours'
    group by 1, 2 order by 3 desc limit 5"
echo '```'
