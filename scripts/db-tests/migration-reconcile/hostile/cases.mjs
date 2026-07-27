// ===========================================================================
// HOSTILE CASES for the migration-reconcile guard.
// ===========================================================================
// Each case is a REAL divergence applied to a REAL clone of the expected
// database. hostile/run.mjs then runs the ACTUAL guard entry point
// (lib/guard.mjs runGuard) against that clone and asserts it REJECTS.
//
// Every case declares `expect`: the severities and an object-name substring the
// findings must contain. Asserting only "it failed" is not enough — a guard that
// rejected everything for the wrong reason would pass such a test, and a guard
// that only ever detected MISSING would sail through the ADDITIVE cases.
//
//   severities: every listed severity must appear in the findings
//   mentions:   every listed substring must appear in some finding's `object`
//
// `sql` runs against the clone as a superuser. It is the ONLY thing that writes
// to any database in this suite; the guard itself never does.

export const cases = [
  // ---------------------------------------------------------------- functions
  {
    id: 'changed-function',
    what: 'an owned function body is edited in place',
    proves: 'body_sha256 comparison detects a semantic change to logic that no migration made',
    // Deliberately ISOLATED to the body: same signature, same language, same
    // volatility, same (absent) proconfig as 0091 declares. Any extra difference
    // would let this case pass on some other field's back — the field-blinding
    // mutation control checks exactly that, and caught an earlier draft of this
    // case which also set a search_path.
    sql: `
      create or replace function public.editor_snapshot_normalize(s text)
      returns text language sql immutable
      as $fn$ select s $fn$;`,
    expect: { severities: ['MODIFIED'], mentions: ['editor_snapshot_normalize'] },
  },
  {
    id: 'missing-function',
    what: 'an owned function is dropped',
    proves: 'a removed object fails closed rather than being silently tolerated',
    sql: `drop function public.editor_verify_capture_dialogue_shas(jsonb, jsonb);`,
    expect: { severities: ['MISSING'], mentions: ['editor_verify_capture_dialogue_shas'] },
  },
  {
    id: 'additional-function',
    what: 'an EXTRA overload of an owned function name is created',
    proves: 'ADDITIVE drift is visible. This is the class the previous guard was structurally blind to: re-applying a migration idempotently never removes an extra object, so BEFORE == AFTER and the drift disappeared.',
    sql: `
      create function public.editor_snapshot_normalize(s text, unused text)
      returns text language sql immutable as $fn$ select s $fn$;`,
    expect: { severities: ['ADDITIVE'], mentions: ['editor_snapshot_normalize'] },
  },
  {
    id: 'changed-function-security-mode',
    what: 'a SECURITY DEFINER function is flipped to SECURITY INVOKER',
    proves: 'security mode is compared; this flip silently breaks every RPC that relies on bypassing RLS',
    sql: `alter function public.editor_write_capture_manifest(uuid, text, text, jsonb, text, text) security invoker;`,
    expect: { severities: ['MODIFIED'], mentions: ['editor_write_capture_manifest'] },
  },
  {
    id: 'changed-function-search-path',
    what: "a function's pinned search_path is altered",
    proves: 'proconfig is compared; an unpinned or repointed search_path on a security-definer function is a textbook hijack',
    sql: `alter function public.editor_capture_no_mutate() set search_path = public;`,
    expect: { severities: ['MODIFIED'], mentions: ['editor_capture_no_mutate'] },
  },
  {
    id: 'changed-function-volatility',
    what: 'an IMMUTABLE function is redeclared VOLATILE',
    proves: 'volatility is compared; it changes planner behaviour and index-expression eligibility',
    sql: `alter function public.editor_capture_segments_canonical(jsonb) volatile;`,
    expect: { severities: ['MODIFIED'], mentions: ['editor_capture_segments_canonical'] },
  },

  // ----------------------------------------------------------------- policies
  {
    id: 'dropped-policy',
    what: 'an RLS read policy is dropped',
    proves: 'a removed policy fails closed. With RLS still enabled this silently denies all reads.',
    sql: `drop policy source_capture_intents_owner_read on public.source_capture_intents;`,
    expect: { severities: ['MISSING'], mentions: ['source_capture_intents_owner_read'] },
  },
  {
    id: 'additional-policy',
    what: 'an EXTRA policy is added to an owned table',
    proves: 'additive policy drift is caught. An extra permissive policy ORs into the existing ones and can open a table up completely.',
    sql: `
      create policy scm_backdoor on public.source_capture_manifests
        for select using (true);`,
    expect: { severities: ['ADDITIVE'], mentions: ['scm_backdoor'] },
  },
  {
    id: 'permissiveness-change',
    what: 'a PERMISSIVE policy is recreated as RESTRICTIVE',
    proves: 'polpermissive is compared. The policy name, command, roles and expression are all unchanged — only the AND/OR semantics flip, which a name-and-expression fingerprint cannot see.',
    sql: `
      drop policy source_script_snapshots_owner_read on public.source_script_snapshots;
      create policy source_script_snapshots_owner_read
        on public.source_script_snapshots as restrictive for select
        using (owner_id = auth.uid() or owner_id in (select public.workspace_peers()));`,
    expect: { severities: ['MODIFIED'], mentions: ['source_script_snapshots_owner_read'] },
  },

  // ----------------------------------------------------------------- triggers
  {
    id: 'disabled-trigger',
    what: 'an append-only trigger is DISABLED (but left in the catalog)',
    proves: 'tgenabled is compared. The trigger still exists with a byte-identical definition and never fires again — invisible to any check that only asks whether the trigger exists.',
    sql: `alter table public.source_capture_intents disable trigger source_capture_intents_immutable;`,
    expect: { severities: ['MODIFIED'], mentions: ['source_capture_intents_immutable'] },
  },
  {
    id: 'additional-owned-object-trigger',
    what: 'an EXTRA trigger bound to an owned function is attached to a PRE-EXISTING table',
    proves: 'the cross-zone rule works: ownership follows the function BINDING, not the table, so an extra trigger on media_assets/generations cannot hide in the named-only Zone B comparison',
    sql: `
      create trigger rogue_capture_guard before update on public.generations
        for each row execute function public.editor_capture_no_mutate();`,
    expect: { severities: ['ADDITIVE'], mentions: ['rogue_capture_guard'] },
  },
  {
    id: 'additional-owned-object-resurrected-function',
    what: 'the one-shot helper 0091 drops at the end is resurrected',
    proves: 'absence assertions hold. 0091 creates editor_backfill_capture_marker(), CALLS it, then DROPs it; a staging database where it still exists did not run the same migration to completion.',
    sql: `
      create function public.editor_backfill_capture_marker() returns void
      language plpgsql as $fn$ begin end $fn$;`,
    expect: { severities: ['ADDITIVE'], mentions: ['editor_backfill_capture_marker'] },
  },

  // ------------------------------------------------------------------- grants
  {
    id: 'added-grant',
    what: 'an extra INSERT grant is added to an owned table',
    proves: 'additive ACL drift is caught. 0090/0091 deliberately revoke all writes from authenticated; an added grant lets a client write provenance rows directly.',
    sql: `grant insert on public.source_capture_intents to authenticated;`,
    expect: { severities: ['ADDITIVE'], mentions: ['source_capture_intents'] },
  },
  {
    id: 'removed-grant',
    what: 'a granted SELECT is revoked from an owned table',
    proves: 'a missing ACL entry fails closed — the owner-read path the migration grants is gone',
    sql: `revoke select on public.source_capture_manifests from authenticated;`,
    expect: { severities: ['MISSING'], mentions: ['source_capture_manifests'] },
  },
  {
    id: 'removed-function-grant',
    what: 'service_role EXECUTE is revoked from an owned function',
    proves: 'function ACLs are compared, not just table ACLs — the RPC the worker calls would start failing at runtime',
    sql: `revoke execute on function public.editor_create_source_asset(uuid, uuid, uuid, jsonb, text, text, bigint) from service_role;`,
    expect: { severities: ['MISSING'], mentions: ['editor_create_source_asset'] },
  },

  // ------------------------------------------------------------------ columns
  {
    id: 'added-column',
    what: 'an extra column is added to an owned table',
    proves: 'additive column drift is caught — precisely what idempotent re-application can never remove',
    sql: `alter table public.source_script_snapshots add column operator_note text;`,
    expect: { severities: ['ADDITIVE'], mentions: ['operator_note'] },
  },
  {
    id: 'changed-default',
    what: "a column's DEFAULT expression is changed",
    proves: 'pg_get_expr(adbin) is compared; every future row would get a different value',
    sql: `alter table public.source_capture_intents alter column recorded_at set default '2020-01-01T00:00:00Z'::timestamptz;`,
    expect: { severities: ['MODIFIED'], mentions: ['recorded_at'] },
  },
  {
    id: 'changed-type',
    what: "a column's data type is changed",
    proves: 'format_type is compared; text -> varchar(64) silently truncates or rejects on write',
    sql: `alter table public.source_capture_manifests alter column normalization_version type varchar(64);`,
    expect: { severities: ['MODIFIED'], mentions: ['normalization_version'] },
  },
  {
    id: 'changed-nullability',
    what: 'a NOT NULL column becomes nullable',
    proves: 'attnotnull is compared; the ownership invariant on a provenance row would no longer hold',
    sql: `alter table public.source_script_snapshots alter column owner_id drop not null;`,
    expect: { severities: ['MODIFIED'], mentions: ['owner_id'] },
  },

  // ------------------------------------------------------- indexes/constraints
  {
    id: 'added-index',
    what: 'an extra index is created on an owned table',
    proves: 'additive index drift is caught',
    sql: `create index sci_rogue_created_idx on public.source_capture_intents (created_at);`,
    expect: { severities: ['ADDITIVE'], mentions: ['sci_rogue_created_idx'] },
  },
  {
    id: 'changed-constraint',
    what: 'a CHECK constraint is replaced with a weaker expression under the same name',
    proves: 'pg_get_constraintdef is compared, so a same-named constraint with different semantics is drift. The origin/script-SHA invariant is exactly the kind of thing a name-only check would wave through.',
    sql: `
      alter table public.source_capture_intents drop constraint capture_intent_origin_shape;
      alter table public.source_capture_intents add constraint capture_intent_origin_shape
        check (origin in ('teleprompter', 'upload'));`,
    expect: { severities: ['MODIFIED'], mentions: ['capture_intent_origin_shape'] },
  },

  // ---------------------------------------------------------------------- RLS
  {
    id: 'disabled-rls',
    what: 'row level security is DISABLED on an owned table',
    proves: 'relrowsecurity is compared. Policies all remain in the catalog looking correct while none of them apply — every row becomes readable.',
    sql: `alter table public.source_capture_manifests disable row level security;`,
    expect: { severities: ['MODIFIED'], mentions: ['source_capture_manifests'] },
  },
  {
    id: 'forced-rls',
    what: 'FORCE ROW LEVEL SECURITY is turned on where the migration does not set it',
    proves: 'relforcerowsecurity is compared in BOTH directions. Forcing RLS subjects the table owner to policies too, which breaks the SECURITY DEFINER write path that intentionally runs as the owner.',
    sql: `alter table public.source_capture_intents force row level security;`,
    expect: { severities: ['MODIFIED'], mentions: ['source_capture_intents'] },
  },

  // -------------------------------------------------------------------- table
  {
    id: 'missing-table',
    what: 'an owned table is dropped entirely',
    proves: 'a missing container fails closed and is reported as one finding, not as a hundred column findings',
    sql: `drop table public.source_script_snapshots cascade;`,
    expect: { severities: ['MISSING'], mentions: ['source_script_snapshots'] },
  },
];

// A POSITIVE control. Without it, a guard hard-wired to `return false` would pass
// all 24 hostile cases above. This case proves the guard can still say yes.
export const positiveControl = {
  id: 'positive-control-untouched-clone',
  what: 'a byte-identical clone of the expected database, unmutated',
  proves: 'the guard is capable of ACCEPTING, so the 24 rejections above mean something',
  sql: '',
  expect: { accept: true },
};
