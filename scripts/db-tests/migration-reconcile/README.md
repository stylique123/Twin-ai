# migration-reconcile — ledger reconciliation guard for migrations 0090–0093

## The problem

Migrations `0090`–`0093` are **applied** to staging, but only `0090` is recorded in
`supabase_migrations.schema_migrations`. `.github/workflows/staging-integration.yml`
applies them with `psql -f` rather than the migration tool, so the schema advanced
while the ledger did not. The ledger under-reports reality.

The fix is a **ledger-only repair** — `supabase migration repair`, rows only, no
schema change. But recording "0093 is applied" is a lie unless staging's schema
actually *is* what committed `0093` produces. So the repair is gated behind a
proof.

## Order of operations

```
build EXPECTED (disposable DB)  →  read STAGING (read-only)  →  compare  →  [gate]  →  repair ledger rows
```

Expected state is built by applying the committed migrations to a throwaway local
PostgreSQL cluster with no network surface. **Staging is only ever read**, through
catalog queries, in a transaction the server itself marks read-only. Nothing is
applied to staging, and in particular nothing is applied *before* deciding whether
drift exists.

## Why the previous implementation was deleted

It re-applied the migrations **to live staging** and compared the schema before and
after. Four things were wrong with that, and none of them are fixable by patching:

1. **It performed the dangerous action first.** A safety check that mutates the
   thing it is checking, in order to decide whether mutating was safe, has no
   safe failure mode.
2. **Additive drift was structurally invisible.** Idempotent re-application never
   *removes* an extra column, index, constraint or grant. So `BEFORE == AFTER`
   held for a database carrying extra objects, and the ledger got repaired
   against a schema that did not match the migrations.
3. **Its hostile tests never ran the algorithm.** They mutated a fixture and
   asserted a fingerprint changed. 10/10 green proved nothing about the guard.
4. **The fingerprint missed most of the owned surface** — no forced-RLS, no
   policy permissiveness, no trigger enabled-state, no function security mode or
   `search_path`, no ACLs.

Every one of those is addressed by construction below, and each has a hostile case
that fails if the property regresses.

## Files

| File | Responsibility |
|---|---|
| `run.sh` | Entry point. Modes: local self-test (default), `--verify` (read staging, report), `--verify --repair-ledger` (gated mutation). |
| `lib/disposable_pg.sh` | Ephemeral socket-only PostgreSQL 16 cluster. `runuser -u postgres` pattern (initdb refuses to run as root). |
| `sql/00_prelude.sql` | Faithful stubs of the Supabase objects `0090`–`0093` *reference but do not own* (`auth.users`, `auth.uid`, `generations`, `media_assets`, `edit_director_decisions`, `workspace_peers`, roles, `pgcrypto` in `extensions`). |
| `lib/build_expected.sh` | Applies the four committed migrations **byte-exactly** (`psql -f` on the file itself — no extraction, no `sed`) and censuses the catalog before and after. |
| `sql/10_catalog_census.sql` | Raw object inventory. Run twice; the difference *is* the owned surface. |
| `lib/ledger.mjs` | Derives the **ownership ledger** from that difference, plus absence assertions parsed from the migrations' own `DROP` statements. Nothing is hand-listed. |
| `sql/30_manifest.sql` | **The canonical semantic manifest.** One `SELECT`. The identical file runs against the expected DB and against staging. |
| `lib/guard.mjs` | **The guard.** `runGuard()` reads both manifests read-only, compares them by key, and fails closed on missing / modified / additive. This is the entry point the hostile suite drives. |
| `lib/selfcheck.mjs` | Proves the harness before trusting its verdict: every ledger entry must resolve, the surface must be non-trivial. |
| `hostile/cases.mjs` | 24 divergences + positive control. Each declares the severity and object its findings must contain. |
| `hostile/run.mjs` | Clones the expected DB per case, applies the divergence, runs the **real** guard, asserts rejection, and proves the target unchanged. Plus 3 mutation controls. |
| `lib/ledger_state.sh` | The only mutating code. `supabase migration repair`, with before/after definition capture and a row-level blast-radius check. |

## Ownership: two zones and a cross-zone rule

Expected state is built on stubs, so the manifest cannot compare the *whole*
`public` schema — staging carries 89 other migrations' objects. Scope is therefore
explicit and machine-derived:

- **Zone A — owned containers.** The three tables the migrations *create*
  (`source_capture_intents`, `source_capture_manifests`, `source_script_snapshots`)
  and all 18 owned functions. Their **complete** surface is compared and
  **additive drift is a failure**: an extra column, index, constraint, policy,
  trigger or grant here is something no committed migration put there.
