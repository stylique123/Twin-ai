-- Track C · Batch A.7 — the creative-transfer lineage: brand truth, campaign
-- intent, normalized reference evidence, and the transfer plan.
--
-- AUTHORITY: docs/twinai-selective-transfer-reasoning-contract.md, sha256
-- 3f8816055c4f867978841a53ef30eb146d2073c3e17ead1697ab9614573bfa07.
-- §2.3 (project once, validate, HASH and persist, never reread live DNA),
-- §6 (the plan is append-only and hash-pinned; a changed brand, goal or
-- reference set creates a NEW plan and never mutates the old one),
-- §7 Step 7 (persist the validated, immutable plan and its SHA before writing).
--
-- WHY DATABASE GUARDS AND NOT ONLY THE TYPESCRIPT VALIDATORS
-- ----------------------------------------------------------
-- The TS validators in packages/shared are the semantic gate and they are where
-- the reasoning lives. They are not, however, on every write path — which is
-- precisely the defect the Batch A audit found in `VoiceProfile`: a shared type
-- that described the data without ever constraining it, because `dna-poll` wrote
-- the provider object straight to the row. These triggers fire for EVERY role
-- including service_role (triggers ignore RLS), so the immutability and lineage
-- rules hold even when a future code path forgets to call the validator.
--
-- Idempotent. No backfill: there are no existing rows.

-- ---------------------------------------------------------------- brand truth
create table if not exists public.brand_truth_snapshots (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  brand_voice_id    uuid references public.brand_voices(id) on delete set null,
  schema_version    int  not null default 1,
  snapshot          jsonb not null,
  -- sha256 of the canonical projection. §2.3 step 4.
  snapshot_sha256   text not null,
  created_at        timestamptz not null default now(),
  constraint brand_truth_schema_version_v1 check (schema_version = 1),
  constraint brand_truth_sha_hex check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  constraint brand_truth_is_object check (jsonb_typeof(snapshot) = 'object')
);
create index if not exists brand_truth_snapshots_owner_idx
  on public.brand_truth_snapshots (owner_id, created_at desc);
-- The same facts hash to the same digest, so re-projecting an unchanged brand
-- must REUSE the snapshot rather than accumulate duplicates.
create unique index if not exists brand_truth_snapshots_owner_sha_idx
  on public.brand_truth_snapshots (owner_id, snapshot_sha256);

-- ------------------------------------------------------------ campaign intent
create table if not exists public.campaign_intents (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  generation_id     uuid not null references public.generations(id) on delete cascade,
  schema_version    int  not null default 1,
  intent            jsonb not null,
  intent_sha256     text not null,
  created_at        timestamptz not null default now(),
  constraint campaign_intent_schema_version_v1 check (schema_version = 1),
  constraint campaign_intent_sha_hex check (intent_sha256 ~ '^[0-9a-f]{64}$'),
  constraint campaign_intent_is_object check (jsonb_typeof(intent) = 'object')
);
create index if not exists campaign_intents_generation_idx
  on public.campaign_intents (generation_id, created_at desc);

-- -------------------------------------------------- normalized reference evidence
create table if not exists public.reference_evidence_sets (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  reference_id      text not null,
  analysis_id       text not null,
  schema_version    int  not null default 1,
  evidence          jsonb not null,
  -- TWO DIGESTS, TWO AUTHORITIES. They are not interchangeable and the contract
  -- does not treat them as such:
  --
  --   evidence_sha256 — the digest of the CANONICAL NORMALIZED EVIDENCE stored
  --     in `evidence`. It identifies what this row holds.
  --   analysis_sha256 — the digest of the UPSTREAM ANALYSIS BYTES the evidence
  --     was normalized FROM. It identifies where this row came from, and it is
  --     what the contract's `plan.referenceSet[].analysisSha256` pins (§6).
  --
  -- Normalization is lossy and versioned, so one analysis can normalize to
  -- different evidence bytes; the two digests therefore differ in general and
  -- coincide only by accident. An earlier revision of this trigger compared the
  -- plan's `analysisSha256` against `evidence_sha256`. That conflation would
  -- accept a plan pinning an analysis digest nobody ever issued, and reject a
  -- correct plan the moment the normalizer changed — the pin would describe the
  -- wrong artifact in both directions.
  evidence_sha256   text not null,
  analysis_sha256   text not null,
  created_at        timestamptz not null default now(),
  constraint reference_evidence_schema_version_v1 check (schema_version = 1),
  constraint reference_evidence_sha_hex check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  constraint reference_evidence_analysis_sha_hex check (analysis_sha256 ~ '^[0-9a-f]{64}$'),
  constraint reference_evidence_is_object check (jsonb_typeof(evidence) = 'object'),
  -- §6: evidence ids are SERVER-ISSUED and derived from the analysis id, so an
  -- analysis has exactly one normalized set. A second row for the same analysis
  -- would make a cited id ambiguous.
  constraint reference_evidence_analysis_unique unique (owner_id, analysis_id)
);

