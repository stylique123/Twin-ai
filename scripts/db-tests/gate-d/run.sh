#!/usr/bin/env bash
# Gate-D local DB verification — ephemeral PostgreSQL 16, no network.
# Proves editor_create_source_asset behaviour + DB↔TS canonical-intent parity.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
WORK="$(mktemp -d)"
export PGHOST="$WORK/sock" PGUSER=postgres PGDATABASE=postgres
mkdir -p "$WORK/data" "$WORK/sock"

# initdb/postgres refuse to run as root; use the postgres system user if we are.
RUN=(); if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
  chown -R postgres:postgres "$WORK"; RUN=(runuser -u postgres --)
fi
cleanup() { "${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

"${RUN[@]}" "$PGBIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" \
  -o "-c unix_socket_directories=$WORK/sock -c listen_addresses=''" -l "$WORK/pg.log" start >/dev/null
for i in $(seq 1 30); do "$PGBIN/pg_isready" -q && break || sleep 0.3; done

psql -q -f "$HERE/00_schema_subset.sql"
psql -q -f "$HERE/01_canonical.sql"
psql -q -f "$HERE/02_create_rpc.sql"
echo "== create RPC scenarios =="
psql -f "$HERE/03_create_tests.sql"

echo "== DB<->TS canonical + sha parity =="
"$REPO/node_modules/.bin/esbuild" "$HERE/parity_driver.ts" --bundle --platform=node --format=esm --outfile="$WORK/driver.mjs" >/dev/null
node "$WORK/driver.mjs" > "$WORK/ts.json"
node "$HERE/parity_check.mjs" "$WORK/ts.json"
echo "GATE-D LOCAL VERIFICATION: PASS"
