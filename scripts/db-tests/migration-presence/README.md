# migration-presence — which committed migrations is a deployed database missing?

Sibling to `migration-reconcile`, and a different question.

`migration-reconcile` proves that staging's schema **is** what migrations `0090`–`0093`
produce, in full semantic detail, so its ledger can be repaired honestly. It is deep
and narrow.

This is shallow and wide: for **every** committed migration, does the target database
carry what it creates? It exists because nothing answered that, and the cost of not
answering it was a production database sitting behind `main` with no symptom.

## Why the ledger cannot answer it

`supabase_migrations.schema_migrations` on staging stops at `0090` while objects from
`0091`–`0100` are plainly present — `staging-integration.yml` applies migrations with
`psql -f`, so the schema advances and the ledger does not. Reading "is this applied?"
off the ledger is worse than having no answer: it is a confident wrong one.

## Why presence alone is not enough

124 of the creation statements in `supabase/migrations` are `create or replace
function`. A function **existing** proves only that some migration created it once.

That is exactly how production sat behind without a symptom: `0100` *replaces*
`editor_record_analysis` to admit the `alignment` component. The old function was
still there, still callable, and still refusing the component — passing every
presence check anyone would think to write.

So this compares **bodies**. For each function, the expected body is the one from the
highest-numbered migration that defines it (last writer wins, which is what applying
them in order means), and the probe compares `sha256(prosrc)` against it. A stale
function is a digest difference that names the migration which would fix it.

## Usage

```bash
node scripts/db-tests/migration-presence/probe.mjs --selftest        # runs in CI
node scripts/db-tests/migration-presence/probe.mjs --sql             # the read-only query
node scripts/db-tests/migration-presence/probe.mjs --report out.json # the verdict
node scripts/db-tests/migration-presence/probe.mjs --sql-diff 0094   # drift only, scoped
```

`--sql` states no expectations: it reports what the database *has*, and `--report`
decides here. `--sql-diff` inlines the expected digests so the result is small enough
to read by eye through an MCP tool or a console — convenient, and strictly the less
trustworthy of the two, since a query carrying the expected values can be wrong in the
same direction as the thing it checks. `--sql | --report` is the authority.

Nothing in this directory connects to a database. It emits SQL and interprets an
answer, so it cannot mutate anything it examines.

## Arity is part of the identity

Postgres keys functions by *(name, argument types)*, and the first real run of this
tool got that wrong. Staging carries **two** `editor_create_output_asset` overloads —
the committed 9-argument one plus a 10-argument variant no migration in this tree
creates. Keyed by name alone, the probe compared the committed body against whichever
row the catalog happened to return and reported an up-to-date function as **stale**.

Functions are therefore keyed `name/nargs`. An overload the database carries that no
migration creates is reported separately as `extra_overload` — additive drift, not
"behind". It cannot make the committed body wrong, but it can shadow it at a call
site, which is worth seeing and is a different finding.

A drift tool that cries wolf is worse than none: it teaches people to skip its output.

## What it cannot see

A migration that creates no table and defines no function — one that only `ALTER`s a
column, adds a constraint, a policy, an index or a grant — leaves no fingerprint this
probe reads. Those files are listed as **unprobed** in every report rather than
counted as verified. `0098` is one of them.