-- `create table if not exists` does not add a column to a table an earlier run
-- of this migration already created. There are no rows anywhere yet, so the
-- NOT NULL is set unconditionally: if a row ever did exist this would fail
-- loudly rather than leave the digest nullable, and a nullable analysis_sha256
-- is exactly the "pin that describes nothing" this column exists to prevent.
alter table public.reference_evidence_sets add column if not exists analysis_sha256 text;
alter table public.reference_evidence_sets alter column analysis_sha256 set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reference_evidence_analysis_sha_hex'
      and conrelid = 'public.reference_evidence_sets'::regclass
  ) then
    alter table public.reference_evidence_sets
      add constraint reference_evidence_analysis_sha_hex check (analysis_sha256 ~ '^[0-9a-f]{64}$');
  end if;
end $$;

-- ------------------------------------------------------- creative transfer plan
create table if not exists public.creative_transfer_plans (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null references auth.users(id) on delete cascade,
  generation_id           uuid not null references public.generations(id) on delete cascade,
  schema_version          int  not null default 1,
  brand_truth_snapshot_id uuid not null references public.brand_truth_snapshots(id),
  brand_truth_sha256      text not null,
  campaign_intent_id      uuid not null references public.campaign_intents(id),
  campaign_intent_sha256  text not null,
  plan                    jsonb not null,
  plan_sha256             text not null,
  model_identity          text not null,
  prompt_version          text not null,
  created_at              timestamptz not null default now(),
  constraint transfer_plan_schema_version_v1 check (schema_version = 1),
  constraint transfer_plan_sha_hex check (plan_sha256 ~ '^[0-9a-f]{64}$'),
  constraint transfer_plan_bt_sha_hex check (brand_truth_sha256 ~ '^[0-9a-f]{64}$'),
  constraint transfer_plan_ci_sha_hex check (campaign_intent_sha256 ~ '^[0-9a-f]{64}$'),
  constraint transfer_plan_is_object check (jsonb_typeof(plan) = 'object')
);
create index if not exists creative_transfer_plans_generation_idx
  on public.creative_transfer_plans (generation_id, created_at desc);

-- ------------------------------------------------------------ append-only guard
--
-- §6: "The plan is append-only… A changed brand, campaign goal, or reference set
-- creates a new plan; it never mutates the old one." The same holds for the
-- snapshots it pins: a pinned digest that can be edited underneath the plan is
-- not a pin. UPDATE is refused outright rather than restricted to "harmless"
-- columns — there is no harmless column on a hashed, cited record.
--
-- DELETE is left to the owner cascade only. A row deleted directly would orphan
-- a plan's pin, so it is refused here and removal happens by deleting the
-- generation or the user, where the cascade is declared.
create or replace function public.creative_lineage_is_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception
    'creative_lineage_append_only: % on %.% is refused; this record is hashed and cited '
    'downstream, so a change creates a NEW row (contract §6)',
    tg_op, tg_table_schema, tg_table_name
    using errcode = 'raise_exception';
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'brand_truth_snapshots', 'campaign_intents',
    'reference_evidence_sets', 'creative_transfer_plans'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only', t);
    execute format(
      'create trigger %I before update or delete on public.%I '
      'for each row execute function public.creative_lineage_is_append_only()',
      t || '_append_only', t);
  end loop;
end $$;