- **Zone B — scoped attachments.** Objects added to *pre-existing* tables:
  `media_assets.capture_contract_version`, its check constraint, and the two
  triggers (`media_assets_capture_ready_guard`,
  `trg_editor_director_decision_guard`). Only the named objects are compared,
  because those tables carry surface owned by `0001`–`0089`, about which this
  guard makes no claim.
- **Cross-zone rule.** Every trigger *anywhere in the database* bound to an owned
  function is compared. Ownership follows the **function binding**, not the table
  — so an extra trigger on `media_assets` or `generations` cannot hide inside Zone
  B's named-only comparison. (`additional-owned-object-trigger` proves it.)
- **Absence.** `0091` creates `editor_backfill_capture_marker()`, calls it, then
  drops it. "This function must not exist" is a real parity requirement, derived
  automatically from the migration's own `DROP`.

## Manifest surface

Currently rendering **3 tables / 26 columns / 19 constraints / 7 indexes /
3 policies / 42 table grants / 18 functions / 36 function grants /
5 owned-function triggers / 1 scoped column / 1 scoped constraint /
1 absence assertion**.

- **Tables** — owner, persistence, `rls_enabled`, **`rls_forced`**, replica identity
- **Columns** — type (`format_type`), nullability, default expression, identity,
  generated state, collation
- **Constraints** — type, full `pg_get_constraintdef`, deferrable/deferred, validated
- **Indexes** — full `pg_get_indexdef`, unique, primary, valid, replica identity
- **Policies** — command, **permissive vs restrictive**, roles, `USING`, `WITH CHECK`
- **Triggers** — full definition, bound function, **enabled state** (`tgenabled`)
- **Functions** — identity args (names *and* types), result, language, owner,
  volatility, parallel, strict, returns-set, **security mode**, leakproof,
  **`proconfig` incl. `search_path`**, body + `body_sha256`
- **ACLs** — table, function, sequence and schema grants (grantee, grantor,
  privilege, grantability)
- **Sequences** — type, start/increment/min/max/cache/cycle, owning column, ACL
- **Capture-ready machinery** — `capture_contract_version`, its constraint,
  `editor_capture_ready_guard` + its trigger
- **Director Decision-v2** — `editor_assert_director_decision_v2`,
  `editor_director_decision_guard`, `trg_editor_director_decision_guard`

Canonicalization: every array is `ORDER BY`'d on a stable key; OIDs, sizes, row
counts and timestamps are never emitted; type and function references render by
name so they do not vary per database.

## Read-only, three ways

1. **One statement.** The only SQL sent to staging is `sql/30_manifest.sql`, a
   single `SELECT`.
2. **The server enforces it.** Every `psql` invocation sets
   `default_transaction_read_only = on`. Verified empirically: a `CREATE TABLE`
   under those options fails with *"cannot execute CREATE TABLE in a read-only
   transaction"*, while the same statement succeeds without them — so the block is
   the setting, not a coincidental permission.
3. **Proven per case.** Every hostile case captures the target's manifest
   immediately before and immediately after the guard runs, and asserts byte
   equality. Mutation control 3 proves that check is not a no-op.

`psql -X` is used everywhere, so no `~/.psqlrc` can alter a read.

## Hostile cases

Each clones the expected database, applies real DDL, runs `runGuard()`, and asserts
it rejects **for the declared reason** — severity *and* object. "It failed" is not
an assertion.

| Case | Proves |
|---|---|
| `changed-function` | `body_sha256` detects edited logic. Isolated to the body only. |
| `missing-function` | A removed object fails closed. |
| `additional-function` | **Additive** overload caught — the class the old guard was blind to. |
| `changed-function-security-mode` | `SECURITY DEFINER → INVOKER` breaks RLS-bypassing RPCs. |
| `changed-function-search-path` | `proconfig` compared; unpinned `search_path` on a definer is a hijack. |
| `changed-function-volatility` | `IMMUTABLE → VOLATILE` changes planner/index eligibility. |
| `dropped-policy` | Missing policy + RLS on = silent total read denial. |
| `additional-policy` | **Additive** permissive policy ORs in and opens the table up. |
| `permissiveness-change` | `polpermissive` flip — name, command, roles, expression all identical. |
| `disabled-trigger` | `tgenabled` — definition byte-identical, never fires again. |
| `additional-owned-object-trigger` | **Additive**; cross-zone binding rule works. |
| `additional-owned-object-resurrected-function` | Absence assertion holds. |
| `added-grant` | **Additive** ACL — a client could write provenance rows. |
| `removed-grant` | Missing table ACL. |
| `removed-function-grant` | Missing function ACL — the worker's RPC would fail. |
| `added-column` | **Additive** column — what re-application can never remove. |
| `changed-default` | Default expression compared. |
| `changed-type` | `text → varchar(64)` silently truncates. |
| `changed-nullability` | `attnotnull` compared. |
| `added-index` | **Additive** index. |
| `changed-constraint` | Same name, weaker expression. |
| `disabled-rls` | `relrowsecurity` — policies look perfect, none apply. |
| `forced-rls` | `relforcerowsecurity` in **both** directions. |
| `missing-table` | Missing container, reported as one finding not a hundred. |
| **positive control** | The guard still **accepts** a correct database — without this, `return false` would pass all 24. |

