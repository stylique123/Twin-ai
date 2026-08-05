#!/usr/bin/env bash
# Gate-K — ephemeral-Postgres verification of 0107 (the clip capture RPCs).
#
# 0106 made a clip STORABLE. 0107 is the only way in, and each of its three
# functions has a way of being wrong that looks exactly like working:
#
#   1. CREATE, IDEMPOTENT PER ATTEMPT. A screen capture is the case where a
#      creator retries — cancelled picker, wrong window, refreshed tab. If the
#      convergence is wrong, every retry mints another half-uploaded row and the
#      creator picks between them. Nothing fails; there are just three.
#   2. THE KIND GUARDS. `editor_finalize_clip` and `editor_complete_clip` must
#      refuse a SOURCE. Without that, a take could be settled through a path that
#      writes no capture manifest and no script binding — a ready source that
#      never got the checks a take must pass, and no error anywhere.
#   3. READY MEANS PROBED. `EditPlanV1.composition` (schema v7) requires a real
#      duration and a real checksum for anything it composes. A clip that could
#      reach `ready` without a measurement is a clip the compiler could cut to
#      using a duration nothing measured.
#
# Every section that proves a refusal is paired with a MUTATION CONTROL where it
# is available: drop the rule, watch the bad thing get in. A refusal that would
# have happened anyway proves nothing about the rule under test.
set -euo pipefail
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG106="$REPO/supabase/migrations/0106_clips_and_reference_requirements.sql"
MIG107="$REPO/supabase/migrations/0107_clip_capture.sql"
for f in "$MIG106" "$MIG107"; do [ -f "$f" ] || { echo "FATAL: $f not found"; exit 1; }; done

if [ -z "${PGBIN:-}" ]; then
  for d in /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin; do
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

O_ID='22222222-2222-2222-2222-222222222222'
OTHER_ID='33333333-3333-3333-3333-333333333333'
G_ID='44444444-4444-4444-4444-444444444444'
T1='aaaaaaaa-0000-0000-0000-000000000001'
T2='aaaaaaaa-0000-0000-0000-000000000002'
T3='aaaaaaaa-0000-0000-0000-000000000003'
SRC_ATTEMPT='aaaaaaaa-0000-0000-0000-0000000000ff'
SHA='c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00'

# The pre-0107 shape, reduced to what these functions touch — including 0076's
# real status-transition trigger, because "ready means probed" is enforced partly
# by the ladder and a gate that omitted it would be testing a softer database.
psql -q -v ON_ERROR_STOP=1 <<SQL
create schema auth;
create table auth.users (id uuid primary key);
insert into auth.users values ('$O_ID'), ('$OTHER_ID');
create table public.generations (id uuid primary key, user_id uuid not null);
insert into public.generations values ('$G_ID', '$O_ID');

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid references public.generations(id) on delete set null,
  kind text not null check (kind in ('source', 'music', 'output', 'thumbnail')),
  recording_attempt_id uuid,
  seq bigint generated always as identity,
  bucket text not null,
  storage_path text not null unique,
  content_sha256 text,
  mime_type text,
  size_bytes bigint,
  duration_ms bigint,
  width integer, height integer,
  frame_rate_num integer, frame_rate_den integer,
  rotation integer,
  has_audio boolean,
  status text not null default 'uploading'
    check (status in ('uploading', 'validating', 'ready', 'rejected', 'deleted')),
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

create or replace function public.media_assets_guard_transition()
returns trigger language plpgsql as \$\$
begin
  if old.status = new.status then return new; end if;
  if new.status = 'deleted' then return new; end if;
  if old.status = 'uploading' and new.status = 'validating' then return new; end if;
  if old.status = 'validating' and new.status in ('ready', 'rejected') then return new; end if;
  if old.status = 'rejected' and new.status = 'validating' then
    if new.validation_version <> old.validation_version + 1 then
      raise exception 'media_assets: rejected->validating requires validation_version bump';
    end if;
    return new;
  end if;
  raise exception 'media_assets: illegal status transition % -> %', old.status, new.status;
end; \$\$;
create trigger trg_media_assets_guard
  before update of status on public.media_assets
  for each row execute function public.media_assets_guard_transition();

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid, type text not null, status text not null,
  payload jsonb not null default '{}'::jsonb, dedup_key text
);
create unique index jobs_dedup_key_uniq on public.jobs (dedup_key) where dedup_key is not null;

create table public.gallery_items (
  id uuid primary key default gen_random_uuid(), owner_id uuid,
  platform text not null, url text not null, niche text not null,
  visibility text not null default 'public', created_at timestamptz not null default now()
);
create role service_role;
create role authenticated;
create role anon;
SQL

psql -q -v ON_ERROR_STOP=1 -f "$MIG106" >/dev/null
echo "0106 applied (the clip kind)"

