# Gate-D local DB verification (Constitution §10D)

Offline, reproducible, fail-closed proof of the atomic source-create RPC and the
DB↔TS canonical-intent parity — no shared staging, no network. Runs against an
ephemeral local PostgreSQL 16 and **exits non-zero if any guarantee fails**.

**`supabase/migrations/0091_editor_capture_hardening.sql` is the single source of
truth.** `run.sh` extracts the Gate-D functions from that file (between the
`GATE-D-FUNCTIONS-BEGIN/END` markers) and loads them verbatim — there is no
hand-copied mirror to drift, and the run aborts if extraction finds nothing.
`00_schema_subset.sql` is a faithful subset of `media_assets` / `generations` /
`source_capture_intents` (real attempt unique index, status-transition guard,
append-only trigger, marker CHECK) plus the standard Supabase roles.

## What it proves (all assertions fail-closed under `ON_ERROR_STOP`)

- **Full-contract DB authority** — `editor_validate_capture_input` independently
  re-enforces the COMPLETE `SourceCaptureIntentInputV1` contract with the same
  stable codes as shared `capture.ts`: object/schemaVersion, uuids, origin
  shapes, segment array/type/≤200, per-segment integer scene/start/end, scene≥1,
  duration≥250, strict order/non-overlap, duplicate-scene, 64-hex dialogue SHA,
  exact upload null/none/empty (`02_assertions.sql` hostile matrix).
- **Canonical parity** — `editor_capture_intent_canonical/_sha256` emit
  byte-identical output to shared `canonicalJson(SourceCaptureIntentV1)` and the
  same SHA-256 (`parity_driver.ts` → `parity_check.mjs`).
- **Escaping parity** — `escaping_parity.mjs` proves `to_jsonb(text)::text`
  matches `JSON.stringify` for hostile strings (quotes/backslash/control/
  Unicode/emoji/`$`-delimiter). NOTE: the real stored fields are bounded ASCII
  (uuids / 64-hex / enums / ISO timestamp) — a real intent never carries
  arbitrary Unicode; this proves the serializer would stay correct regardless.
- **`editor_create_source_asset`** — first create (one asset + one intent,
  marker=1, `created=true`, stored `sourceAssetId`/`recordedAt` present, sha
  recomputes); identical retry idempotent; divergent retry → conflict; ownership
  → `source_generation_not_owned` (no orphan); policy → `source_policy_bucket/
  mime/size`; `source_too_many_open` / `source_quota_exceeded` (server policy, no
  orphan); embedded id mismatch → stable code.
- **Real concurrency** — 5 simultaneous same-attempt creates → one
  `created=true`, four `created=false`, all the SAME asset id + sha; exactly one
  asset + one intent. Divergent concurrent input → exactly one intent, the loser
  gets `capture_intent_conflict`.
- **Grant posture** — every Gate-D helper is `service_role`-only; anon /
  authenticated are denied EXECUTE.
- **Negative controls (mutation tests)** — the harness intentionally breaks the
  canonical serializer (parity must then FAIL) and the validator (a hostile input
  must then slip through), proving the checks have teeth. If a broken guarantee
  still "passes", `run.sh` exits non-zero.

## Run

```bash
scripts/db-tests/gate-d/run.sh   # prints "GATE-D LOCAL VERIFICATION: PASS"
```

Requires the `postgresql-16` server binaries and `node`. The script stands up a
throwaway cluster under a temp dir, loads the subset + extracted functions, runs
every assertion, and tears the cluster down.
