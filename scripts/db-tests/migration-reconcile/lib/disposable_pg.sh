#!/usr/bin/env bash
# Disposable PostgreSQL cluster for migration-reconcile.
#
# Sourced, never executed. Provides an ephemeral, socket-only, network-less
# PostgreSQL 16 cluster in a temp dir. NOTHING here ever touches staging: the
# cluster listens on a unix socket inside $MR_WORK and is destroyed on exit.
#
# Follows the runuser -u postgres pattern from scripts/db-tests/gate-d/run.sh —
# initdb and postgres both refuse to run as root, and CI runs as root.

# Portable across macOS Bash 3.2 and Linux/CI. C locale + explicit UTF8 client
# encoding keeps catalog text (function bodies, expressions) byte-stable, which
# matters because the manifest hashes those bytes.
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8

mr_detect_pgbin() {
  if [ -z "${PGBIN:-}" ]; then
    for d in /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql@16/bin \
             /usr/local/opt/postgresql@16/bin \
             /Applications/Postgres.app/Contents/Versions/latest/bin; do
      [ -x "$d/initdb" ] && PGBIN="$d" && break
    done
    PGBIN="${PGBIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/bin/initdb)")}"
  fi
  export PGBIN
}

# pg_run: run a command as the postgres OS user when we are root.
MR_AS_PG=0
pg_run() { if [ "$MR_AS_PG" = "1" ]; then runuser -u postgres -- "$@"; else "$@"; fi; }

mr_pg_start() {
  mr_detect_pgbin
  MR_WORK="$(mktemp -d)"
  export MR_WORK
  export PGHOST="$MR_WORK/sock" PGUSER=postgres PGDATABASE=postgres
  # Scrub EVERY inherited libpq setting that could redirect a connection. The
  # expected-state build issues bare `psql -d <name>` calls that resolve their
  # target purely from this environment, so a stray PGHOSTADDR/PGSERVICEFILE in
  # the caller's shell must not be able to point them at a real server.
  unset PGPORT PGPASSWORD PGSERVICE PGSERVICEFILE PGHOSTADDR PGPASSFILE \
        PGSSLMODE PGREQUIRESSL PGCHANNELBINDING PGOPTIONS PGCONNECT_TIMEOUT
  mkdir -p "$MR_WORK/data" "$MR_WORK/sock"
  if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
    chown -R postgres:postgres "$MR_WORK"; MR_AS_PG=1
  fi
  pg_run "$PGBIN/initdb" -D "$MR_WORK/data" -U postgres --auth=trust --locale=C --encoding=UTF8 >/dev/null
  # listen_addresses='' — the disposable cluster has NO network surface at all.
  pg_run "$PGBIN/pg_ctl" -D "$MR_WORK/data" \
    -o "-c unix_socket_directories=$MR_WORK/sock -c listen_addresses=''" \
    -l "$MR_WORK/pg.log" start >/dev/null
  local i
  for i in $(seq 1 40); do "$PGBIN/pg_isready" -q && break || sleep 0.3; done
  "$PGBIN/pg_isready" -q || { echo "FATAL: disposable postgres did not start"; cat "$MR_WORK/pg.log"; return 1; }
}

mr_pg_stop() {
  [ -n "${MR_WORK:-}" ] || return 0
  pg_run "$PGBIN/pg_ctl" -D "$MR_WORK/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$MR_WORK"
}

# A local DSN for a database in the disposable cluster. Socket-only: it can never
# resolve to a remote host even if something later mishandles it.
mr_dsn() { printf 'postgresql:///%s?host=%s&user=postgres' "$1" "$PGHOST"; }
