#!/usr/bin/env bash
# Gate-TC-Lineage — ephemeral-Postgres verification of the creative-transfer lineage (0095).
#
# Track C · Batch A.7, the half migration 0095 alone does not prove. It applies the
# REAL migration text — not a paraphrase — to a throwaway database and checks the
# properties the contract depends on:
#
#   * append-only: UPDATE and DELETE are refused on all four tables, for the
#     OWNER of the database (i.e. the role service_role stands in for), because
#     triggers ignore RLS and that is the whole point of putting the guard here;
#   * lineage integrity: a plan cannot pin a digest the referenced row does not
#     carry, and cannot pin an intent belonging to another generation;
#   * client access: authenticated may SELECT and may NOT INSERT/UPDATE/DELETE;
#   * digest shape: a non-sha256 value is rejected by CHECK.
#
# Every positive is paired with the negative that makes it non-vacuous, and there
# is a MUTATION CONTROL: with the append-only trigger dropped, the UPDATE that
# must fail starts succeeding — proving the gate is the trigger and not an
# accident of the schema.
set -euo pipefail
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG="$REPO/supabase/migrations/0095_creative_transfer_lineage.sql"
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

SHA_A="$(printf 'a%.0s' $(seq 1 64))"
SHA_B="$(printf 'b%.0s' $(seq 1 64))"
SHA_C="$(printf 'c%.0s' $(seq 1 64))"
# The two evidence digests are DELIBERATELY DIFFERENT. `evidence_sha256` digests
# the canonical normalized evidence; `analysis_sha256` digests the upstream
# analysis bytes the plan pins as `analysisSha256`. The earlier fixture used one
# value for both, so a trigger comparing the WRONG column still passed — the
# test proved the fixture's coincidence, not the lineage. Keeping them distinct
# is what makes the conflation control below able to fail.
SHA_EV="$(printf 'e%.0s' $(seq 1 64))"   # normalized evidence bytes  (owner 1)
SHA_AN="$(printf 'f%.0s' $(seq 1 64))"   # upstream analysis bytes    (owner 1)
SHA_EV9="$(printf '1%.0s' $(seq 1 64))"  # normalized evidence bytes  (owner 9)
SHA_AN9="$(printf '2%.0s' $(seq 1 64))"  # upstream analysis bytes    (owner 9)

# Stand-ins for the objects 0095 references but does not create. The migration is
# applied VERBATIM; only its external dependencies are faked, so nothing about the
# guards themselves is paraphrased.
bootstrap(){
  psql -q -v ON_ERROR_STOP=1 <<SQL
drop schema if exists auth cascade;
drop table if exists public.creative_transfer_plans cascade;
drop table if exists public.campaign_intents cascade;
drop table if exists public.reference_evidence_sets cascade;
drop table if exists public.brand_truth_snapshots cascade;
drop table if exists public.generations cascade;
drop table if exists public.brand_voices cascade;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as \$\$ select null::uuid \$\$;
create table public.brand_voices (id uuid primary key);
create table public.generations (id uuid primary key);
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end \$\$;
insert into auth.users values ('11111111-1111-4111-8111-111111111111');
insert into auth.users values ('99999999-9999-4999-8999-999999999999');
insert into public.brand_voices values ('22222222-2222-4222-8222-222222222222');
insert into public.generations values ('33333333-3333-4333-8333-333333333333');
insert into public.generations values ('44444444-4444-4444-8444-444444444444');
SQL
}

seed(){
  psql -q -v ON_ERROR_STOP=1 <<SQL
insert into public.brand_truth_snapshots (id, owner_id, brand_voice_id, snapshot, snapshot_sha256)
values ('aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222','{"schemaVersion":1}'::jsonb,'$SHA_A');
insert into public.campaign_intents (id, owner_id, generation_id, intent, intent_sha256)
values ('bbbbbbbb-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333','{"schemaVersion":1}'::jsonb,'$SHA_B');
insert into public.reference_evidence_sets (owner_id, reference_id, analysis_id, evidence, evidence_sha256, analysis_sha256)
values ('11111111-1111-4111-8111-111111111111','ref-1','ana-1','{"schemaVersion":1}'::jsonb,'$SHA_EV','$SHA_AN');
-- A SECOND OWNER with their own evidence, so cross-owner reuse is testable.
insert into public.reference_evidence_sets (owner_id, reference_id, analysis_id, evidence, evidence_sha256, analysis_sha256)
values ('99999999-9999-4999-8999-999999999999','ref-9','ana-9','{"schemaVersion":1}'::jsonb,'$SHA_EV9','$SHA_AN9');
SQL
}