-- ------------------------------------------------------------ lineage integrity
--
-- A plan pins two digests. Those digests must be the ones the referenced rows
-- actually carry, or the pin records a lineage that never existed. Checked in
-- the database because the plan and the snapshots can be written by different
-- code paths at different times.
create or replace function public.assert_transfer_plan_lineage()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare bt text; ci text; gen uuid; e jsonb;
begin
  select snapshot_sha256 into bt from public.brand_truth_snapshots where id = new.brand_truth_snapshot_id;
  if bt is distinct from new.brand_truth_sha256 then
    raise exception 'transfer_plan_brand_truth_digest_mismatch: plan pins % but snapshot % carries %',
      new.brand_truth_sha256, new.brand_truth_snapshot_id, coalesce(bt, '<missing>')
      using errcode = 'raise_exception';
  end if;

  select intent_sha256, generation_id into ci, gen from public.campaign_intents where id = new.campaign_intent_id;
  if ci is distinct from new.campaign_intent_sha256 then
    raise exception 'transfer_plan_campaign_intent_digest_mismatch: plan pins % but intent % carries %',
      new.campaign_intent_sha256, new.campaign_intent_id, coalesce(ci, '<missing>')
      using errcode = 'raise_exception';
  end if;

  -- The intent must be for the SAME generation. Otherwise a plan could pin one
  -- video's intent onto another's, which is the lineage break §9 exists to stop.
  if gen is distinct from new.generation_id then
    raise exception 'transfer_plan_generation_mismatch: plan is for generation % but intent % is for %',
      new.generation_id, new.campaign_intent_id, coalesce(gen::text, '<missing>')
      using errcode = 'raise_exception';
  end if;

  -- ---- PLAN -> EVIDENCE LINEAGE ------------------------------------------
  --
  -- The TS validator binds referenceSet to server-issued evidence, but it is not
  -- on every write path — service_role bypasses RLS and could insert a plan whose
  -- JSON referenceSet names an analysis nobody owns, or a digest nobody issued.
  -- Then the pinned lineage would describe nothing, which is the same defect
  -- class as a shape-only digest check.
  --
  -- So the join is enforced HERE: every entry in the plan's referenceSet must
  -- correspond to a reference_evidence_sets row owned by the SAME owner, with a
  -- matching analysis_id AND a matching ANALYSIS digest.
  --
  -- `analysisSha256` is compared to `analysis_sha256`, NOT to `evidence_sha256`.
  -- Those name different bytes (see the column comments above); comparing the
  -- contract's analysis digest to the normalized-evidence digest would be a
  -- check that passes only when the two happen to be equal, which is a property
  -- of the fixture rather than of the lineage.
  if jsonb_typeof(new.plan -> 'referenceSet') is distinct from 'array' then
    raise exception 'transfer_plan_reference_set_missing: plan.referenceSet must be an array'
      using errcode = 'raise_exception';
  end if;

  for e in select * from jsonb_array_elements(new.plan -> 'referenceSet') loop
    if not exists (
      select 1 from public.reference_evidence_sets r
      where r.owner_id = new.owner_id
        and r.reference_id = e ->> 'referenceId'
        and r.analysis_id = e ->> 'analysisId'
        and r.analysis_sha256 = e ->> 'analysisSha256'
    ) then
      raise exception
        'transfer_plan_evidence_lineage_missing: referenceSet entry (reference %, analysis %, digest %) '
        'has no owned normalized evidence row for owner %',
        coalesce(e ->> 'referenceId', '<null>'), coalesce(e ->> 'analysisId', '<null>'),
        coalesce(e ->> 'analysisSha256', '<null>'), new.owner_id
        using errcode = 'raise_exception';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists creative_transfer_plans_lineage on public.creative_transfer_plans;
create trigger creative_transfer_plans_lineage
  before insert on public.creative_transfer_plans
  for each row execute function public.assert_transfer_plan_lineage();

-- --------------------------------------------------------------------- RLS
--
-- Owners READ their own lineage and write NOTHING. Every one of these records is
-- a server projection or a server-validated model output; a client that could
-- insert one could assert its own brand truth, which is authority level 1.
-- No INSERT/UPDATE/DELETE policy exists for any role, so only service_role
-- (which bypasses RLS) can write — and the append-only trigger still binds it.
do $$
declare t text;
begin
  foreach t in array array[
    'brand_truth_snapshots', 'campaign_intents',
    'reference_evidence_sets', 'creative_transfer_plans'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (owner_id = auth.uid())',
      t || '_owner_read', t);
    -- Belt and braces beside RLS: no direct table grants to the client roles.
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
