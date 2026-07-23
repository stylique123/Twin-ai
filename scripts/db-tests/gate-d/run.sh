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
grep -E '^(revoke|grant) .*editor_(capture|build_stored|create_source|validate_capture)' "$MIG" > "$WORK/grants.sql"
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
wait || true  # some concurrent children intentionally error (cap/conflict)
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

echo "== owner-scoped cap race: 3 concurrent DISTINCT attempts, 1 slot left =="
OWN2='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'; GENE='55555555-5555-5555-5555-555555555555'
psql -q -c "insert into public.generations(id,user_id) values ('$GENE','$OWN2');"
# pre-seed 4 open source assets → exactly ONE of 3 concurrent distinct-attempt creates may pass (5th slot).
psql -q -c "insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version) select gen_random_uuid(),'$OWN2','$GENE',gen_random_uuid(),'source','takes','x','video/webm',1024,'uploading',1 from generate_series(1,4);"
for i in 1 2 3; do
  A="ee00000$i-0000-0000-0000-00000000000$i"
  J='{"schemaVersion":1,"origin":"upload","generationId":"'"$GENE"'","recordingScriptSha256":null,"clientAttemptId":"'"$A"'","recorderClock":"none","acceptedSegments":[]}'
  psql -tA -c "select created from public.editor_create_source_asset('$OWN2','$GENE','$A','$J'::jsonb,'takes','video/webm',1048576);" > "$WORK/cap$i.txt" 2>&1 &
done
wait || true  # some concurrent children intentionally error (cap/conflict)
SUCC=$( { grep -l '^t$' "$WORK"/cap*.txt 2>/dev/null || true; } | wc -l | tr -d ' ')
OPENCNT=$(psql -tA -c "select count(*) from public.media_assets where owner_id='$OWN2' and status in ('uploading','validating')")
if [ "$SUCC" = "1" ] && [ "$OPENCNT" = "5" ]; then echo "  exactly 1 of 3 distinct attempts passed; owner open-count capped at 5"
else echo "CAP-RACE FAIL successes=$SUCC open=$OPENCNT"; cat "$WORK"/cap*.txt; exit 1; fi

echo "== divergent concurrent input (same fresh attempt) =="
ATT2='88888888-8888-8888-8888-888888888888'
UP='{"schemaVersion":1,"origin":"upload","generationId":"'"$GENC"'","recordingScriptSha256":null,"clientAttemptId":"'"$ATT2"'","recorderClock":"none","acceptedSegments":[]}'
TEL='{"schemaVersion":1,"origin":"teleprompter","generationId":"'"$GENC"'","recordingScriptSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","clientAttemptId":"'"$ATT2"'","recorderClock":"mediarecorder-active-time-ms","acceptedSegments":[{"sceneNumber":1,"startMs":0,"endMs":2000,"intendedDialogueSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]}'
psql -tA -c "select created from public.editor_create_source_asset('$OWN','$GENC','$ATT2','$UP'::jsonb,'takes','video/webm',1048576);" > "$WORK/d1.txt" 2>&1 &
psql -tA -c "select created from public.editor_create_source_asset('$OWN','$GENC','$ATT2','$TEL'::jsonb,'takes','video/webm',1048576);" > "$WORK/d2.txt" 2>&1 &
wait || true  # some concurrent children intentionally error (cap/conflict)
DCNT=$(psql -tA -c "select count(*) from public.source_capture_intents where client_attempt_id='$ATT2'")
# explicit: exactly ONE 'true'/'false' success line AND exactly ONE stable conflict.
DSUCC=$( { grep -cE '^(t|f)$' "$WORK"/d1.txt "$WORK"/d2.txt 2>/dev/null || true; } | awk -F: '{s+=$2} END{print s+0}')
DCONF=$( { grep -ci 'capture_intent_conflict' "$WORK"/d1.txt "$WORK"/d2.txt 2>/dev/null || true; } | awk -F: '{s+=$2} END{print s+0}')
if [ "$DCNT" = "1" ] && [ "$DSUCC" = "1" ] && [ "$DCONF" = "1" ]; then
  echo "  divergent concurrent: 1 intent, 1 success, 1 stable capture_intent_conflict"
else echo "DIVERGENT-CONCURRENT FAIL intents=$DCNT succ=$DSUCC conf=$DCONF"; cat "$WORK"/d1.txt "$WORK"/d2.txt; exit 1; fi

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
# (b) break the validator (no-op) → the REAL assertion GATE (02_assertions.sql)
#     must now FAIL (nonzero). This proves the gate has teeth, not just that a
#     single hostile input slips.
psql -q -f "$WORK/gate_d_fns.sql" >/dev/null   # restore canonical
psql -q -c "create or replace function public.editor_validate_capture_input(p jsonb, p_uuid_gen uuid default null, p_uuid_attempt uuid default null) returns void language plpgsql immutable as \$\$ begin return; end \$\$;"
if psql -q -f "$HERE/02_assertions.sql" >/dev/null 2>&1; then
  echo "NEGATIVE-CONTROL FAIL: assertion gate PASSED under a no-op validator"; exit 1; fi
echo "  (b) no-op validator → assertion gate correctly FAILED"
psql -q -f "$WORK/gate_d_fns.sql" >/dev/null   # restore authoritative

echo "GATE-D LOCAL VERIFICATION: PASS"
