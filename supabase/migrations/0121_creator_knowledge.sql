-- CREATOR KNOWLEDGE — the second memory, beside Creator DNA.
--
-- ── WHY A TABLE AND NOT A COLUMN ON brand_voices ──────────────────────────
--
-- `brand_voices.profile` already holds the DNA blob, and adding knowledge to it
-- would make the two share a lifetime. They must not. DNA is re-synthesised
-- wholesale on every rescan; knowledge ACCUMULATES across scans, because a
-- position held in a video from last year is still a position. Folding an
-- accumulating record into a replaced one loses it on the next refresh, quietly,
-- and the loss looks exactly like the creator never having said anything.
--
-- Rows also expire individually (see below), which a blob cannot express.
--
-- ── EXTRACT, THEN FORGET ──────────────────────────────────────────────────
--
-- ⚖️ THE RAW TRANSCRIPT IS FUEL, NOT A RECORD. What persists here is a short
-- distilled claim — "battery life matters more than camera gimmicks" — plus
-- `source_ref`, an id sufficient to trace it and insufficient to reconstitute
-- the speech it came from. There is deliberately NO column that can hold a
-- transcript: `text` is capped by CHECK at 240 characters, so the schema itself
-- refuses to become the transcript store this design exists to avoid.
--
-- `source_expiry` records when the raw source may no longer be kept. NULL means
-- it was never retained at all, which is the STRONGEST state rather than a
-- missing value — a distinction `creatorKnowledge.ts:sourceExpired` relies on.
--
-- ── AUDIENCE MEMORY IS STRICTER STILL ─────────────────────────────────────
--
-- Comments are written by people who never signed up for anything here, so the
-- audience table stores a SUMMARY and a COUNT and nothing else. It has no
-- author column, no comment text and no per-comment id to attach one to. That
-- is not an oversight to be filled in later; it is the design, and adding any
-- of them would change what this system holds about third parties.
--
-- ── NOTHING HERE MAY BE INVENTED ──────────────────────────────────────────
--
-- `basis` is three-state and its DEFAULT is the weakest reading. An extractor
-- that omits it gets `inferred`, never `stated`, because a default of "stated"
-- is exactly how a guess becomes a quote in someone's mouth. Only non-inferred
-- items are ever voiced (`writableClaims`).

create table if not exists public.creator_knowledge (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  -- Which scanned voice this was distilled from. Knowledge belongs to the
  -- creator, so this survives the voice being deleted.
  voice_id      uuid references public.brand_voices (id) on delete set null,

  kind          text not null,
  -- Capped IN THE SCHEMA, not merely in the application. A 240-character limit
  -- is what makes "this is a distillate" enforceable rather than aspirational.
  text          text not null,
  basis         text not null default 'inferred',
  -- HOW SURE, as opposed to HOW WE KNOW. Defaults to the middle, never to 1:
  -- an omitted confidence means nobody said how sure they were, and reading
  -- that as certainty is the same error as defaulting `basis` to 'stated'.
  confidence    numeric not null default 0.5,
  -- How many separate videos carried it. A position held once is a remark; the
  -- same one across five videos is what they are known for, and the writer
  -- ranks on this.
  times_seen    integer not null default 1,

  source_ref    text,
  -- The video this was read out of, so a creator correcting an item can go and
  -- watch it. Provenance a person can act on beats an opaque id.
  source_url    text,
  -- When it was last seen in their output. A position from four years ago and
  -- one from last month are different facts about a person; only a dated record
  -- can tell them apart or let a stale one decay.
  last_observed_at timestamptz,
  -- ⚖️ RETENTION IS NEVER-PERSIST BY DEFAULT. The chosen policy is to extract
  -- in-flight and discard the raw transcript, so this is expected to stay NULL —
  -- which `sourceExpired` reads as "never retained", the STRONGEST state. The
  -- column exists so that a short retention window can be adopted later as a
  -- deliberate, visible change rather than a silent one.
  source_expiry timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint creator_knowledge_kind_valid check (
    kind in ('fact', 'opinion', 'topic', 'example', 'experience', 'framework', 'claim', 'product', 'covered')),
  constraint creator_knowledge_basis_valid check (
    basis in ('stated', 'demonstrated', 'inferred')),
  constraint creator_knowledge_text_present check (
    length(btrim(text)) between 1 and 240),
  constraint creator_knowledge_times_seen_positive check (times_seen >= 1),
  constraint creator_knowledge_confidence_unit check (confidence >= 0 and confidence <= 1),
  constraint creator_knowledge_source_ref_short check (
    source_ref is null or length(source_ref) <= 200)
);

-- THE SAME CLAIM TWICE IS ONE CLAIM WITH A HIGHER COUNT. Re-scanning must raise
-- `times_seen`, not fill the table with copies — the accumulate-across-scans
-- behaviour above is only true if repeats merge. Scoped per owner and voice so
-- two voices can legitimately hold the same position.
create unique index if not exists creator_knowledge_one_per_claim
  on public.creator_knowledge (owner_id, coalesce(voice_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, lower(btrim(text)));

create index if not exists creator_knowledge_owner_idx
  on public.creator_knowledge (owner_id, times_seen desc);

-- WHAT THE AUDIENCE KEEPS ASKING — summaries only. See the header.
create table if not exists public.audience_questions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  voice_id    uuid references public.brand_voices (id) on delete set null,
  summary     text not null,
  asked       integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint audience_questions_summary_present check (
    length(btrim(summary)) between 1 and 240),
  constraint audience_questions_asked_positive check (asked >= 1)
);

create unique index if not exists audience_questions_one_per_summary
  on public.audience_questions (owner_id, coalesce(voice_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(summary)));

create or replace function public.creator_knowledge_touch()
returns trigger
language plpgsql
security invoker set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists creator_knowledge_touch on public.creator_knowledge;
create trigger creator_knowledge_touch
  before update on public.creator_knowledge
  for each row execute function public.creator_knowledge_touch();

drop trigger if exists audience_questions_touch on public.audience_questions;
create trigger audience_questions_touch
  before update on public.audience_questions
  for each row execute function public.creator_knowledge_touch();

alter table public.creator_knowledge enable row level security;
alter table public.audience_questions enable row level security;

-- ⚖️ NO INSERT POLICY, AND THAT IS DELIBERATE — the asymmetry with
-- `product_entities` is the point. Those rows are the creator's OWN answers, so
-- they insert them. These are DISTILLED FROM THEIR VIDEOS by the extractor, so
-- only the service-role worker writes them. A creator who could insert here
-- could assert "I have said X" about themselves and have the writer voice it as
-- observed fact, which empties `basis` of meaning.
--
-- They can still READ everything held about them, CORRECT it, and DELETE it,
-- which is the part that matters.
create policy "own knowledge read"
  on public.creator_knowledge for select using (auth.uid() = owner_id);
create policy "own knowledge correct"
  on public.creator_knowledge for update
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own knowledge delete"
  on public.creator_knowledge for delete using (auth.uid() = owner_id);

create policy "own audience read"
  on public.audience_questions for select using (auth.uid() = owner_id);
create policy "own audience delete"
  on public.audience_questions for delete using (auth.uid() = owner_id);

grant select, update, delete on public.creator_knowledge to authenticated;
grant select, delete on public.audience_questions to authenticated;
