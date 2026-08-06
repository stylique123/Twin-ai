#!/usr/bin/env bash
# Gate-L — ephemeral-Postgres verification of 0109 (the pre-script brief).
#
# The defect 0109 closes had shipped: §8a.1's brief was ASKED in onboarding and
# stored nowhere. `workKind` and `forbiddenClaims` went into a localStorage
# draft and no further — there was no column, and grepping the tree for
# `work_kind` or `forbidden_claims` returned nothing. A doctor typed what they
# may never claim into a box we put in front of them, and it lived in one
# browser until that browser was cleared.
#
# Two things can be wrong here in ways that look exactly like working:
#
#   1. THE EMPTY STRING. `{"forbiddenClaims": ""}` and `{}` are the same fact to
#      every reader and different rows in the table. Stored, the empty one reads
#      as "unanswered" to anything that trims and as "answered" to anything that
#      checks for the key — a fourth state that means the same as the absent one
#      and is counted differently by whoever forgets. The CHECK refuses it.
#   2. THE MISSING COLUMN GRANT. `brand_voices` revoked table-level UPDATE from
#      `authenticated` in 0002 and grants it back one column at a time, so a new
#      column is UNWRITABLE by default and fails with a bare 42501 naming
#      nothing. This has already happened twice in this tree (0053 for
#      `scene_timeline`, 0051 for `brand_kit`), and the second time a creator
#      dead-ended AFTER spending a recreation.
#
# The refusals are paired with a MUTATION CONTROL: drop the rule, watch the bad
# value get in. A refusal that would have happened anyway proves nothing.
set -euo pipefail
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8
PGBIN=/usr/lib/postgresql/*/bin; PGBIN=$(echo $PGBIN)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG="$REPO/supabase/migrations/0109_pre_script_brief.sql"
[ -f "$MIG" ] || { echo "FATAL: $MIG not found"; exit 1; }
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

psql -q -v ON_ERROR_STOP=1 <<'SQL'
create table public.brand_voices (id uuid primary key default gen_random_uuid(), owner_id uuid);
create role authenticated; create role anon; create role service_role;
revoke update on public.brand_voices from authenticated;
SQL

psql -q -v ON_ERROR_STOP=1 -f "$REPO/supabase/migrations/0109_pre_script_brief.sql" >/dev/null
echo "0109 applied"
run(){ psql -q -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; }
ok(){ if run "$1"; then echo "  ok: $2"; else echo "FAIL: legit REJECTED ($2)"; psql -c "$1" 2>&1|tail -2; exit 1; fi; }
no(){ if run "$1"; then echo "FAIL: forbidden ACCEPTED ($2)"; exit 1; else echo "  rejected: $2"; fi; }
ins(){ echo "insert into public.brand_voices (pre_script_brief) values ('$1'::jsonb)"; }

ok "$(ins '{}')" "an empty brief"
ok "insert into public.brand_voices (pre_script_brief) values (null)" "no brief at all — unanswered"
ok "$(ins '{"workKind":"professional","forbiddenClaims":"no guaranteed outcomes"}')" "a real compliance answer"
ok "$(ins '{"forbiddenClaims":"none"}')" "an explicit none — a real answer"
ok "$(ins '{"productEvidence":"declined"}')" "a declined product"
ok "$(ins '{"productEvidence":{"form":"link","sections":[]}}')" "an evidence object"
ok "$(ins '{"promotes":"my own saas"}')" "the OTHER track's confirm-screen key"
no "$(ins '{"forbiddenClaims":""}')" "an empty string — indistinguishable from unanswered"
no "$(ins '{"forbiddenClaims":"   "}')" "whitespace pretending to be an answer"
no "$(ins '{"offer":null}')" "an explicit null instead of an absent key"
no "$(ins '{"invented":"x"}')" "a key nobody designed"
no "$(ins '{"workKind":123}')" "a number where an answer belongs"
no "$(ins '{"productEvidence":"a great product"}')" "a DESCRIPTION of the product"
no "insert into public.brand_voices (pre_script_brief) values ('[]'::jsonb)" "an array"

# MUTATION CONTROL: drop the constraint and the empty string gets in.
psql -q -c "alter table public.brand_voices drop constraint brand_voices_pre_script_brief_shape" >/dev/null
ok "$(ins '{"forbiddenClaims":""}')" "MUTATION CONTROL — with the CHECK gone, the empty answer is stored"

# the grant
got=$(psql -tAc "select has_column_privilege('authenticated','public.brand_voices','pre_script_brief','UPDATE')" | tr -d '[:space:]')
[ "$got" = "t" ] && echo "  ok: authenticated may write the column" || { echo "FAIL: no column grant — the write would 42501"; exit 1; }
got=$(psql -tAc "select has_function_privilege('anon','public.is_pre_script_brief(jsonb)','EXECUTE')" | tr -d '[:space:]')
[ "$got" = "f" ] && echo "  ok: anon cannot execute the guard" || { echo "FAIL: anon holds execute"; exit 1; }
echo "GATE-L PASS"
