# Gate-D local DB verification (Constitution §10D)

Offline, reproducible proof of the atomic source-create RPC and the DB↔TS
canonical-intent parity — no shared staging, no network. Run against an
ephemeral local PostgreSQL 16.

**Authoritative copy of the functions is `supabase/migrations/0091_editor_capture_hardening.sql`.**
The `01_canonical.sql` / `02_create_rpc.sql` here mirror that migration's Gate-D
functions verbatim so they can be exercised without the full Supabase schema
(auth/storage/workspace_peers). `00_schema_subset.sql` is a faithful subset of
`media_assets` / `generations` / `source_capture_intents` (real attempt unique
index, status-transition guard, append-only trigger, marker CHECK).

## What it proves

- **`editor_capture_intent_canonical` / `editor_capture_intent_sha256`** emit
  byte-identical output to shared `canonicalJson(SourceCaptureIntentV1)` and the
  same SHA-256 (checked by `parity.mjs`, incl. Unicode/control escaping).
- **`editor_create_source_asset`** (`03_create_tests.sql`):
  - T1 first create → exactly one asset + one intent, marker=1, `created=true`
  - T2 identical retry → idempotent, `created=false`, still one asset + one intent
  - T3 divergent retry (same attempt) → `capture_intent_conflict`
  - T4 ownership mismatch → `source_generation_not_owned`, zero orphan rows
  - T5 quota exceeded on a new attempt → `source_quota_exceeded`, zero orphan rows
  - T6 embedded generation/attempt mismatch → stable mismatch code
  - Concurrency: 5 simultaneous same-attempt creates → one `created=true`, four
    `created=false`, all the SAME asset id; exactly one asset + one intent.

## Run

```bash
scripts/db-tests/gate-d/run.sh
```

Requires the `postgresql-16` server binaries and `node` (for the parity check).
The script stands up a throwaway cluster under a temp dir, loads the subset +
functions, runs the assertions, prints results, and tears the cluster down.
