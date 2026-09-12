#!/usr/bin/env bash
# Gate-O — ephemeral-Postgres verification of the gallery de-duplication (0200).
#
# Proves the three properties the migration claims: the EARLIEST row survives,
# the survivor INHERITS a shape it did not have, and a url in TWO niches is left
# alone. Then proves the index actually prevents recurrence, and ends with a
# mutation that keeps the LATEST row instead and confirms the gate fails.
set -euo pipefail
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG="$REPO/supabase/migrations/0200_a_card_is_one_video_in_one_niche.sql"
[ -f "$MIG" ] || { echo "FATAL: 0200 not found"; exit 1; }

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
psql(){ "$PGBIN/psql" -v ON_ERROR_STOP=1 -qtAX "$@"; }

seed(){
psql <<'EOSQL'
drop table if exists public.gallery_items;
create table public.gallery_items (
  id uuid primary key default gen_random_uuid(), owner_id uuid, platform text,
  url text not null, niche text not null, creator text, title text, why text,
  reach text, likes text, visibility text,
  created_at timestamptz not null default now(),
  caption_shape text, caption_shape_basis text, caption_shape_reason text,
  caption_shape_version int, caption_shape_at timestamptz
);
-- A: duplicated 3x; the EARLIEST has no shape, a LATER one does.
insert into public.gallery_items(url,niche,created_at,caption_shape,caption_shape_at) values
 ('u/a','business','2026-09-01', null, null),
 ('u/a','business','2026-09-05', 'listicle', '2026-09-05'),
 ('u/a','business','2026-09-08', null, null);
-- B: the SAME url in a DIFFERENT niche — legitimate, must survive untouched.
insert into public.gallery_items(url,niche,created_at) values ('u/a','creator','2026-09-03');
-- C: duplicated, earliest already has the shape; a later one must not overwrite it.
insert into public.gallery_items(url,niche,created_at,caption_shape,caption_shape_at) values
 ('u/c','fitness','2026-09-01','story','2026-09-01'),
 ('u/c','fitness','2026-09-09','listicle','2026-09-09');
-- D: a plain single row.
insert into public.gallery_items(url,niche,created_at) values ('u/d','food','2026-09-02');
EOSQL
}
seed
psql -f "$MIG" >/dev/null

q(){ psql -c "$1"; }
expect(){ local got; got="$(q "$2")"; [ "$got" = "$3" ] || { echo "FAIL: $1 — got '$got', want '$3'"; exit 1; }; echo "ok: $1"; }

expect "every (url, niche) is now unique" \
  "select count(*) from (select url,niche from public.gallery_items group by 1,2 having count(*)>1) x" "0"
expect "the earliest row survived for u/a business" \
  "select created_at::date::text from public.gallery_items where url='u/a' and niche='business'" "2026-09-01"
expect "the survivor inherited the shape it did not have" \
  "select caption_shape from public.gallery_items where url='u/a' and niche='business'" "listicle"
expect "the same url in a second niche was left alone" \
  "select count(*) from public.gallery_items where url='u/a' and niche='creator'" "1"
expect "an earliest row that already had a shape kept its own" \
  "select caption_shape from public.gallery_items where url='u/c' and niche='fitness'" "story"
expect "a single row was untouched" \
  "select count(*) from public.gallery_items where url='u/d'" "1"
expect "four rows remain in total" "select count(*) from public.gallery_items" "4"

# ⚠️ THE INDEX MUST ACTUALLY PREVENT RECURRENCE, not merely exist.
if psql -c "insert into public.gallery_items(url,niche) values ('u/a','business')" >/dev/null 2>&1; then
  echo "FAIL: a duplicate pair was accepted after the index"; exit 1
fi
echo "ok: the index refuses a duplicate pair"
psql -c "insert into public.gallery_items(url,niche) values ('u/a','health')" >/dev/null
echo "ok: the index still allows the same url in a new niche"

# ── MUTATION CONTROL ────────────────────────────────────────────────────────
# Keep the LATEST row instead of the earliest. The survivor's date then changes,
# so a gate that does not notice is not testing the rule it claims to.
python3 - "$MIG" "$WORK/mut.sql" <<'PYMUT'
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src).read()
old = "order by created_at, id) rn\n    from public.gallery_items\n  ),\n  survivor"
assert s.count(old) == 1, "mutation anchor matched %d times" % s.count(old)
s = s.replace(old, "order by created_at desc, id desc) rn\n    from public.gallery_items\n  ),\n  survivor", 1)
old2 = "select id, row_number() over (partition by url, niche order by created_at, id) rn"
assert s.count(old2) == 1
s = s.replace(old2, "select id, row_number() over (partition by url, niche order by created_at desc, id desc) rn", 1)
open(dst, "w").write(s)
PYMUT
grep -q "order by created_at desc" "$WORK/mut.sql" || { echo "FATAL: mutation did not apply"; exit 1; }
seed
psql -f "$WORK/mut.sql" >/dev/null
MUTDATE="$(q "select created_at::date::text from public.gallery_items where url='u/a' and niche='business'")"
[ "$MUTDATE" = "2026-09-01" ] && { echo "FAIL: mutation control — keeping the latest changed nothing"; exit 1; }
echo "ok: mutation control — keeping the latest row moves the date to $MUTDATE"

echo "GATE-O PASS"
