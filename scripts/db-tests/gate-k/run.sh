#!/usr/bin/env bash
# Gate-K — ephemeral-Postgres verification of 0107's clip RPCs.
#
# The rules, in order of what they cost when broken:
#
#   1. CONVERGENCE. A creator retries a screen capture constantly — the picker
#      is cancelled, the wrong window is shared, the tab is refreshed. The same
#      attempt must return the SAME asset, not mint a second row.
#   2. A DIFFERENT recording under the same attempt id is refused, rather than
#      silently handed the first one's path to upload over.
#   3. The generation must be the caller's, proven from the row.
#   4. finalize is IDEMPOTENT and goes straight to `ready` — a clip is never
#      put through the source validator, which enforces properties of a take.
#   5. A size that does not match what was agreed at create is refused.
set -euo pipefail
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
M6="$REPO/supabase/migrations/0106_clips_and_reference_requirements.sql"
M7="$REPO/supabase/migrations/0107_clip_asset_rpcs.sql"
for f in "$M6" "$M7"; do [ -f "$f" ] || { echo "FATAL: $f not found"; exit 1; }; done

if [ -z "${PGBIN:-}" ]; then
  for d in /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql@16/bin; do
    [ -x "$d/initdb" ] && PGBIN="$d" && break
  done
  PGBIN="${PGBIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/bin/initdb)")}"
