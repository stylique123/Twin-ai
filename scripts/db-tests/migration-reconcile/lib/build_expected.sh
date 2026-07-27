#!/usr/bin/env bash
# Build the EXPECTED state for migrations 0090-0093 in an ISOLATED, DISPOSABLE
# database, and derive the ownership ledger from it.
#
# THE SAFETY PROPERTY THAT KILLED THE PREVIOUS GUARD: expected state is built by
# applying the committed migrations HERE, in a throwaway cluster with no network
# surface, and NEVER by re-applying anything to staging. Staging is only ever READ.
#
# Sourced by reconcile.sh and hostile/run.sh. Requires lib/disposable_pg.sh to
# have been sourced and mr_pg_start to have run.
#
#   mr_build_expected <dbname>
#     -> creates <dbname>, applies prelude, censuses BEFORE, applies 0090..0093
#        byte-exactly, censuses AFTER, writes $MR_WORK/ledger.json

MR_MIGRATIONS="0090_editor_capture_intent
0091_editor_capture_hardening
0092_editor_director_decision_v2
0093_editor_capture_retention_cascade"

# Mirror Supabase's database-level search_path (pgcrypto lives in `extensions`).
# Per-database settings are NOT copied by CREATE DATABASE ... TEMPLATE, so clones
# must call this too or they would resolve digest() differently from the original.
mr_set_db_search_path() {
  psql -q -v ON_ERROR_STOP=1 -d postgres \
    -c "alter database \"$1\" set search_path = pg_catalog, public, extensions"
}

mr_build_expected() {
  local db="$1"
  local here="$MR_HERE"
  local repo="$MR_REPO"

  createdb "$db"
  psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/sql/00_prelude.sql"

  # BEFORE census: everything that exists because of the PRELUDE, i.e. everything
  # 0090-0093 do NOT own.
  psql -tAX -v ON_ERROR_STOP=1 -d "$db" -f "$here/sql/10_catalog_census.sql" > "$MR_WORK/census_before.json"

  # Apply the committed migrations BYTE-EXACTLY. No -c wrappers, no sed, no
  # extraction: the file on disk is the input, so what we verify against staging
  # is literally what is committed.
  local m
  for m in $MR_MIGRATIONS; do
    local f="$repo/supabase/migrations/$m.sql"
    [ -f "$f" ] || { echo "FATAL: missing committed migration $f"; return 1; }
    psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$f" || {
      echo "FATAL: committed migration $m failed to apply to the disposable database"; return 1; }
  done

  psql -tAX -v ON_ERROR_STOP=1 -d "$db" -f "$here/sql/10_catalog_census.sql" > "$MR_WORK/census_after.json"

  # Derive the ownership ledger: AFTER minus BEFORE, plus absence assertions
  # parsed from the migrations' own DROP statements.
  node "$here/lib/ledger.mjs" \
    --before "$MR_WORK/census_before.json" \
    --after  "$MR_WORK/census_after.json" \
    --migrations-dir "$repo/supabase/migrations" \
    --versions "$(echo "$MR_MIGRATIONS" | tr '\n' ',')" \
    --out "$MR_WORK/ledger.json"
}
