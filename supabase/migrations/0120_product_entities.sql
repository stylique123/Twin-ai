-- 0120 — THE PRODUCT LIBRARY IS A TABLE, BECAUSE A CREATOR IS NOT ONE BUSINESS.
--
-- §8's recorded correction, and the biggest structural flaw the plan has caught
-- in itself: an earlier design routed Q3 + Q4 to exactly ONE subtype for the
-- whole creator. A person can be a founder with their own SaaS, an affiliate for
-- other tools, a sponsor partner, and sell consulting — all at once. A single
-- global subtype means an affiliate creator who later launches their own product
-- causes an identity crisis in the schema.
--
-- So the routing is right and the SCOPE was wrong: the subtype is chosen PER
-- ENTITY, and the creator holds a library of them.
--
-- ── WHY NOT A KEY ON `pre_script_brief` ───────────────────────────────────
--
-- Because that is the same bug wearing a smaller hat. `productEvidence` is
-- currently a brief key, which gives a creator with two products ONE slot for
-- both — and whichever they captured last silently describes the other. Evidence
-- belongs to a thing, not to a person, and this table is where the thing lives.
--
-- `pre_script_brief` keeps the ANSWERS (what the creator said). This keeps the
-- ENTITIES (what those answers imply, corrected). One is a form; the other is a
-- library, and 0109's CHECK is deliberately not widened here.
--
-- ── THE TWO AXES ARE TWO COLUMNS, AND THAT IS THE POINT ───────────────────
--
--   type          SAAS | PHYSICAL | SERVICE | DIGITAL      → WHICH SCHEMA
--   relationship  OWN_PRODUCT | OWN_SERVICE | AFFILIATE |
--                 SPONSOR | REVIEW_ONLY | NONE             → WHAT MAY BE CLAIMED
--
-- An affiliated SaaS uses the SaaS schema AND the third-party ownership rules.
-- One column answering both would decide one of them by accident, which is
-- exactly how "we built this" ends up in an affiliate script.
--
-- ── personal_use IS A THIRD AXIS AND DEFAULTS TO NOT_CONFIRMED ────────────
--
-- §12's correction: BEING AN AFFILIATE DOES NOT PROVE THE CREATOR HAS EVER USED
-- THE PRODUCT. Treating a commercial arrangement as evidence of personal
-- experience manufactures a testimonial out of a payment agreement. The default
-- is NOT_CONFIRMED and it is not a gap to be filled by inference — only the
-- creator moves it, by saying so. The column default encodes that; nothing in
-- the application may write CONFIRMED without the creator's answer behind it.
--
-- ── user_confirmed EXISTS BECAUSE Q3 MINTS THESE ──────────────────────────
--
-- A creator who answers "Software" gets an OWN_PRODUCT / SAAS entity minted for
-- them, pre-filled and correctable — never asked again, the pattern `offer`
-- already uses. That mint is an INFERENCE from an answer, not the answer itself,
-- so it is stored as `source = 'inferred'` with `user_confirmed = false` until a
-- human has looked at it. A mint that arrived indistinguishable from a stated
-- fact would be the product answering on the creator's behalf and then citing
-- itself as the creator.
--
-- `restrictions` is NOT NULL with a default, because §8's one non-negotiable is
-- that it must never be optional in any type. An entity with no restrictions
-- block is one whose compliance answer is "nobody asked", rendered downstream as
-- though it were "nothing applies".

