#!/usr/bin/env bash
# Runs every migration in order on a fresh Postgres database, then
# the row-level security tests. Usage: supabase/tests/run.sh <database url>
set -euo pipefail
db="$1"
here="$(cd "$(dirname "$0")" && pwd)"
psql() { command psql "$db" -v ON_ERROR_STOP=1 -q "$@"; }
psql -f "$here/stub.sql"
for file in "$here"/../migrations/*.sql; do
  # pg_cron and pg_net come from the stub; plain Postgres cannot install them.
  sed -E '/create extension if not exists (pg_net|pg_cron)/d' "$file" | psql -f - >/dev/null 2>&1 || {
    echo "Migratie mislukt: $(basename "$file")"
    sed -E '/create extension if not exists (pg_net|pg_cron)/d' "$file" | psql -f -
    exit 1
  }
done
psql -f "$here/rls.sql"
psql -f "$here/flows_server.sql"
echo "Databasetests geslaagd"
