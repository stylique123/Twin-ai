#!/usr/bin/env bash
# Gate-D local DB verification — ephemeral PostgreSQL 16, no network.
# Loads the AUTHORITATIVE Gate-D functions straight out of
# supabase/migrations/0091_editor_capture_hardening.sql (between the extraction
# markers) so no hand-copied mirror can drift, then runs fail-closed assertions,
# a real 5-way concurrency test, DB<->TS canonical parity, and negative-control
# mutation tests that PROVE the harness fails when a guarantee is broken.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG="$REPO/supabase/migrations/0091_editor_capture_hardening.sql"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
WORK="$(mktemp -d)"
export PGHOST="$WORK/sock" PGUSER=postgres PGDATABASE=postgres
mkdir -p "$WORK/data" "$WORK/sock"

RUN=(); if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
  chown -R postgres:postgres "$WORK"; RUN=(runuser -u postgres --); fi
cleanup(){ "${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

"${RUN[@]}" "$PGBIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" \
  -o "-c unix_socket_directories=$WORK/sock -c listen_addresses=''" -l "$WORK/pg.log" start >/dev/null
for _ in $(seq 1 30); do "$PGBIN/pg_isready" -q && break || sleep 0.3; done

# --- extract the authoritative Gate-D functions from the migration ---
awk '/GATE-D-FUNCTIONS-BEGIN/{f=1} f{print} /GATE-D-FUNCTIONS-END/{f=0}' "$MIG" > "$WORK/gate_d_fns.sql"
if ! grep -q editor_create_source_asset "$WORK/gate_d_fns.sql"; then
  echo "FATAL: could not extract Gate-D functions from 0091 (markers moved?)"; exit 1; fi

psql -q -f "$HERE/00_schema_subset.sql"
psql -q -f "$WORK/gate_d_fns.sql"
# grants live just outside the markers; apply the real revoke/grant statements
# so the grant-posture assertions exercise the migration's actual posture.
grep -E '^(revoke|grant) .*editor_(capture_intent|build_stored|create_source|validate_capture)' "$MIG" > "$WORK/grants.sql"
psql -q -f "$WORK/grants.sql"

echo "== fail-closed assertions (contract matrix, policy, grants) =="
psql -q -f "$HERE/02_assertions.sql" | grep -E "ALL-ASSERTIONS-PASSED|=="

# concurrency uses a FRESH owner/generation (untouched by caps pre-seeding).
OWN='dddddddd-dddd-dddd-dddd-dddddddddddd'; GENC='44444444-4444-4444-4444-444444444444'
psql -q -c "insert into public.generations(id,user_id) values ('$GENC','$OWN');"

echo "== real 5-way concurrency (same attempt) =="
ATT='77777777-7777-7777-7777-777777777777'
INP='{"schemaVersion":1,"origin":"upload","generationId":"'"$GENC"'","recordingScriptSha256":null,"clientAttemptId":"'"$ATT"'","recorderClock":"none","acceptedSegments":[]}'
CALL="select asset_id||'|'||intent_sha256||'|'||created from public.editor_create_source_asset('$OWN','$GENC','$ATT','$INP'::jsonb,'takes','video/webm',1048576);"
for i in 1 2 3 4 5; do psql -tA -c "$CALL" > "$WORK/c$i.txt" 2>&1 & done
wait
cat "$WORK"/c*.txt | sort > "$WORK/conc.txt"
node -e '
const fs=require("fs");const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(l=>l.split("|"));
const ids=new Set(rows.map(r=>r[0])), shas=new Set(rows.map(r=>r[1]));
const t=rows.filter(r=>r[2]==="true").length, f=rows.filter(r=>r[2]==="false").length;
const ok = rows.length===5 && ids.size===1 && shas.size===1 && t===1 && f===4;
console.log(`  5 calls: created=true×${t}, false×${f}, distinct ids=${ids.size}, distinct shas=${shas.size}`);
if(!ok){console.error("CONCURRENCY FAIL");console.error(fs.readFileSync(process.argv[1],"utf8"));process.exit(1);}
' "$WORK/conc.txt"
CNT=$(psql -tA -c "select count(*) from public.media_assets where recording_attempt_id='$ATT'")
ICNT=$(psql -tA -c "select count(*) from public.source_capture_intents where client_attempt_id='$ATT'")
[ "$CNT" = "1" ] && [ "$ICNT" = "1" ] && echo "  DB converged: 1 asset, 1 intent" || { echo "CONVERGENCE FAIL assets=$CNT intents=$ICNT"; exit 1; }

echo "== divergent concurrent input (same fresh attempt) =="
ATT2='88888888-8888-8888-8888-888888888888'
UP='{"schemaVersion":1,"origin":"upload","generationId":"'"$GENC"'","recordingScriptSha256":null,"clientAttemptId":"'"$ATT2"'","recorderClock":"none","acceptedSegments":[]}'
TEL='{"schemaVersion":1,"origin":"teleprompter","generationId":"'"$GENC"'","recordingScriptSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","clientAttemptId":"'"$ATT2"'","recorderClock":"mediarecorder-active-time-ms","acceptedSegments":[{"sceneNumber":1,"startMs":0,"endMs":2000,"intendedDialogueSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]}'
psql -tA -c "select created from public.editor_create_source_asset('$OWN','$GENC','$ATT2','$UP'::jsonb,'takes','video/webm',1048576);" > "$WORK/d1.txt" 2>&1 &
psql -tA -c "select created from public.editor_create_source_asset('$OWN','$GENC','$ATT2','$TEL'::jsonb,'takes','video/webm',1048576);" > "$WORK/d2.txt" 2>&1 &
wait
DCNT=$(psql -tA -c "select count(*) from public.source_capture_intents where client_attempt_id='$ATT2'")
if [ "$DCNT" = "1" ] && grep -qi "capture_intent_conflict" "$WORK"/d1.txt "$WORK"/d2.txt; then
  echo "  divergent concurrent: exactly 1 intent, loser got capture_intent_conflict"
else echo "DIVERGENT-CONCURRENT FAIL intents=$DCNT"; cat "$WORK"/d1.txt "$WORK"/d2.txt; exit 1; fi

echo "== DB<->TS canonical + sha parity =="
"$REPO/node_modules/.bin/esbuild" "$HERE/parity_driver.ts" --bundle --platform=node --format=esm --outfile="$WORK/driver.mjs" >/dev/null
node "$WORK/driver.mjs" > "$WORK/ts.json"
node "$HERE/parity_check.mjs" "$WORK/ts.json"
node "$HERE/escaping_parity.mjs"

echo "== negative controls (harness must FAIL when a guarantee is broken) =="
# (a) break the canonical serializer → parity MUST detect a mismatch (nonzero).
psql -q -c "create or replace function public.editor_capture_intent_canonical(p jsonb) returns text language sql immutable as \$\$ select 'BROKEN' \$\$;"
if node "$HERE/parity_check.mjs" "$WORK/ts.json" >/dev/null 2>&1; then
  echo "NEGATIVE-CONTROL FAIL: broken canonical still passed parity"; exit 1; fi
echo "  (a) broken canonical → parity correctly FAILED"
# (b) break the validator (no-op) → a hostile input that MUST raise now passes,
#     proving the guarantee check has teeth. Authoritative: '[]' raises
#     capture_intent_not_object (nonzero); no-op: it succeeds (zero) = break seen.
psql -q -f "$WORK/gate_d_fns.sql" >/dev/null   # restore canonical
if ! psql -q -v ON_ERROR_STOP=1 -c "select public.editor_validate_capture_input('[]'::jsonb)" >/dev/null 2>&1; then
  echo "  (control) authoritative validator rejects '[]' as required"
else echo "NEGATIVE-CONTROL FAIL: authoritative validator did not reject '[]'"; exit 1; fi
psql -q -c "create or replace function public.editor_validate_capture_input(p jsonb, p_uuid_gen uuid default null, p_uuid_attempt uuid default null) returns void language plpgsql immutable as \$\$ begin return; end \$\$;"
if psql -q -v ON_ERROR_STOP=1 -c "select public.editor_validate_capture_input('[]'::jsonb)" >/dev/null 2>&1; then
  echo "  (b) no-op validator → hostile input no longer rejected (break detected)"
else echo "NEGATIVE-CONTROL FAIL: no-op override still rejected the hostile input"; exit 1; fi
psql -q -f "$WORK/gate_d_fns.sql" >/dev/null   # restore authoritative

echo "GATE-D LOCAL VERIFICATION: PASS"