fi
WORK="$(mktemp -d)"; export PGHOST="$WORK/sock" PGUSER=postgres PGDATABASE=postgres
mkdir -p "$WORK/data" "$WORK/sock"
AS_PG=0
if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then chown -R postgres:postgres "$WORK"; AS_PG=1; fi
pg_run(){ if [ "$AS_PG" = "1" ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
cleanup(){ pg_run "$PGBIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
pg_run "$PGBIN/initdb" -D "$WORK/data" -U postgres --auth=trust --locale=C --encoding=UTF8 >/dev/null
pg_run "$PGBIN/pg_ctl" -D "$WORK/data" -o "-c unix_socket_directories=$WORK/sock -c listen_addresses=''" -l "$WORK/pg.log" start >/dev/null
for _ in $(seq 1 30); do "$PGBIN/pg_isready" -q && break || sleep 0.3; done

O='22222222-2222-2222-2222-222222222222'
O2='33333333-3333-3333-3333-333333333333'
G='44444444-4444-4444-4444-444444444444'
A1='55555555-5555-5555-5555-555555555555'
A2='66666666-6666-6666-6666-666666666666'

psql -q -v ON_ERROR_STOP=1 <<SQL
create extension if not exists pgcrypto;
-- The roles 0107's grants name. Absent in a bare cluster, and their absence
-- would fail the migration for a reason that has nothing to do with the RPCs.
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end \$\$;
create schema auth;
create table auth.users (id uuid primary key);
insert into auth.users values ('$O'), ('$O2');
create table public.generations (id uuid primary key, user_id uuid references auth.users(id));
insert into public.generations values ('$G', '$O');
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid references public.generations(id) on delete set null,
  kind text not null check (kind in ('source','music','output','thumbnail')),
  recording_attempt_id uuid,
  bucket text not null,
  storage_path text not null unique,
  mime_type text, size_bytes bigint,
  status text not null default 'uploading'
    check (status in ('uploading','validating','ready','rejected','deleted')),
  validation_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  constraint media_assets_source_needs_attempt
    check (kind <> 'source' or recording_attempt_id is not null)
);
create unique index media_assets_attempt_uniq
  on public.media_assets (owner_id, generation_id, recording_attempt_id)
  where recording_attempt_id is not null;
create table public.gallery_items (
  id uuid primary key default gen_random_uuid(), owner_id uuid,
  platform text not null, url text not null, niche text not null);
SQL

psql -q -v ON_ERROR_STOP=1 -f "$M6"
psql -q -v ON_ERROR_STOP=1 -f "$M7"
echo "0106 + 0107 applied"

run(){ psql -q -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; }
ok(){ if run "$1"; then echo "  ok: $2"; else echo "GATE-K FAIL: legitimate call REJECTED ($2)"; psql -c "$1" 2>&1|tail -3; exit 1; fi; }
no(){ if run "$1"; then echo "GATE-K FAIL: forbidden call ACCEPTED ($2)"; exit 1; else echo "  rejected: $2"; fi; }
eq(){ local got; got="$(psql -tAc "$1"|tr -d '[:space:]')"; if [ "$got" != "$2" ]; then
  echo "GATE-K FAIL: $3 — expected '$2', got '$got'"; exit 1; else echo "  ok: $3"; fi; }
mk(){ echo "select * from public.editor_create_clip_asset('$1'::uuid,'$2'::uuid,'$3'::uuid,'$4','$5',$6,$7)"; }

echo "== 1. a first clip"
ok "$(mk $O $G $A1 takes video/webm 500000 "'the settings page'")" "creating a clip"
eq "select count(*) from public.media_assets where kind='clip'" "1" "exactly one row"
eq "select clip_label from public.media_assets where kind='clip'" "thesettingspage" "the label is stored"
eq "select left(storage_path, 36) from public.media_assets where kind='clip'" "$O" \
   "the OWNER leads the path (the takes read policy authorizes on the first folder)"

echo "== 2. CONVERGENCE — the retry case this exists for"
ok "$(mk $O $G $A1 takes video/webm 500000 "'the settings page'")" "the SAME attempt again"
eq "select count(*) from public.media_assets where kind='clip'" "1" \
   "still exactly one row — the retry converged rather than minting a second"
eq "select created from public.editor_create_clip_asset('$O'::uuid,'$G'::uuid,'$A1'::uuid,'takes','video/webm',500000,null)" \
   "f" "and it reports created=false, so the caller knows it converged"

echo "== 3. a DIFFERENT recording under the same attempt is refused"
no "$(mk $O $G $A1 takes video/webm 900000 null)" "a different SIZE on a used attempt"
no "$(mk $O $G $A1 takes video/mp4 500000 null)" "a different MIME on a used attempt"

echo "== 4. ownership is proven from the row, not claimed"
no "$(mk $O2 $G $A2 takes video/webm 500000 null)" "another owner's generation"

echo "== 5. the policy floor and ceiling"
no "$(mk $O $G $A2 takes video/webm 100 null)" "a sub-2KB file — a cancelled picker, not a recording"
no "$(mk $O $G $A2 takes video/webm 700000000 null)" "past the size ceiling"
no "$(mk $O $G $A2 edits video/webm 500000 null)" "a bucket that is not takes"
no "$(mk $O $G $A2 takes video/quicktime 500000 null)" "a mime outside the closed list"

echo "== 6. finalize goes straight to ready, and is idempotent"
CID=$(psql -tAc "select id from public.media_assets where kind='clip'"|tr -d '[:space:]')
ok "select public.editor_finalize_clip('$O'::uuid,'$CID'::uuid,500000)" "finalizing"
eq "select status from public.media_assets where id='$CID'" "ready" \
   "READY, not validating — a clip is never put through the source validator"
ok "select public.editor_finalize_clip('$O'::uuid,'$CID'::uuid,500000)" "finalizing AGAIN (a retried response)"
eq "select count(*) from public.media_assets where id='$CID' and status='ready'" "1" "still one ready row"

echo "== 7. finalize refuses what it cannot vouch for"
no "select public.editor_finalize_clip('$O2'::uuid,'$CID'::uuid,500000)" "another owner finalizing it"
ok "$(mk $O $G $A2 takes video/webm 123456 null)" "a second clip to test size against"
CID2=$(psql -tAc "select id from public.media_assets where recording_attempt_id='$A2'"|tr -d '[:space:]')
no "select public.editor_finalize_clip('$O'::uuid,'$CID2'::uuid,999999)" \
   "a size that is not the size agreed at create"
ok "select public.editor_finalize_clip('$O'::uuid,'$CID2'::uuid,123456)" "the agreed size"

echo "== 8. MUTATION CONTROL: drop the attempt index and convergence breaks"
psql -q -c "drop index public.media_assets_attempt_uniq" >/dev/null
psql -q -v ON_ERROR_STOP=1 -c "delete from public.media_assets" >/dev/null
psql -q -v ON_ERROR_STOP=1 -c "$(mk $O $G $A1 takes video/webm 500000 null)" >/dev/null
psql -q -v ON_ERROR_STOP=1 -c "$(mk $O $G $A1 takes video/webm 500000 null)" >/dev/null
# The RPC's own SELECT still converges even without the index, which is the
# point: the index is the RACE guard, the SELECT is the ordinary-path guard.
# Losing the index must not silently double rows on the ordinary path either.
eq "select count(*) from public.media_assets where kind='clip'" "1" \
   "MUTATION CONTROL — the RPC's own convergence check holds without the index"

echo "GATE-K PASS"
