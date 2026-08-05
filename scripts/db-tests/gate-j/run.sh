#!/usr/bin/env bash
# Gate-J — ephemeral-Postgres verification of 0106.
#
# Two additions, each with a way of failing SILENTLY, which is why this exists.
#
#   1. THE `clip` KIND. The old CHECK on media_assets.kind was declared inline,
#      so its name is whatever Postgres chose. A migration that guessed the name
#      and used `drop constraint if exists` would silently drop NOTHING, add a
#      second check beside the surviving restrictive one, and report success —
#      leaving 'clip' refused. This proves a clip can actually be inserted.
#
#   2. THE REFERENCE-REQUIREMENTS PAIR. An assessment must say where it came
#      from, and a source with no assessment is a claim about nothing. Both
#      directions are checked, because a constraint written as an implication
#      rather than an equivalence would let one of them through.
#
# And it proves the part that makes adding a kind safe at all: a clip is NOT
# picked up by anything that looks for a source.
set -euo pipefail
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG="$REPO/supabase/migrations/0106_clips_and_reference_requirements.sql"
[ -f "$MIG" ] || { echo "FATAL: $MIG not found"; exit 1; }

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
G_ID='44444444-4444-4444-4444-444444444444'
A_ID='55555555-5555-5555-5555-555555555555'

# The pre-0106 shape of the two tables, reduced to what 0106 touches. The kind
# CHECK is declared INLINE here exactly as 0076 declares it, so this gate is
# testing against the real naming situation rather than a convenient one.
psql -q -v ON_ERROR_STOP=1 <<SQL
create schema auth;
create table auth.users (id uuid primary key);
insert into auth.users values ('$O_ID');
create table public.generations (id uuid primary key);
insert into public.generations values ('$G_ID');

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid references public.generations(id) on delete set null,
  kind text not null check (kind in ('source', 'music', 'output', 'thumbnail')),
  recording_attempt_id uuid,
  bucket text not null,
  storage_path text not null unique,
  status text not null default 'uploading',
  created_at timestamptz not null default now(),
  constraint media_assets_source_needs_attempt
    check (kind <> 'source' or recording_attempt_id is not null)
);

create table public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  platform text not null,
  url text not null,
  niche text not null,
  visibility text not null default 'public',
  created_at timestamptz not null default now()
);
insert into public.gallery_items (platform, url, niche) values ('tiktok', 'https://x/1', 'Food');
SQL