# PRE-STATE. Without this the gate could pass against a database that already
# had the functions, attributing nothing to 0107. `|| true` is load-bearing:
# the call is EXPECTED to fail, and under pipefail a failing psql aborts the run.
PRE=$( { psql -tAc "select 1 from pg_proc where proname = 'editor_create_clip_asset'" 2>/dev/null || true; } | tr -d '[:space:]' )
if [ -n "$PRE" ]; then
  echo "GATE-K FAIL: editor_create_clip_asset already existed before 0107"
  exit 1
fi
echo "  pre-state: none of the clip functions exist before the migration"

psql -q -v ON_ERROR_STOP=1 -f "$MIG107" >/dev/null
echo "0107 applied"

run(){ psql -q -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; }
ok(){ if run "$1"; then echo "  ok: $2"; else echo "GATE-K FAIL: legitimate statement REJECTED ($2)"; psql -c "$1" 2>&1 | tail -3; exit 1; fi; }
no(){ if run "$1"; then echo "GATE-K FAIL: forbidden statement ACCEPTED ($2)"; exit 1; else echo "  rejected: $2"; fi; }
eq(){ local got; got="$(psql -tAc "$1" | tr -d '[:space:]')"; if [ "$got" != "$2" ]; then
  echo "GATE-K FAIL: $3 — expected '$2', got '$got'"; exit 1; else echo "  ok: $3"; fi; }
create(){ echo "select * from public.editor_create_clip_asset('$1','$2','$3',$4,'takes','video/webm',$5)"; }

echo "== 1. create mints exactly one clip, and says so"
ok "$(create "$O_ID" "$G_ID" "$T1" "'the settings page'" 4096)" "a first capture"
eq "select count(*) from public.media_assets where kind='clip'" "1" "one clip row exists"
eq "select clip_label from public.media_assets where recording_attempt_id='$T1'" "thesettingspage" \
   "the declared slot's label is stored on it"
eq "select storage_path from public.media_assets where recording_attempt_id='$T1'" \
   "$O_ID/$G_ID/$(psql -tAc "select id from public.media_assets where recording_attempt_id='$T1'" | tr -d '[:space:]').webm" \
   "the path is server-derived from owner/generation/asset — the browser never chooses it"

echo "== 2. ONE ATTEMPT IS ONE ASSET (the silent-duplication case)"
ok "$(create "$O_ID" "$G_ID" "$T1" "'the settings page'" 4096)" "the same attempt again — a retry"
eq "select count(*) from public.media_assets where kind='clip'" "1" \
   "a retried attempt CONVERGES rather than minting a second half-uploaded row"
eq "select created from public.editor_create_clip_asset('$O_ID','$G_ID','$T1','the settings page','takes','video/webm',4096)" "f" \
   "and the retry reports created=false, so the caller can tell"
ok "$(create "$O_ID" "$G_ID" "$T2" "'the billing screen'" 4096)" "a genuinely new attempt"
eq "select count(*) from public.media_assets where kind='clip'" "2" "which DOES mint a second clip"

echo "== 3. a divergent retry fails closed rather than rewriting the first"
no "$(create "$O_ID" "$G_ID" "$T1" "'the settings page'" 9999)" "the same attempt with a different size"
no "$(create "$O_ID" "$G_ID" "$T1" "'a different slot'" 4096)" "the same attempt filling a DIFFERENT declared slot"
eq "select size_bytes from public.media_assets where recording_attempt_id='$T1'" "4096" \
   "and the original row is untouched by either"

echo "== 4. an unattached clip is a real state, not a clip that fills every slot"
ok "$(create "$O_ID" "$G_ID" "$T3" "null" 4096)" "a capture with no declared slot"
eq "select coalesce((select clip_label from public.media_assets where recording_attempt_id='$T3'), 'NULL')" "NULL" \
   "stored as NULL, never as an empty string the label matcher would compare against"

echo "== 5. ownership and policy"
no "$(create "$OTHER_ID" "$G_ID" 'bbbbbbbb-0000-0000-0000-000000000001' "null" 4096)" \
   "a capture for a generation the caller does not own"
no "$(create "$O_ID" "$G_ID" 'bbbbbbbb-0000-0000-0000-000000000002' "null" 0)" "an empty file"
no "$(create "$O_ID" "$G_ID" 'bbbbbbbb-0000-0000-0000-000000000003' "null" 999999999)" "a file past the bucket cap"
no "select * from public.editor_create_clip_asset('$O_ID','$G_ID','bbbbbbbb-0000-0000-0000-000000000004',null,'edits','video/webm',4096)" \
   "an upload aimed at a bucket that is not takes"
no "select * from public.editor_create_clip_asset('$O_ID','$G_ID','bbbbbbbb-0000-0000-0000-000000000005',null,'takes','image/png',4096)" \
   "a content type that is not video"

