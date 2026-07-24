#!/usr/bin/env bash
# Gate-D local DB verification — ephemeral PostgreSQL 16, no network.
# Loads the AUTHORITATIVE Gate-D functions straight out of
# supabase/migrations/0091_editor_capture_hardening.sql (between the extraction
# markers) so no hand-copied mirror can drift, then runs fail-closed assertions,
# a real 5-way concurrency test, DB<->TS canonical parity, and negative-control
# mutation tests that PROVE the harness fails when a guarantee is broken.
set -euo pipefail
# Portable across the founder/dev macOS Bash 3.2 and Linux/CI: no empty-array
# expansion under `set -u`, and an explicit C locale + UTF8 encoding (macOS has
# no C.UTF-8). PGCLIENTENCODING keeps the client UTF8 regardless of LC_ALL.
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG="$REPO/supabase/migrations/0091_editor_capture_hardening.sql"
# Autodetect the initdb/pg_ctl location if PGBIN isn't set (Linux pkg path or a
# Homebrew/Postgres.app bin on macOS).
if [ -z "${PGBIN:-}" ]; then
  for d in /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin \
           /Applications/Postgres.app/Contents/Versions/latest/bin; do
    [ -x "$d/initdb" ] && PGBIN="$d" && break
  done
  PGBIN="${PGBIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/bin/initdb)")}"
fi
WORK="$(mktemp -d)"
export PGHOST="$WORK/sock" PGUSER=postgres PGDATABASE=postgres
mkdir -p "$WORK/data" "$WORK/sock"