# EVERY append-only case must run against a NON-EMPTY table.
#
# This is not defensive tidiness. The first run of this gate reported
# "UPDATE reference_evidence_sets ACCEPTED" — because that table was still empty,
# so an UPDATE matched zero rows, fired no FOR EACH ROW trigger, and returned
# success. The guard was present and working; the test was vacuous. A row-count
# assertion turns that failure mode into a loud one instead of a silent pass in
# the other direction.
require_rows(){
  local t="$1" n
  n="$(psql -tAc "select count(*) from public.$t")"
  if [ "${n:-0}" -lt 1 ]; then
    echo "GATE-TC-LINEAGE FAIL: public.$t is empty, so an UPDATE/DELETE against it fires no row trigger."
    echo "             Any 'rejected' result for it would be meaningless."
    exit 1
  fi
}

run(){ psql -q -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; }
ok(){ if run "$1"; then echo "  ok: $2"; else echo "GATE-TC-LINEAGE FAIL: legitimate statement REJECTED ($2)"; psql -c "$1" 2>&1 | tail -3; exit 1; fi; }
no(){ if run "$1"; then echo "GATE-TC-LINEAGE FAIL: forbidden statement ACCEPTED ($2)"; exit 1; else echo "  rejected: $2"; fi; }

bootstrap
psql -q -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null
seed

# A plan whose referenceSet matches the evidence row seeded above. `mkplan`
# builds one from explicit parts so each hostile case varies exactly ONE field
# instead of relying on fragile string substitution.
mkplan(){ # $1 referenceId  $2 analysisId  $3 analysisSha256  $4 owner
  local ref="$1" ana="$2" dig="$3" own="${4:-11111111-1111-4111-8111-111111111111}"
  cat <<SQLP
insert into public.creative_transfer_plans
 (owner_id, generation_id, brand_truth_snapshot_id, brand_truth_sha256,
  campaign_intent_id, campaign_intent_sha256, plan, plan_sha256, model_identity, prompt_version)
 values ('$own','33333333-3333-4333-8333-333333333333',
  'aaaaaaaa-0000-4000-8000-000000000001','$SHA_A',
  'bbbbbbbb-0000-4000-8000-000000000001','$SHA_B',
  '{"schemaVersion":1,"referenceSet":[{"referenceId":"$ref","analysisId":"$ana","analysisSha256":"$dig"}]}'::jsonb,
  '$SHA_C','m','p')
SQLP
}
INS_PLAN="$(mkplan ref-1 ana-1 "$SHA_AN")"

echo "== positive: a well-formed lineage inserts =="
ok "$INS_PLAN" "plan with digests matching both pinned rows and owned evidence"

echo "== lineage integrity (pinned snapshot/intent digests) =="
no "${INS_PLAN/\'$SHA_A\',/\'$SHA_C\',}" "plan pinning a brand-truth digest the snapshot does not carry"
no "${INS_PLAN/\'$SHA_B\',/\'$SHA_C\',}" "plan pinning a campaign-intent digest the intent does not carry"
no "${INS_PLAN/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444}" \
   "plan whose generation differs from its pinned intent's generation"

echo "== plan -> evidence lineage (service_role cannot bypass it) =="
# Each of these varies exactly ONE field of the referenceSet.
no "$(mkplan ref-1 ana-forged "$SHA_AN")" "referenceSet names an analysis nobody owns"
no "$(mkplan ref-1 ana-1 "$SHA_C")"       "referenceSet pins an analysis digest never issued"
no "$(mkplan ref-forged ana-1 "$SHA_AN")" "referenceSet names a reference id the evidence row does not carry"
# CROSS-OWNER: another account's evidence must not satisfy this owner's plan.
no "$(mkplan ref-9 ana-9 "$SHA_AN9")"     "referenceSet cites ANOTHER owner's evidence"

# ---- THE CONFLATION CONTROL ------------------------------------------------
#
# `analysisSha256` pins the UPSTREAM ANALYSIS bytes. This plan pins the row's
# NORMALIZED-EVIDENCE digest instead — a real digest, on the right row, owned by
# the right owner, for the right analysis. It is wrong only in WHICH artifact it
# identifies.
#
# This is the case the previous fixture could not express: it used one value for
# both columns, so a trigger comparing `evidence_sha256` passed identically to
# one comparing `analysis_sha256`. With the two deliberately distinct, this line
# fails if and only if the trigger reads the correct column.
no "$(mkplan ref-1 ana-1 "$SHA_EV")"      "referenceSet pins the NORMALIZED-EVIDENCE digest where the ANALYSIS digest belongs"
# …and the mirror: the analysis digest must not be accepted as the evidence one.
ok "select 1 from public.reference_evidence_sets
    where reference_id = 'ref-1' and evidence_sha256 = '$SHA_EV' and analysis_sha256 = '$SHA_AN'
      and evidence_sha256 <> analysis_sha256" \
   "CONTROL: the seeded row really does carry two DIFFERENT digests"