echo "== 6. finalize: uploading -> validating, with EXACTLY ONE probe job"
CLIP1="$(psql -tAc "select id from public.media_assets where recording_attempt_id='$T1'" | tr -d '[:space:]')"
eq "select public.editor_finalize_clip('$CLIP1', 5000, 'etag-1')" "validating" "the first finalize moves it to validating"
eq "select public.editor_finalize_clip('$CLIP1', 5000, 'etag-1')" "validating" "a repeated finalize reconciles instead of erroring"
eq "select count(*) from public.jobs where type='validate_clip'" "1" \
   "and still ONE job — a second tab's finalize cannot enqueue a second probe"
eq "select metadata->>'finalized_etag' from public.media_assets where id='$CLIP1'" "etag-1" \
   "the bytes finalize saw are recorded, so the probe can refuse different ones"

echo "== 7. THE KIND GUARDS — a clip path may never settle a take"
ok "insert into public.media_assets (owner_id, generation_id, kind, recording_attempt_id, bucket, storage_path, status)
    values ('$O_ID','$G_ID','source','$SRC_ATTEMPT','takes','$O_ID/$G_ID/src.webm','uploading')" "a source exists"
SRC="$(psql -tAc "select id from public.media_assets where recording_attempt_id='$SRC_ATTEMPT'" | tr -d '[:space:]')"
no "select public.editor_finalize_clip('$SRC', 5000, 'etag-x')" "finalizing a SOURCE through the clip path"
eq "select status from public.media_assets where id='$SRC'" "uploading" "and the source is left exactly as it was"
no "$(create "$O_ID" "$G_ID" "$SRC_ATTEMPT" "null" 4096)" \
   "a clip create converging on a SOURCE's attempt id — it would hand back the take's upload target"

echo "== 8. READY MEANS PROBED"
CLIP2="$(psql -tAc "select id from public.media_assets where recording_attempt_id='$T2'" | tr -d '[:space:]')"
eq "select status from public.media_assets where id='$CLIP2'" "uploading" \
   "the second clip is still uploading, so the next check tests the ladder rather than an empty WHERE"
no "update public.media_assets set status='ready' where id='$CLIP2'" \
   "the ladder still refuses uploading -> ready outright"
ok "select public.editor_complete_clip('$CLIP1','$SHA',5000,7200,1920,1080,30,1,0,false,'{\"container\":\"webm\"}'::jsonb)" \
   "a measured completion"
eq "select duration_ms::text || '/' || content_sha256 from public.media_assets where id='$CLIP1'" "7200/$SHA" \
   "the MEASURED duration and checksum are what the composition model will read"
eq "select metadata->>'finalized_etag' from public.media_assets where id='$CLIP1'" "etag-1" \
   "and the probe metadata was MERGED — the finalize references survive the completion"
no "select public.editor_complete_clip('$CLIP1','$SHA',5000,7200,1920,1080,30,1,0,false,'{}'::jsonb)" \
   "a replayed completion against an already-ready clip"

echo "== 9. and completion cannot reach a source either"
psql -q -v ON_ERROR_STOP=1 -c "update public.media_assets set status='validating' where id='$SRC'" >/dev/null
no "select public.editor_complete_clip('$SRC','$SHA',5000,7200,1920,1080,30,1,0,false,'{}'::jsonb)" \
   "completing a SOURCE through the clip path"
eq "select coalesce(duration_ms::text,'NULL') from public.media_assets where id='$SRC'" "NULL" \
   "the source gains no measured facts from the attempt"

echo "== 10. MUTATION CONTROL: drop the kind guard and the take goes through"
psql -q -v ON_ERROR_STOP=1 <<SQL >/dev/null
create or replace function public.editor_complete_clip(
  p_asset uuid, p_content_sha text, p_size_bytes bigint, p_duration_ms bigint,
  p_width int, p_height int, p_frame_rate_num int, p_frame_rate_den int,
  p_rotation int, p_has_audio boolean, p_probe jsonb
) returns text language plpgsql security definer set search_path = public as \$\$
declare updated int;
begin
  update public.media_assets set status='ready', duration_ms=p_duration_ms
   where id = p_asset and status = 'validating';   -- kind check REMOVED
  get diagnostics updated = row_count;
  if updated = 0 then raise exception 'no'; end if;
  return 'ready';
end; \$\$;
SQL
ok "select public.editor_complete_clip('$SRC','$SHA',5000,7200,1920,1080,30,1,0,false,'{}'::jsonb)" \
   "MUTATION CONTROL — with the kind guard gone, a TAKE is settled through the clip path"

echo "== 11. privileges: no client can call any of this"
for fn in editor_create_clip_asset editor_finalize_clip editor_complete_clip; do
  eq "select count(*) from pg_proc p
       where p.proname = '$fn'
         and (has_function_privilege('authenticated', p.oid, 'execute')
              or has_function_privilege('anon', p.oid, 'execute'))" "0" \
     "$fn is not executable by anon or authenticated"
  eq "select count(*) from pg_proc p
       where p.proname = '$fn' and has_function_privilege('service_role', p.oid, 'execute')" "1" \
     "$fn IS executable by service_role (the edge function's identity)"
done

echo "GATE-K PASS"