# initdb/postgres refuse to run as root; drop to the postgres user only then.
# Use a function (not an array) so Bash 3.2 + `set -u` never expands an unbound
# empty array.
AS_PG=0
if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then chown -R postgres:postgres "$WORK"; AS_PG=1; fi
pg_run(){ if [ "$AS_PG" = "1" ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
cleanup(){ pg_run "$PGBIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

pg_run "$PGBIN/initdb" -D "$WORK/data" -U postgres --auth=trust --locale=C --encoding=UTF8 >/dev/null
pg_run "$PGBIN/pg_ctl" -D "$WORK/data" \
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
grep -E '^(revoke|grant) .*public\.editor_(capture_segments|capture_intent|validate_capture|build_stored|snapshot_normalize|recording_script|verify_capture|persist_script|create_source)' "$MIG" > "$WORK/grants.sql"
psql -q -f "$WORK/grants.sql"

echo "== fail-closed assertions (contract matrix, policy, grants) =="
psql -q -f "$HERE/02_assertions.sql" | grep -E "ALL-ASSERTIONS-PASSED|=="

echo "== identity matrix (RLS owner/peer/outsider/anon/service_role, SET ROLE) =="
# Capture BOTH stdout and stderr: a PostgreSQL WARNING (e.g. a bare SET LOCAL ROLE
# outside a transaction, which PG ignores) prints to stderr and MUST fail the gate,
# along with any IDENTITY_FAIL/ERROR. Success requires the PASS marker AND no warning.
identity_run(){ # $1 = sql file → 0 iff clean PASS, nonzero otherwise
  local out; out="$(psql -q -f "$1" 2>&1 || true)"
  printf '%s\n' "$out" | grep -qiE 'warning' && return 1
  printf '%s\n' "$out" | grep -qE 'IDENTITY_FAIL|ERROR' && return 1
  printf '%s\n' "$out" | grep -qE 'IDENTITY-MATRIX-PASSED' || return 1
  return 0
}
if identity_run "$HERE/03_identity.sql"; then echo "  IDENTITY-MATRIX-PASSED (3 tables; no warnings)"
else echo "IDENTITY MATRIX FAIL"; psql -q -f "$HERE/03_identity.sql" 2>&1 | tail -20; exit 1; fi

# concurrency uses a FRESH owner/generation (untouched by caps pre-seeding). The
# generation carries a real scene_timeline so the divergent-concurrent teleprompter
# input below can assert the server-recomputed script SHA (source-bound snapshot).
OWN='dddddddd-dddd-dddd-dddd-dddddddddddd'; GENC='44444444-4444-4444-4444-444444444444'
TL='{"hook":"Hey there","scenes":[{"scene_number":1,"scene_type":"talking_head","dialogue":"Hello world","show_in_teleprompter":true}]}'
psql -q -c "insert into public.generations(id,user_id,selected_hook,scene_timeline) values ('$GENC','$OWN','col hook','$TL'::jsonb);"
SNAP_SHA=$(psql -tA -c "select public.editor_recording_script_sha256('$GENC','$TL'::jsonb,'col hook')" | tr -d ' ')
DLG_SHA=$(psql -tA -c "select encode(digest(convert_to(normalize('Hello world', NFC),'UTF8'),'sha256'),'hex')" | tr -d ' ')

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

echo "== owner-scoped QUOTA race: 3 concurrent DISTINCT attempts, room for 1 =="
OWN3='ffffffff-ffff-ffff-ffff-ffffffffffff'; GENF='66666666-6666-6666-6666-666666666666'
psql -q -c "insert into public.generations(id,user_id) values ('$GENF','$OWN3');"
# Pre-seed usage so exactly ONE more 1 MiB (1048576) asset fits under the 20 GB
# (21474836480) quota: seed 21473336480 used → after one create 21474385056 (ok),
# a second would be 21475433632 (> quota). status 'ready' so open-cap isn't the gate.
psql -q -c "insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version) values (gen_random_uuid(),'$OWN3','$GENF',gen_random_uuid(),'source','takes','x','video/webm',21473336480,'ready',1);"
for i in 1 2 3; do
  A="ff00000$i-0000-0000-0000-00000000000$i"
  J='{"schemaVersion":1,"origin":"upload","generationId":"'"$GENF"'","recordingScriptSha256":null,"clientAttemptId":"'"$A"'","recorderClock":"none","acceptedSegments":[]}'
  psql -tA -c "select created from public.editor_create_source_asset('$OWN3','$GENF','$A','$J'::jsonb,'takes','video/webm',1048576);" > "$WORK/q$i.txt" 2>&1 &
done
wait || true  # over-quota children intentionally error
QSUCC=$( { grep -l '^t$' "$WORK"/q*.txt 2>/dev/null || true; } | wc -l | tr -d ' ')
QCONF=$( { grep -ci 'source_quota_exceeded' "$WORK"/q1.txt "$WORK"/q2.txt "$WORK"/q3.txt 2>/dev/null || true; } | awk -F: '{s+=$2} END{print s+0}')
QUSED=$(psql -tA -c "select coalesce(sum(size_bytes),0) from public.media_assets where owner_id='$OWN3' and status<>'deleted'")
if [ "$QSUCC" = "1" ] && [ "$QCONF" = "2" ] && [ "$QUSED" -le 21474836480 ]; then
  echo "  exactly 1 of 3 distinct attempts passed; 2 stable source_quota_exceeded; used<=quota"
else echo "QUOTA-RACE FAIL succ=$QSUCC conf=$QCONF used=$QUSED"; cat "$WORK"/q*.txt; exit 1; fi

echo "== divergent concurrent input (same fresh attempt) =="
ATT2='88888888-8888-8888-8888-888888888888'
UP='{"schemaVersion":1,"origin":"upload","generationId":"'"$GENC"'","recordingScriptSha256":null,"clientAttemptId":"'"$ATT2"'","recorderClock":"none","acceptedSegments":[]}'
TEL='{"schemaVersion":1,"origin":"teleprompter","generationId":"'"$GENC"'","recordingScriptSha256":"'"$SNAP_SHA"'","clientAttemptId":"'"$ATT2"'","recorderClock":"mediarecorder-active-time-ms","acceptedSegments":[{"sceneNumber":1,"startMs":0,"endMs":2000,"intendedDialogueSha256":"'"$DLG_SHA"'"}]}'
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
echo "  (a) broken intent canonical → parity correctly FAILED"
# (a2) break the RECORDING-SCRIPT canonical → the script-snapshot parity MUST fail.
psql -q -f "$WORK/gate_d_fns.sql" >/dev/null   # restore intent canonical first
psql -q -c "create or replace function public.editor_recording_script_canonical(p_generation uuid, p_scene_timeline jsonb, p_selected_hook text) returns text language sql immutable as \$\$ select 'BROKEN' \$\$;"
if node "$HERE/parity_check.mjs" "$WORK/ts.json" >/dev/null 2>&1; then
  echo "NEGATIVE-CONTROL FAIL: broken script canonical still passed parity"; exit 1; fi
echo "  (a2) broken script canonical → parity correctly FAILED"
psql -q -f "$WORK/gate_d_fns.sql" >/dev/null   # restore
# (b) break the validator (no-op, SAME 4-arg signature so it REPLACES rather than
#     overloads) → the REAL assertion GATE (02_assertions.sql) must now FAIL
#     (nonzero). Proves the gate has teeth, not just that one hostile input slips.
psql -q -f "$WORK/gate_d_fns.sql" >/dev/null   # restore canonical
psql -q -c "create or replace function public.editor_validate_capture_input(p jsonb, p_uuid_gen uuid default null, p_uuid_attempt uuid default null, p_allow_server boolean default false) returns void language plpgsql immutable as \$\$ begin return; end \$\$;"
if psql -q -f "$HERE/02_assertions.sql" >/dev/null 2>&1; then
  echo "NEGATIVE-CONTROL FAIL: assertion gate PASSED under a no-op validator"; exit 1; fi
echo "  (b) no-op validator → assertion gate correctly FAILED"
psql -q -f "$WORK/gate_d_fns.sql" >/dev/null   # restore authoritative

# Mutation controls for the round-3 NEW guarantees: MUTATE the authoritative
# extracted source (single-line neutralization of one guard), reload, and confirm
# the REAL gate FAILS. Each mutation targets exactly one guard so all other
# assertions still pass and the gate fails precisely at the round-3 block.
mutate_and_expect_fail(){ # $1 = sed expr, $2 = label
  sed "$1" "$WORK/gate_d_fns.sql" > "$WORK/mutated.sql"
  if diff -q "$WORK/gate_d_fns.sql" "$WORK/mutated.sql" >/dev/null; then
    echo "NEGATIVE-CONTROL FAIL: mutation '$2' changed nothing (guard text moved?)"; exit 1; fi
  psql -q -f "$WORK/mutated.sql" >/dev/null
  if psql -q -f "$HERE/02_assertions.sql" >/dev/null 2>&1; then
    echo "NEGATIVE-CONTROL FAIL: gate PASSED with '$2' guard removed"; psql -q -f "$WORK/gate_d_fns.sql" >/dev/null; exit 1; fi
  echo "  $2"
  psql -q -f "$WORK/gate_d_fns.sql" >/dev/null   # restore authoritative
}
# (c) unknown top-level key guard removed → gate must fail on the unknown-key assertion.
mutate_and_expect_fail "s/raise exception 'capture_intent_unknown_key: %', k;/null;/" \
  "(c) unknown-key guard removed → gate correctly FAILED"
# (d) marker state-machine guard removed → gate must fail on the marker-v2 assertion.
mutate_and_expect_fail "s/raise exception 'source_attempt_conflict: unsupported capture_contract_version % on %', a.capture_contract_version, a.id using errcode = 'raise_exception';/null;/" \
  "(d) marker-v2 guard removed → gate correctly FAILED"
# (e) exact-path descriptor clause neutralized → gate must fail on the exact-path assertion.
mutate_and_expect_fail "s#or a.storage_path is distinct from (p_owner::text || '/' || p_generation::text || '/' || a.id::text || '.' || ext) then#or false then#" \
  "(e) exact-path binding removed → gate correctly FAILED"
# (f) teleprompter-only persist guard neutralized (upload would be recast as script) →
#     gate must fail on the round-4 upload-no-row / upload-create assertions.
mutate_and_expect_fail "s/if p_origin <> 'teleprompter' then return; end if;/if false then return; end if;/" \
  "(f) upload no-captured-script guard removed → gate correctly FAILED"
# (g) not-teleprompter segment guard neutralized → gate must fail on the hidden-scene
#     acceptance assertion (a non-teleprompter scene would slip through).
mutate_and_expect_fail "s/raise exception 'capture_segment_not_teleprompter: scene %', sc using errcode = 'raise_exception';/null;/" \
  "(g) not-teleprompter guard removed → gate correctly FAILED"
# (h) script byte-cap guard neutralized → gate must fail on the oversize assertion.
mutate_and_expect_fail "s/if octet_length(convert_to(p_snap_canonical, 'UTF8')) > 65536 then/if false then/" \
  "(h) script byte-cap guard removed → gate correctly FAILED"
# (i) GLOBAL scene-identity dup guard removed → gate must fail on the hidden+tele dup.
mutate_and_expect_fail "s/raise exception 'capture_script_ambiguous_scene: duplicate scene %', sc using errcode = 'raise_exception';/null;/" \
  "(i) global scene-dup guard removed → gate correctly FAILED"
# (j) conflict-verify persist guard removed → gate must fail on the divergent binding.
mutate_and_expect_fail "s/raise exception 'script_binding_conflict: a divergent script binding already exists for %', p_asset using errcode = 'raise_exception';/null;/" \
  "(j) conflict-verify persist guard removed → gate correctly FAILED"
# (k) backfill inconsistency guard removed → gate must fail on the inconsistent row.
mutate_and_expect_fail "s/raise exception 'capture_backfill_inconsistent: % ready source(s) with a capture intent but no manifest', bad using errcode = 'raise_exception';/null;/" \
  "(k) backfill ready-no-manifest guard removed → gate correctly FAILED"
# (k2)-(k6) each NEW backfill classification guard removed → its negative assertion
#          (which expected capture_backfill_inconsistent) now sees success → gate FAILS.
mutate_and_expect_fail "s/raise exception 'capture_backfill_inconsistent: % manifest(s) without a capture intent', bad using errcode = 'raise_exception';/null;/" \
  "(k2) backfill manifest-without-intent guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'capture_backfill_inconsistent: % script binding(s) without a capture intent', bad using errcode = 'raise_exception';/null;/" \
  "(k3) backfill binding-without-intent guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'capture_backfill_inconsistent: % intent(s) attached to a non-source asset', bad using errcode = 'raise_exception';/null;/" \
  "(k4) backfill intent-on-non-source guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'capture_backfill_inconsistent: % intent owner\/generation linkage mismatch', bad using errcode = 'raise_exception';/null;/" \
  "(k5) backfill intent-linkage guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'capture_backfill_inconsistent: % manifest owner linkage mismatch', bad using errcode = 'raise_exception';/null;/" \
  "(k6) backfill manifest-linkage guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'capture_backfill_inconsistent: % binding owner\/generation linkage mismatch', bad using errcode = 'raise_exception';/null;/" \
  "(k7) backfill binding-linkage guard removed → gate correctly FAILED"
# (k8)-(k13) each NEW provenance-corruption guard removed → its isolated hostile fixture
#            (which expected capture_backfill_inconsistent) now sees success → gate FAILS.
mutate_and_expect_fail "s/raise exception 'capture_backfill_inconsistent: % manifest origin differs from its intent', bad using errcode = 'raise_exception';/null;/" \
  "(k8) manifest-origin guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'capture_backfill_inconsistent: % manifest intent hash differs from its intent', bad using errcode = 'raise_exception';/null;/" \
  "(k9) manifest-intent-hash guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'capture_backfill_inconsistent: % teleprompter intent without exactly one matching script snapshot', bad using errcode = 'raise_exception';/null;/" \
  "(k10) teleprompter-snapshot guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'capture_backfill_inconsistent: % upload intent carries a script snapshot', bad using errcode = 'raise_exception';/null;/" \
  "(k11) upload-no-snapshot guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'capture_backfill_inconsistent: % stored intent hash does not recompute', bad using errcode = 'raise_exception';/null;/" \
  "(k12) stored-intent-hash guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'capture_backfill_inconsistent: % stored intent JSON\/relational mismatch', bad using errcode = 'raise_exception';/null;/" \
  "(k13) stored-intent-relational guard removed → gate correctly FAILED"
# (p1)-(p7) D2 authorities: ready-flip guard + manifest writer. Each removed guard makes
# its hostile fixture pass through, so the REAL assertion gate must FAIL.
mutate_and_expect_fail "s/if not has_manifest then/if false then/" \
  "(p1) ready-flip manifest guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'capture_manifest_no_intent: asset % has no capture intent', p_asset;/null;/" \
  "(p2) manifest no-intent guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'capture_manifest_owner_mismatch: intent owner does not match asset % owner', p_asset;/null;/" \
  "(p3) manifest owner-mismatch guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'capture_manifest_origin_mismatch: intent % vs manifest %', intent_row.origin, p_origin;/null;/" \
  "(p4) manifest origin-mismatch guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'capture_manifest_intent_mismatch: manifest not bound to the stored intent';/null;/" \
  "(p5) manifest intent-hash guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'capture_manifest_conflict: a divergent manifest already exists for %', p_asset;/null;/" \
  "(p6) manifest pre-existing-divergent guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'capture_manifest_conflict: settled asset % has a divergent manifest', p_asset;/null;/" \
  "(p7) manifest settled-divergent guard removed → gate correctly FAILED"
# (v1)-(v6) D2 atomic editor_validate_source guards. Each removed → its hostile fixture
# passes through → the real assertion gate FAILS.
mutate_and_expect_fail "s/raise exception 'source_validate_window_out_of_bounds: segment \[%,%\] vs duration %', s_start, s_end, p_duration_ms using errcode = 'raise_exception';/null;/" \
  "(v1) validate window-bounds guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'source_validate_sha_mismatch: stored % vs probed %', a.content_sha256, p_content_sha using errcode = 'raise_exception';/null;/" \
  "(v2) validate sha-reconcile guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'source_validate_size_mismatch: stored % vs probed %', a.size_bytes, p_size_bytes using errcode = 'raise_exception';/null;/" \
  "(v3) validate size-reconcile guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'source_validate_conflict: ready asset % has divergent validated facts', p_asset using errcode = 'raise_exception';/null;/" \
  "(v4) validate idempotent-divergent guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'source_validate_no_intent: %', p_asset using errcode = 'raise_exception';/null;/" \
  "(v5) validate no-intent guard removed → gate correctly FAILED"
mutate_and_expect_fail "s/raise exception 'source_validate_bad_duration: %', p_duration_ms using errcode = 'raise_exception';/null;/" \
  "(v6) validate bad-duration guard removed → gate correctly FAILED"

echo "== identity negative controls (RLS/privilege/service-role/warning must have teeth) =="
# (l) manifest RLS disabled → an outsider sees the owner's manifest → identity FAILS.
psql -q -c "alter table public.source_capture_manifests disable row level security;"
if identity_run "$HERE/03_identity.sql"; then
  echo "NEGATIVE-CONTROL FAIL: identity PASSED with manifest RLS disabled"; \
  psql -q -c "alter table public.source_capture_manifests enable row level security;"; exit 1; fi
psql -q -c "alter table public.source_capture_manifests enable row level security;"
echo "  (l) manifest RLS disabled → identity correctly FAILED"
# (m) manifest write-denial is defended by TWO layers: no INSERT grant AND RLS with no
#     INSERT policy. Break BOTH (grant INSERT + a permissive WITH CHECK policy) so an
#     authenticated INSERT actually SUCCEEDS → the write-denial assertion FAILS → identity
#     FAILS. Proves the manifest privilege posture is a real, non-vacuous check.
psql -q -c "grant insert on public.source_capture_manifests to authenticated; create policy scm_ins_mut on public.source_capture_manifests for insert with check (true);"
restore_m(){ psql -q -c "drop policy if exists scm_ins_mut on public.source_capture_manifests; revoke insert on public.source_capture_manifests from authenticated;"; }
if identity_run "$HERE/03_identity.sql"; then
  echo "NEGATIVE-CONTROL FAIL: identity PASSED with authenticated able to INSERT manifests"; restore_m; exit 1; fi
restore_m
echo "  (m) authenticated INSERT on manifests → identity correctly FAILED"
# (n) service-role MASQUERADE: neutralize the role switch in service_write() so the
#     write would run as the connecting superuser → the current_role/is_superuser
#     anti-masquerade assertion must fire IDENTITY_FAIL.
sed "s/set local role service_role;/perform 1;/" "$HERE/03_identity.sql" > "$WORK/id_masq.sql"
if diff -q "$HERE/03_identity.sql" "$WORK/id_masq.sql" >/dev/null; then
  echo "NEGATIVE-CONTROL FAIL: masquerade mutation changed nothing"; exit 1; fi
if identity_run "$WORK/id_masq.sql"; then
  echo "NEGATIVE-CONTROL FAIL: identity PASSED while service_role write ran as superuser"; exit 1; fi
echo "  (n) service_role role-switch removed → identity correctly FAILED (no superuser masquerade)"
# (o) WARNING gate: inject the exact original bug — a bare top-level SET LOCAL ROLE,
#     which PostgreSQL ignores with a WARNING → identity_run must fail on the warning.
{ echo 'set local role service_role;'; echo 'reset role;'; cat "$HERE/03_identity.sql"; } > "$WORK/id_warn.sql"
if identity_run "$WORK/id_warn.sql"; then
  echo "NEGATIVE-CONTROL FAIL: identity PASSED despite a PostgreSQL WARNING"; exit 1; fi
echo "  (o) bare SET LOCAL ROLE warning → identity correctly FAILED"

echo "GATE-D LOCAL VERIFICATION: PASS"