create table if not exists public.product_entities (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  -- The voice this entity was minted alongside. Nullable: an entity added later
  -- from the Product Library belongs to the creator, not to one scanned handle.
  voice_id      uuid references public.brand_voices (id) on delete set null,

  name          text,
  type          text not null,
  relationship  text not null,
  personal_use  text not null default 'NOT_CONFIRMED',
  -- CAN THIS PRODUCT BE PUT ON SCREEN, and how dependably?
  --
  -- §5's Q4 conditionals, which the spec has always carried and no screen ever
  -- asked: "talk about it / show it / both" for software, "usually have it while
  -- filming / sometimes / no" for a physical product. Those are the same
  -- question in two vocabularies, so they are ONE column — otherwise every
  -- downstream reader branches on `type` before it can ask the only thing it
  -- wants to know, and the less common type's field rots.
  --
  -- These are PRODUCTION FACTS, not preferences. This is what makes "hold the
  -- bottle beside your face" a legal instruction instead of the invented
  -- inventory of §5a's renovated kitchen.
  --
  -- UNKNOWN IS THE DEFAULT AND IT IS LOAD-BEARING, for the reason 0103 wrote
  -- down for `can_record_screen`: read as NEVER it silently removes a scene type
  -- from everyone who was never asked; read as ALWAYS it hands a shot
  -- instruction to someone who cannot take it. Neither is a default anyone chose.
  showability   text not null default 'UNKNOWN',

  product_url   text,
  -- Present ⇒ there is a commercial tie. Adding one promotes a REVIEW_ONLY
  -- entity to AFFILIATE in place — no new row, no re-capture, every product
  -- fact already gathered survives. That upgrade path is why REVIEW_ONLY is
  -- modelled at all rather than being called "no relationship".
  affiliate_url text,

  -- The product itself: a link we READ or images of the thing. The string
  -- 'declined' is a real answer ("there is nothing to show"); absent is not, and
  -- reading absent as declined would let a demo script conclude it needs no
  -- footage. Same rule 0109 wrote for the brief key this replaces.
  evidence      jsonb,
  restrictions  jsonb not null default '{"approvedClaims":[],"forbiddenClaims":[],"complianceNotes":null}'::jsonb,

  source          text not null default 'inferred',
  user_confirmed  boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- THE VOCABULARY IS CLOSED. A value outside it would reach the blueprint
  -- prompt as though the creator had chosen it, and the two axes must not be
  -- able to hold each other's members — `type = 'OWN_PRODUCT'` is the exact
  -- conflation this table exists to make unrepresentable.
  constraint product_entities_type_known
    check (type in ('SAAS', 'PHYSICAL', 'SERVICE', 'DIGITAL')),
  constraint product_entities_relationship_known
    check (relationship in ('OWN_PRODUCT', 'OWN_SERVICE', 'AFFILIATE', 'SPONSOR', 'REVIEW_ONLY', 'NONE')),
  constraint product_entities_personal_use_known
    check (personal_use in ('CONFIRMED', 'NOT_CONFIRMED')),
  constraint product_entities_showability_known
    check (showability in ('ALWAYS', 'SOMETIMES', 'NEVER', 'UNKNOWN')),
  constraint product_entities_source_known
    check (source in ('user_answer', 'inferred')),
  -- Same three-state discipline 0109 enforces on the brief: a name is either a
  -- real answer or absent. An empty string reads as unanswered to every consumer
  -- and counts as answered to anyone who checks for the column.
  constraint product_entities_name_nonempty
    check (name is null or btrim(name) <> ''),
  constraint product_entities_evidence_shape
    check (evidence is null or evidence = '"declined"'::jsonb or jsonb_typeof(evidence) = 'object')
);

create index if not exists product_entities_owner_idx
  on public.product_entities (owner_id, created_at desc);

-- ONE MINTED OWNED ENTITY PER VOICE, and this is a correctness guard rather than
-- a nicety. `Onboarding` re-runs its confirm step on remount — the same class of
-- defect as the V2Building replay that charged three times for one video — so
-- without this a creator who navigates back and forward accumulates a duplicate
-- product on every pass, and the Product Library fills with copies of one thing.
-- Partial, so the many NON-owned entities a creator may hold are unaffected.
create unique index if not exists product_entities_one_owned_per_voice
  on public.product_entities (voice_id)
  where relationship in ('OWN_PRODUCT', 'OWN_SERVICE') and voice_id is not null;

create or replace function public.product_entity_touch()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists product_entities_touch on public.product_entities;
create trigger product_entities_touch
  before update on public.product_entities
  for each row execute function public.product_entity_touch();

alter table public.product_entities enable row level security;

-- The creator owns their library outright: they mint it, they correct it, they
-- delete it. Unlike `brand_voices` — whose rows are created by edge functions
-- and only partly editable — every column here is the creator's own answer or a
-- correction of our inference, so INSERT is theirs too.
create policy "own product entities read"
  on public.product_entities for select using (auth.uid() = owner_id);
create policy "own product entities insert"
  on public.product_entities for insert with check (auth.uid() = owner_id);
create policy "own product entities update"
  on public.product_entities for update
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own product entities delete"
  on public.product_entities for delete using (auth.uid() = owner_id);

-- Table-level grants, because this table's rows are written by the creator
-- rather than by a service-role function. `brand_voices` grants UPDATE one
-- column at a time and has twice dead-ended a flow on a bare 42501 that named no
-- column (0053 `scene_timeline`, 0051 `brand_kit`); that pattern is right where
-- most columns are machine-owned and wrong here, where none are.
grant select, insert, update, delete on public.product_entities to authenticated;
