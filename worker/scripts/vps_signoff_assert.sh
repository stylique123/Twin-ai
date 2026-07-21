#!/usr/bin/env bash
# Fail-closed assertion authority for the Phase-5 VPS sign-off snapshot.
#
# .github/workflows/vps-diag.yml captures OBS_* facts over SSH (defensively, so
# it always emits a full fact set) and this script is the SINGLE decision point:
# it asserts every OBS_* against its EXP_* expectation and exits NON-ZERO on any
# mismatch. There is no echo-fallback that can let a bad state read as green — a
# missing worker, wrong SHA/registry/model, a test-manifest override, Revideo
# presence, a :4500 listener, or legacy env each fails the check.
#
#   bash worker/scripts/vps_signoff_assert.sh            # assert OBS_* vs EXP_* from env
#   bash worker/scripts/vps_signoff_assert.sh --selftest # prove good passes and each bad fails
set -uo pipefail

# order-insensitive, quote/bracket-insensitive normalization of a job-type list
_norm() { printf '%s' "${1:-}" | tr ',' '\n' | tr -d '][" ' | sed '/^[[:space:]]*$/d' | sort | paste -sd, -; }

run_assertions() {
  local fails=0
  _f() { echo "  ASSERT FAIL: $*" >&2; fails=$((fails + 1)); }

  [ -n "${EXP_SHA:-}" ]      || _f "EXP_SHA not provided"
  [ -n "${EXP_REVISION:-}" ] || _f "EXP_REVISION not provided"
  [ -n "${EXP_BUNDLE:-}" ]   || _f "EXP_BUNDLE not provided"
  [ -n "${EXP_REGISTRY:-}" ] || _f "EXP_REGISTRY not provided"

  [ "${OBS_SHA:-}" = "${EXP_SHA:-}" ]        || _f "deployed SHA '${OBS_SHA:-}' != expected '${EXP_SHA:-}'"
  [ "${OBS_STATUS:-}" = "running" ]          || _f "container status '${OBS_STATUS:-}' != running"
  [ "${OBS_HEALTH:-}" = "healthy" ]          || _f "container health '${OBS_HEALTH:-}' != healthy"
  [ "${OBS_RESTARTS:-}" = "0" ]              || _f "restart count '${OBS_RESTARTS:-}' != 0 (restart loop)"
  [ "$(_norm "${OBS_REGISTRY:-}")" = "$(_norm "${EXP_REGISTRY:-}")" ] \
      || _f "active registry [$(_norm "${OBS_REGISTRY:-}")] != expected [$(_norm "${EXP_REGISTRY:-}")]"
  [ -z "${OBS_JOBTYPES_OVERRIDE:-}" ]        || _f "WORKER_JOB_TYPES override present on box: '${OBS_JOBTYPES_OVERRIDE:-}'"
  [ "${OBS_REVISION:-}" = "${EXP_REVISION:-}" ] || _f "model revision '${OBS_REVISION:-}' != expected '${EXP_REVISION:-}'"
  [ "${OBS_BUNDLE:-}" = "${EXP_BUNDLE:-}" ]  || _f "analyzer bundle '${OBS_BUNDLE:-}' != expected '${EXP_BUNDLE:-}'"
  [ "${OBS_VERIFY_RC:-}" = "0" ]             || _f "fetch_model --verify-only rc '${OBS_VERIFY_RC:-}' != 0"
  [ -z "${OBS_TEST_ALLOW:-}" ]               || _f "EDITOR_ALLOW_TEST_MODEL_MANIFEST set (test override): '${OBS_TEST_ALLOW:-}'"
  [ -z "${OBS_TEST_MANIFEST:-}" ]            || _f "EDITOR_SPEECH_MODEL_MANIFEST set (test override): '${OBS_TEST_MANIFEST:-}'"
  [ "${OBS_REVIDEO:-1}" = "0" ]              || _f "Revideo artifacts present (count '${OBS_REVIDEO:-}')"
  [ "${OBS_PORT4500:-1}" = "0" ]             || _f "port 4500 listener present (count '${OBS_PORT4500:-}')"
  [ "${OBS_LEGACY_ENV:-1}" = "0" ]           || _f "legacy editor/Revideo env present (count '${OBS_LEGACY_ENV:-}')"

  [ "$fails" -eq 0 ]
}

_good_env() {
  export EXP_SHA=abc123 EXP_REVISION=rev1 EXP_BUNDLE=speech-6
  export EXP_REGISTRY="ingest,build_voice,scrape_dna,validate_source,editor_v2"
  export OBS_SHA=abc123 OBS_STATUS=running OBS_HEALTH=healthy OBS_RESTARTS=0
  # deliberately different order + JSON quoting to prove order/quote-insensitivity:
  export OBS_REGISTRY='"editor_v2","ingest","scrape_dna","build_voice","validate_source"'
  export OBS_JOBTYPES_OVERRIDE="" OBS_REVISION=rev1 OBS_BUNDLE=speech-6 OBS_VERIFY_RC=0
  export OBS_TEST_ALLOW="" OBS_TEST_MANIFEST="" OBS_REVIDEO=0 OBS_PORT4500=0 OBS_LEGACY_ENV=0
}

selftest() {
  local failed=0
  if ( _good_env; run_assertions ) >/dev/null 2>&1; then echo "  ok: good state passes"
  else echo "SELFTEST FAIL: good state did not pass"; failed=1; fi

  # Each entry mutates ONE field to a bad value; run_assertions MUST fail.
  local bad=(
    "OBS_SHA=deadbeef|wrong deployed SHA"
    "OBS_STATUS=exited|container not running"
    "OBS_HEALTH=unhealthy|container unhealthy"
    "OBS_RESTARTS=4|restart loop"
    "OBS_REGISTRY=ingest,build_voice|registry missing types"
    "OBS_REGISTRY=ingest,build_voice,scrape_dna,validate_source,editor_v2,render_v2|registry has extra type"
    "OBS_JOBTYPES_OVERRIDE=ingest,transcribe|WORKER_JOB_TYPES override present"
    "OBS_REVISION=badrev|wrong model revision"
    "OBS_BUNDLE=speech-7|wrong analyzer bundle"
    "OBS_VERIFY_RC=1|verify-only failed"
    "OBS_TEST_ALLOW=true|test-manifest override allowed"
    "OBS_TEST_MANIFEST=/tmp/x.json|test-manifest override set"
    "OBS_REVIDEO=1|Revideo present"
    "OBS_PORT4500=1|port 4500 listener present"
    "OBS_LEGACY_ENV=2|legacy env present"
  )
  local spec kv desc
  for spec in "${bad[@]}"; do
    kv="${spec%%|*}"; desc="${spec#*|}"
    if ( _good_env; export "${kv%%=*}"="${kv#*=}"; run_assertions ) >/dev/null 2>&1; then
      echo "SELFTEST FAIL: bad state PASSED (should fail) — $desc"; failed=1
    else
      echo "  ok: bad state fails — $desc"
    fi
  done

  if [ "$failed" -ne 0 ]; then echo "vps-signoff-assert selftest: FAILURES"; exit 1; fi
  echo "vps-signoff-assert selftest: all cases passed"; exit 0
}

if [ "${1:-}" = "--selftest" ]; then
  selftest
fi

if run_assertions; then
  echo "vps-signoff-assert: ALL ASSERTIONS PASSED (fail-closed sign-off snapshot)"
  exit 0
else
  echo "vps-signoff-assert: FAILED — the VPS snapshot does not meet sign-off expectations" >&2
  exit 1
fi
