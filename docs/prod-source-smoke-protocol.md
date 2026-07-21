# Production source-validation smoke — two-stage operational protocol

**Status:** operator protocol for `.github/workflows/prod-source-smoke.yml`.
This workflow touches production and is **operator-run only** (workflow_dispatch,
main-only, protected `production` environment with required review).

## Why a passing smoke ends with a RED workflow

The probe creates durable production artifacts (a Storage object, a
`media_assets` row, a `generations.source_asset_id` pointer, and service-side
`validate_source` job/event state). **None of them are client-removable** — the
`takes` bucket has no DELETE policy (see
`scripts/ci/check_takes_delete_policy.mjs` and the authoritative
`scripts/prod-smoke/verify_takes_policy_live.sql`), and the DB rows/jobs are
service-side. In particular `validation_job_events` has **no supported client
read path**, so its residue state is always `unknown`.

Because the residue accounting fails closed on anything not confirmed absent, an
attempted-create smoke **can never exit 0**. The workflow's overall conclusion is
therefore **RED by design**. A red conclusion here is **not** a failed functional
smoke and **must never be described as a conventional passing smoke**.

## The two stages

### Stage 1 — functional-chain evidence (this is the pass signal)
`scripts/prod-smoke/smoke_chain.mjs` runs the real chain: sign in → create →
parse → signed PUT → finalize → poll `ready` → verify the preserved metadata
merge → confirm the generation pointer links to the probe asset. On success it
emits `FUNCTIONAL-CHAIN: PASS` and persists `PROBE_FUNCTIONAL_CHAIN=pass`.

**Exact evidence that proves the functional chain passed** (all required):
- Stage-1 step conclusion = **success** (green), and job summary shows
  `Stage 1 (functional chain): pass`.
- `PROBE_FUNCTIONAL_CHAIN=pass` in the environment.
- The step log shows the asset reached `status=ready`, `verifyReadyRow` passed
  (finalized_etag present, finalized_bytes > 0, probe_facts.frame_rate,
  container/video_codec/audio_codec present, editor_eligible=true, 64-char
  sha256, duration_ms > 1500, has_audio, 320×240, rotation 0), and the
  generation pointer equals the probe asset id.

If Stage 1 is **not** `pass`, the run is a **real** smoke failure (the workflow
emits a `::warning::`), not the expected residue-only red.

### Stage 2 — recoverable-artifact handoff (intentionally nonzero)
`scripts/prod-smoke/residue_flow.mjs` runs `if: always()`. It OBSERVES each
artifact honestly (only a documented Storage 404 or a valid empty PostgREST
array yields "confirmed absent"; 400/401/403/5xx/network/malformed → `unknown`)
and prints a **RECOVERABLE-ARTIFACT REPORT**, then exits nonzero. This is the
handoff, not a failure of the product.

### Stage 3 — sanctioned operator retention cleanup (out of band)
Using the recoverable-artifact report, the operator removes the probe artifacts
through the sanctioned service-side retention path (service-role delete of the
Storage object + `media_assets` row + generation pointer reset + validate_source
job/event cleanup). The workflow never does this (least privilege; no DELETE
policy; no service key).

### Stage 4 — supported zero-delta verification
Re-run the A2 zero-delta query (editor-row counts for the probe identity) and the
authoritative `verify_takes_policy_live.sql`, and confirm counts returned to
baseline — proving the artifacts were removed and the policy posture holds.

## Definition of done for a production sign-off run
1. Stage 1 = `pass` with the exact evidence above.
2. Stage 2 produced a recoverable-artifact report (expected nonzero).
3. Stage 3 operator cleanup completed.
4. Stage 4 zero-delta verification returned to baseline.

Only when **all four** hold is the source-chain posture signed off. CI being
green on the PR, or this workflow being red, says nothing on its own — the
verdict is the four stages above.

## Test coverage
`scripts/prod-smoke/residue_harness.mjs` drives both modules with injected
failures at the create / parse / PUT / finalize / classifier / reporter / exit
boundaries, asserts persisted recovery state, and asserts the protocol
invariant: **functional chain green + residue accounting red (nonzero by
design)**.