# PRE-STATE. Without this the gate could pass against a database that already
# allowed clips, attributing nothing to the migration.
# `|| true` is load-bearing: this insert is EXPECTED to fail, and under
# `set -o pipefail` a failing psql would abort the gate before it started.
PRE=$( { psql -tAc "insert into public.media_assets (owner_id, generation_id, kind, recording_attempt_id, bucket, storage_path)
      values ('$O_ID','$G_ID','clip','$A_ID','takes','pre/clip.webm') returning 1" 2>/dev/null || true; } | tr -d '[:space:]' )
if [ -n "$PRE" ]; then
  echo "GATE-J FAIL: 'clip' was already accepted before 0106 — nothing here is attributable to the migration"
  exit 1
fi
echo "  pre-state: 'clip' is REFUSED before the migration (so 0106 is what allows it)"

psql -q -v ON_ERROR_STOP=1 -f "$MIG"
echo "0106 applied"

run(){ psql -q -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; }
ok(){ if run "$1"; then echo "  ok: $2"; else echo "GATE-J FAIL: legitimate statement REJECTED ($2)"; psql -c "$1" 2>&1 | tail -3; exit 1; fi; }
no(){ if run "$1"; then echo "GATE-J FAIL: forbidden statement ACCEPTED ($2)"; exit 1; else echo "  rejected: $2"; fi; }
eq(){ local got; got="$(psql -tAc "$1" | tr -d '[:space:]')"; if [ "$got" != "$2" ]; then
  echo "GATE-J FAIL: $3 — expected '$2', got '$got'"; exit 1; else echo "  ok: $3"; fi; }
asset(){ echo "insert into public.media_assets (owner_id, generation_id, kind, recording_attempt_id, bucket, storage_path, clip_label)
  values ('$O_ID','$G_ID','$1',$2,'takes','$3',$4)"; }

echo "== 1. the clip kind actually landed (the silent-failure case)"
ok "$(asset clip "'$A_ID'" 'a/clip.webm' null)" "a clip with an attempt id"
ok "$(asset source "'66666666-6666-6666-6666-666666666666'" 'a/src.webm' null)" "a source still works"
ok "$(asset thumbnail null 'a/thumb.png' null)" "and so do the kinds that never needed an attempt"
no "$(asset broll null 'a/x.webm' null)" "an invented kind — the list is still CLOSED"
# If the old constraint had survived beside the new one, this count would be 2
# and 'clip' would have been refused above.
eq "select count(*) from pg_constraint con join pg_class rel on rel.oid = con.conrelid
    where rel.relname='media_assets' and con.contype='c'
      and pg_get_constraintdef(con.oid) like '%thumbnail%'" "1" \
   "exactly ONE kind CHECK survives (the old inline one was really dropped)"

echo "== 2. one attempt, one asset — extended to clips"
no "$(asset clip null 'a/noattempt.webm' null)" "a CLIP with no recording attempt id"
no "$(asset source null 'a/noattempt2.webm' null)" "a source with none (unchanged)"

echo "== 3. clip_label belongs to clips and to nothing else"
ok "$(asset clip "'77777777-7777-7777-7777-777777777777'" 'a/labelled.webm' "'the settings page'")" "a labelled clip"
ok "$(asset clip "'88888888-8888-8888-8888-888888888888'" 'a/unlabelled.webm' null)" "an UNATTACHED clip — a legitimate state"
no "$(asset source "'99999999-9999-9999-9999-999999999999'" 'a/badlabel.webm' "'the settings page'")" "a label on a SOURCE"
no "$(asset clip "'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'" 'a/blank.webm' "'   '")" "a whitespace-only label"

echo "== 4. what makes adding a kind safe: a clip is not a source"
eq "select count(*) from public.media_assets where kind = 'source'" "1" \
   "a source query does NOT widen to pick up the four clips"

echo "== 5. an assessment and its source travel together, both ways"
G1="update public.gallery_items set"
no "$G1 requires_filming_objects = true" "an assessment with NO source"
no "$G1 requirements_source = 'model'" "a source with NO assessment"
no "$G1 requires_filming_objects = true, requirements_source = 'scraper'" "a source outside the closed list"
ok "$G1 requires_filming_objects = true, requirements_source = 'model'" "an assessment WITH its source"
ok "$G1 requires_screen_recording = true, requires_filming_objects = null, requirements_source = 'human'" \
   "a PARTIAL assessment — one answered, one still unknown"
ok "$G1 requires_filming_objects = null, requires_screen_recording = null, requirements_source = null" \
   "and clearing both back to unassessed"

echo "== 6. NULL IS NOT FALSE — the default state is unassessed"
eq "select count(*) from public.gallery_items where requires_filming_objects is null" "1" \
   "an untouched card reads as UNASSESSED, not as 'no objects needed'"
eq "select coalesce((select requires_filming_objects::text from public.gallery_items limit 1), 'NULL')" "NULL" \
   "and the column has no default that would invent an answer"

echo "== 7. MUTATION CONTROL: drop the pairing rule and the bad rows go in"
psql -q -c "alter table public.gallery_items drop constraint gallery_items_requirements_need_source" >/dev/null
if run "$G1 requires_filming_objects = true, requirements_source = null"; then
  echo "  ok: MUTATION CONTROL — with the constraint dropped, an unsourced assessment is accepted"
else
  echo "GATE-J FAIL: the unsourced assessment was still refused after dropping the constraint —"
  echo "             something OTHER than the rule under test was rejecting it, so section 5 proved nothing"
  exit 1
fi
psql -q -v ON_ERROR_STOP=1 -c "$G1 requires_filming_objects = null, requirements_source = null" >/dev/null

echo "== 8. MUTATION CONTROL: put the old kind list back and clips stop working"
psql -q -c "alter table public.media_assets drop constraint media_assets_kind_check" >/dev/null
psql -q -v ON_ERROR_STOP=1 -c "delete from public.media_assets where kind = 'clip'" >/dev/null
psql -q -c "alter table public.media_assets add constraint media_assets_kind_check
            check (kind in ('source','music','output','thumbnail'))" >/dev/null
no "$(asset clip "'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'" 'a/after.webm' null)" \
   "MUTATION CONTROL — with the old list restored, a clip is refused again"

echo "GATE-J PASS"
