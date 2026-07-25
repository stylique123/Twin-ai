#!/usr/bin/env bash
# Gate-E — ephemeral-Postgres verification of the Decision-v2 DB guard (0092).
# Extracts the AUTHORITATIVE guard functions straight out of the migration (between
# the GATE-D-FUNCTIONS markers), attaches the trigger to a stand-in table, and proves
# a valid v2 decision inserts while every hostile one is rejected — plus a mutation
# control that removes one guard and confirms the gate then FAILS.
set -euo pipefail
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG="$REPO/supabase/migrations/0092_editor_director_decision_v2.sql"
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

awk '/GATE-D-FUNCTIONS-BEGIN/{f=1} f{print} /GATE-D-FUNCTIONS-END/{f=0}' "$MIG" > "$WORK/fns.sql"
grep -q editor_assert_director_decision_v2 "$WORK/fns.sql" || { echo "FATAL: could not extract 0092 guard functions"; exit 1; }

setup_db(){ # $1 = extra sed to mutate the extracted fns ('' = none)
  psql -q -c "drop table if exists t_dec cascade;" -c "create table t_dec (schema_version int not null, decision jsonb not null);"
  if [ -n "$1" ]; then sed "$1" "$WORK/fns.sql" > "$WORK/fns_m.sql"; psql -q -f "$WORK/fns_m.sql"; else psql -q -f "$WORK/fns.sql"; fi
  psql -q -c "drop trigger if exists g on t_dec;" \
           -c "create trigger g before insert on t_dec for each row execute function public.editor_director_decision_guard();"
}

VALID='{"schemaVersion":2,"selections":[{"candidateIndex":0,"kind":"silence","selectionEnabled":1,"startCs":30,"endCs":80}],"keptBoundaries":[],"summary":"","pacing":"punchy","music":"none","emphasisWordIndices":[],"hookTreatment":"keep","hookStartWordIndex":null,"visualWasteSelections":[{"wasteIndex":0,"classCode":0,"startCs":0,"endCs":5}],"captionPresetId":"caption-clean-keyword-v1","transitionPolicy":"restrained","zoomRequests":[{"anchorWordIndex":1,"intensity":"medium","reasonCode":"emphasis_word"}]}'

ins(){ psql -q -v ON_ERROR_STOP=1 -c "insert into t_dec values ($1, \$j\$$2\$j\$);" >/dev/null 2>&1; }
ok(){ if ins "$1" "$2"; then echo "  ok: $3"; else echo "GATE-E FAIL: valid decision REJECTED ($3)"; exit 1; fi; }
no(){ if ins "$1" "$2"; then echo "GATE-E FAIL: hostile decision ACCEPTED ($3)"; exit 1; else echo "  rejected: $3"; fi; }

setup_db ""
echo "== positive =="
ok 2 "$VALID" "valid v2 decision inserts"
# Build each hostile from the FULL valid base by poisoning exactly ONE field with jq, so
# a specific-guard test is rejected for its OWN reason (filler / not-selectable / catalog)
# and never merely for incompleteness.
mut(){ echo "$VALID" | jq -c "$1"; }
FILLER='.selections=[{"candidateIndex":0,"kind":"filler","selectionEnabled":1,"startCs":0,"endCs":10}]'
echo "== hostile (each must be rejected) =="
no 1 "$VALID" "schema_version != 2"
no 2 "$(mut "$FILLER")" "filler removal"
no 2 "$(mut '.selections=[{"candidateIndex":0,"kind":"silence","selectionEnabled":0,"startCs":0,"endCs":10}]')" "non-selectable speech removal"
no 2 "$(mut '.visualWasteSelections=[{"wasteIndex":0,"classCode":1,"startCs":0,"endCs":5}]')" "non-dead_air visual-waste removal"
no 2 "$(mut '.captionPresetId="neon"')" "off-catalog caption preset"
no 2 "$(mut '.transitionPolicy="wipe"')" "off-catalog transition policy"
no 2 "$(mut '.pacing="chaotic"')" "off-catalog pacing"
no 2 "$(mut '.music="lofi"')" "off-catalog music"
no 2 "$(mut '.hookTreatment="rewrite"')" "off-catalog hook treatment"
no 2 "$(mut '.zoomRequests=[{"anchorWordIndex":1,"intensity":"nuclear","reasonCode":"emphasis_word"}]')" "off-catalog zoom intensity"
no 2 "$(mut '.zoomRequests=[{"anchorWordIndex":1,"intensity":"subtle","reasonCode":"vibes"}]')" "off-catalog zoom reason"
no 2 "$(mut 'del(.captionPresetId)')" "incomplete decision (missing a required field)"
no 2 '{"schemaVersion":2,"selections":[]}' "degenerate near-empty decision"
no 2 "$(mut '.schemaVersion=1')" "embedded schemaVersion disagrees with the column"

echo "== negative control (guard removed → gate must FAIL) =="
setup_db "s/raise exception 'director_filler_disabled' using errcode = 'raise_exception';/null;/"
if ins 2 "$(mut "$FILLER")"; then
  echo "  (m1) filler guard removed → hostile filler correctly ACCEPTED (control has teeth)"
else
  echo "GATE-E FAIL: filler still rejected after removing its guard — control is toothless"; exit 1
fi
setup_db ""  # restore authoritative

echo "GATE-E LOCAL VERIFICATION: PASS"