## Mutation controls

A test that cannot fail is worse than no test. Three controls prove this suite can:

1. **Neutered comparison.** Every case re-runs with `compareManifests` replaced by
   one returning no findings. All 24 must stop rejecting — proving each case
   depends on the real guard, not on something incidental.
2. **Field blinding.** Nine manifest dimensions (`enabled`, `permissive`,
   `rls_enabled`, `rls_forced`, `body`, `security_definer`, `config`, `not_null`,
   `default`) are individually stripped, and the corresponding case must become
   undetectable. This proves each field carries its own weight — and it earned its
   keep: it caught a draft of `changed-function` that also set a `search_path`, so
   the case would have passed on `config` even with the body comparison removed.
3. **Read-only proof.** A real schema change made *between* the two snapshots must
   trip the equality check.

`compare` is injectable on `runGuard()` for exactly this purpose; production
callers never pass it.

## Known risks on the first staging run

Two manifest fields are **environment-determined rather than migration-determined**,
and are the most likely source of a first-run finding that is noise rather than
drift:

- **`owner`** (tables, functions, schemas). The disposable database owns everything
  as `postgres`; if staging's migrations ran as a different role, every owned
  object mismatches. It is kept in the comparison deliberately — a `SECURITY
  DEFINER` function's owner *is* its effective privilege, so this is genuinely
  semantic — but a uniform owner-only diff across all 21 objects means "different
  deploy role", not "drift".
- **`grantor`** (table ACLs). Pure provenance: it records who issued the `GRANT`,
  and does not change the privilege granted. This is the one field in the manifest
  that is arguably over-strict.

Both fail **closed**, which is the safe direction, and both are immediately
diagnosable from the diff (a uniform mismatch on one field across every object).
Neither was loosened pre-emptively: relaxing a comparison based on a guess about
staging, without being able to test that guess, is how blind spots get built.
Interpret the first `--verify` run with this in mind.

## Parity claim — deliberately narrow

**Verified:** `0090` `0091` `0092` `0093` — schema proven to match the committed
migrations exactly, object by object, including additive drift.

**Not claimed:** complete local/remote parity. This repo has a **mixed migration
history** — timestamp-style versions alongside four-digit names — and the local
file count does not equal the recorded remote row count. That divergence is
pre-existing historical debt, is out of scope here, and is **not** addressed by
this repair. `lib/ledger_state.sh` prints both numbers so the gap is stated rather
than implied away by a repair that merely makes `supabase migration list` look tidy.

## Running it

```bash
# Local self-test: build expected + full hostile suite. No secrets, no network.
scripts/db-tests/migration-reconcile/run.sh

# Read staging and report. Requires $STAGING_DB_URL.
scripts/db-tests/migration-reconcile/run.sh --verify

# Repair the ledger rows — only on an exact match, only with this opt-in.
scripts/db-tests/migration-reconcile/run.sh --verify --repair-ledger
```

Exit codes: `0` match · `1` drift or hostile failure · `2` harness/config error.

**CI.** The local half runs on every PR (`pr-checks.yml`, `db-gates` job). The
staging read and the repair run in `.github/workflows/migration-reconcile.yml` —
`workflow_dispatch` only, **report-only unless `repair_ledger: true`**, no schedule
and no push trigger.

**Credentials** are read from `$STAGING_DB_URL` / `$SUPABASE_ACCESS_TOKEN` in the
environment only. They are never printed, logged or written to a file; every error
path is filtered through `redact()`, which masks connection URIs, passwords, hosts
and tokens. Both the workflow and `lib/ledger_state.sh` refuse any URL that is not
the staging project ref, and refuse the production ref explicitly.

## The repair itself

Only reached on an exact match plus the explicit opt-in. It uses the official tool:

```
supabase migration repair <version> --status applied --db-url "$STAGING_DB_URL"
```

Around it: full owned-surface definitions are captured before and after (using the
very same manifest query the guard compares with, so there is no second definition
of "the schema" that could disagree) and asserted byte-identical; and the complete
ledger table is diffed to confirm **exactly** the intended rows were added, none
removed, and no other row touched. Either check failing is an alarm, not a warning.