# An absent referenceSet is refused rather than treated as nothing-to-check.
no "insert into public.creative_transfer_plans
 (owner_id, generation_id, brand_truth_snapshot_id, brand_truth_sha256,
  campaign_intent_id, campaign_intent_sha256, plan, plan_sha256, model_identity, prompt_version)
 values ('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333',
  'aaaaaaaa-0000-4000-8000-000000000001','$SHA_A',
  'bbbbbbbb-0000-4000-8000-000000000001','$SHA_B','{}'::jsonb,'$SHA_C','m','p')" \
  "plan with no referenceSet at all"

echo "== append-only (as the table owner; triggers ignore RLS) =="
for t in brand_truth_snapshots campaign_intents reference_evidence_sets creative_transfer_plans; do
  require_rows "$t"
done
no "update public.brand_truth_snapshots set snapshot = '{}'::jsonb" "UPDATE brand_truth_snapshots"
no "delete from public.brand_truth_snapshots" "DELETE brand_truth_snapshots"
no "update public.campaign_intents set intent = '{}'::jsonb" "UPDATE campaign_intents"
no "delete from public.campaign_intents" "DELETE campaign_intents"
no "update public.creative_transfer_plans set plan = '{}'::jsonb" "UPDATE creative_transfer_plans"
no "delete from public.creative_transfer_plans" "DELETE creative_transfer_plans"
no "update public.reference_evidence_sets set evidence = '{}'::jsonb" "UPDATE reference_evidence_sets"

echo "== digest shape =="
no "insert into public.brand_truth_snapshots (owner_id, snapshot, snapshot_sha256)
    values ('11111111-1111-4111-8111-111111111111','{}'::jsonb,'not-a-digest')" "non-sha256 digest"
no "insert into public.brand_truth_snapshots (owner_id, snapshot, snapshot_sha256)
    values ('11111111-1111-4111-8111-111111111111','[]'::jsonb,'$SHA_C')" "snapshot that is not an object"

echo "== one normalized evidence set per analysis =="
ok "insert into public.reference_evidence_sets (owner_id, reference_id, analysis_id, evidence, evidence_sha256, analysis_sha256)
    values ('11111111-1111-4111-8111-111111111111','ref-2','ana-2','{}'::jsonb,'$SHA_A','$SHA_B')" "a set for a NEW analysis"
no "insert into public.reference_evidence_sets (owner_id, reference_id, analysis_id, evidence, evidence_sha256, analysis_sha256)
    values ('11111111-1111-4111-8111-111111111111','ref-1','ana-1','{}'::jsonb,'$SHA_B','$SHA_C')" "second set for the SAME analysis (ana-1, seeded)"

echo "== the analysis digest is a required, well-formed column =="
# NOT NULL and the hex constraint are what stop `analysis_sha256` degrading into
# an optional field that the lineage join then silently never matches.
no "insert into public.reference_evidence_sets (owner_id, reference_id, analysis_id, evidence, evidence_sha256)
    values ('11111111-1111-4111-8111-111111111111','ref-3','ana-3','{}'::jsonb,'$SHA_A')" "evidence row with NO analysis_sha256"
no "insert into public.reference_evidence_sets (owner_id, reference_id, analysis_id, evidence, evidence_sha256, analysis_sha256)
    values ('11111111-1111-4111-8111-111111111111','ref-3','ana-3','{}'::jsonb,'$SHA_A','not-a-digest')" "evidence row with a malformed analysis_sha256"

echo "== client role: read yes, write no =="
# RLS is FORCEd, so even a table owner is subject to policy when acting as the
# client role. `authenticated` has SELECT granted and nothing else.
ok "set role authenticated; select 1 from public.creative_transfer_plans limit 1; reset role" \
   "authenticated may SELECT"
no "set role authenticated; insert into public.brand_truth_snapshots (owner_id, snapshot, snapshot_sha256)
    values ('11111111-1111-4111-8111-111111111111','{}'::jsonb,'$SHA_C'); reset role" \
   "authenticated may NOT INSERT a brand truth snapshot"
no "set role authenticated; update public.creative_transfer_plans set plan = '{}'::jsonb; reset role" \
   "authenticated may NOT UPDATE a plan"
no "set role authenticated; delete from public.creative_transfer_plans; reset role" \
   "authenticated may NOT DELETE a plan"
no "set role anon; select 1 from public.creative_transfer_plans limit 1; reset role" \
   "anon may not read at all"

echo "== MUTATION CONTROL: without the trigger, the UPDATE succeeds =="
# Without this, every append-only case above could be passing for some unrelated
# reason and the trigger could be doing nothing.
psql -q -c "drop trigger creative_transfer_plans_append_only on public.creative_transfer_plans;"
if run "update public.creative_transfer_plans set model_identity = 'mutated'"; then
  echo "  ok: with the guard removed the UPDATE goes through — the trigger is what refuses it"
else
  echo "GATE-TC-LINEAGE FAIL: the UPDATE still failed with the append-only trigger dropped."
  echo "             The append-only cases above are therefore NOT testing that trigger."
  exit 1
fi

echo "GATE-TC-LINEAGE PASS"
