#!/usr/bin/env bash
# Hostile tests for the migration-reconcile guard, against a LOCAL postgres.
#
# The guard's whole value is that it refuses to repair a ledger when the installed
# definitions do not match the committed migrations. A guard that cannot fail is worse
# than no guard, so each case below breaks something and asserts the comparison REJECTS.
# Mirrors the Gate-D mutation-control discipline.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export PATH=/usr/lib/postgresql/16/bin:$PATH
WORK=$(mktemp -d); chmod 777 "$WORK"
# initdb/postgres refuse to run as root; drop to the postgres user exactly as Gate-D does.
AS_PG=0; [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1 && AS_PG=1
pg_run(){ if [ "$AS_PG" = "1" ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
trap 'pg_run pg_ctl -D "$WORK/pg" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
pg_run initdb -D "$WORK/pg" -U postgres --auth=trust --locale=C --encoding=UTF8 >/dev/null
pg_run pg_ctl -D "$WORK/pg" -o "-p 5599 -k $WORK -c listen_addresses=''" -l "$WORK/log" start >/dev/null
export PGURL="postgresql://postgres@/postgres?host=$WORK&port=5599"
psql "$PGURL" -qc 'create schema if not exists public' >/dev/null

fp() { psql "$PGURL" -qAtX -f "$HERE/fingerprint.sql"; }
h()  { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

# Each case rebuilds the fixture from scratch. An earlier version chained mutate/restore
# pairs, and a single restore that silently failed poisoned every later case — the control
# caught it. Independent fixtures remove that whole class.
build_fixture() {
  psql "$PGURL" -q <<'SQL' >/dev/null 2>&1
drop table if exists public.source_capture_intents cascade;
drop table if exists public.source_capture_manifests cascade;
drop table if exists public.source_script_snapshots cascade;
create table public.source_capture_intents (id uuid primary key, owner_id uuid not null, generation_id uuid);
create table public.source_capture_manifests (id uuid primary key, owner_id uuid not null);
create table public.source_script_snapshots (id uuid primary key, owner_id uuid not null);
alter table public.source_capture_intents enable row level security;
create policy "sci read" on public.source_capture_intents for select to public using (true);
create or replace function public.editor_capture_no_mutate() returns trigger language plpgsql as $$
begin raise exception 'capture_row_immutable'; end $$;
create trigger sci_guard before update on public.source_capture_intents
  for each row execute function public.editor_capture_no_mutate();
SQL
}

fp() { psql "$PGURL" -qAtX -f "$HERE/fingerprint.sql"; }
h()  { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

build_fixture
BASE="$(fp)"; BH="$(h "$BASE")"
pass=0; fail=0

# Each case: fresh fixture -> mutate -> the fingerprint MUST change (repair blocked).
check() {
  local name="$1" sql="$2"
  build_fixture
  psql "$PGURL" -q -c "$sql" >/dev/null 2>&1 || true
  if [ "$(h "$(fp)")" != "$BH" ]; then echo "  PASS  $name"; pass=$((pass+1))
  else echo "  FAIL  $name — fingerprint UNCHANGED; the guard would let a mismatch through"; fail=$((fail+1)); fi
}

echo "== hostile: each mutation MUST change the fingerprint (i.e. block repair) =="
check "changed function body detected" "create or replace function public.editor_capture_no_mutate() returns trigger language plpgsql as \$\$ begin return new; end \$\$;"
check "dropped policy detected"        "drop policy \"sci read\" on public.source_capture_intents;"
check "RLS disabled detected"          "alter table public.source_capture_intents disable row level security;"
check "dropped trigger detected"       "drop trigger sci_guard on public.source_capture_intents;"
check "added grant detected"           "grant select on public.source_capture_intents to public;"
check "added column detected"          "alter table public.source_script_snapshots add column stray text;"
check "added index detected"           "create index stray_ix on public.source_capture_manifests(owner_id);"
check "added constraint detected"      "alter table public.source_capture_manifests add constraint stray_ck check (owner_id is not null);"
check "dropped TABLE detected"         "drop table public.source_capture_manifests cascade;"

echo
echo "== control: an UNMUTATED fresh fixture matches baseline =="
build_fixture
if [ "$(h "$(fp)")" = "$BH" ]; then
  echo "  PASS  clean fixture matches (the comparison is not permanently sticky)"; pass=$((pass+1))
else
  echo "  FAIL  clean fixture does NOT match — comparison would false-positive forever"; fail=$((fail+1))
fi

echo
echo "migration-reconcile hostile: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
