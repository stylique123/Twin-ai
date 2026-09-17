-- THE STORE NEVER RECORDED WHAT IT HAD ALREADY SPENT.
--
-- ⚠️ THE DEFECT, AND IT IS THE CHEAPEST REAL ONE LEFT. A prompt carries about ten
-- knowledge items, chosen by lexical overlap with the video's topic and then a
-- substance floor. Nothing anywhere records that an item was ALREADY SUPPLIED to
-- a previous script. So a creator with 30 usable items and a topic they return to
-- gets the SAME handful every time: the ranking is deterministic, the store is
-- static between scans, and the same overlap computation produces the same
-- winners. Measured: 27 of 42 voices clear the substance floor of 6, the median
-- voice holds 10 items, and only 2 have what could be called months of runway —
-- and the runway they do have is spent on repetition nobody can see.
--
-- ⚖️ SO THIS IS BOOKKEEPING, NOT INTELLIGENCE, and that is the argument for doing
-- it first. It needs no new scraping, no model call and no new corpus: it makes
-- the material already stored reach a script instead of the same tenth of it
-- reaching every script. Pouring more raw material into a ranking that cannot
-- rotate is filling a bucket with a hole in it.
--
-- ⚠️ THE UNIT IS "SUPPLIED", NOT "QUOTED", AND THE CHOICE IS DELIBERATE. We know
-- exactly which items were put in front of the writer; whether a beat then quoted
-- one is a fuzzy text match against `substance_evidence`. Both readings argue for
-- the same rotation anyway: an item the writer saw and USED should not lead the
-- next script (that is repetition), and an item it saw and IGNORED should not
-- occupy the same slot a third time (that is waste). One honest rule beats two
-- guesses, and the ledger keeps `generation_id` so a stricter definition can be
-- computed later from rows already written.

-- ⚖️ TWO DENORMALISED COLUMNS SO THE RANKING NEEDS NO JOIN. The selector runs
-- inside one generation's hot path and already makes two reads of this table;
-- adding an aggregate over a ledger to each of them would put a join on the
-- critical path to save two columns.
alter table public.creator_knowledge
  add column if not exists last_used_at timestamptz,
  add column if not exists used_count integer not null default 0;

comment on column public.creator_knowledge.last_used_at is
  'When this item was last SUPPLIED to a script prompt. NULL = never supplied, which is what makes it lead the next one. Not "when she last said it" — that is last_observed_at.';
comment on column public.creator_knowledge.used_count is
  'How many script prompts this item has been supplied to. 0 and NULL would mean the same thing, so it defaults to 0 rather than being nullable.';

-- ⚖️ AND THE LEDGER ITSELF, INSERT-ONLY. The two columns answer "rotate this
-- one?"; the ledger answers "what did that script actually get, and what has
-- this creator's whole runway been spent on" — the coverage question, which a
-- pair of counters can never answer because it has no rows to count.
create table if not exists public.creator_knowledge_uses (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  voice_id      uuid,
  knowledge_id  uuid not null references public.creator_knowledge (id) on delete cascade,
  generation_id uuid,
  used_at       timestamptz not null default now()
);

-- ⚠️ ONE ROW PER ITEM PER GENERATION. A retried generation, or a rescue path that
-- records twice, must not make an item look twice as spent as it is — the counter
-- above is derived from this and would inherit the error permanently.
create unique index if not exists creator_knowledge_uses_once
  on public.creator_knowledge_uses (generation_id, knowledge_id)
  where generation_id is not null;

create index if not exists creator_knowledge_uses_owner_idx
  on public.creator_knowledge_uses (owner_id, used_at desc);

alter table public.creator_knowledge_uses enable row level security;

-- ⚠️ NO POLICIES, DELIBERATELY, AND THE SAME REASONING 0121 RECORDS FOR
-- `creator_knowledge`: nothing a creator controls should be able to write claims
-- — or the record of which claims we used — about themselves. RLS on with no
-- policy denies every non-service caller, which is the state we want and is
-- stated here so its absence does not read as an omission.
revoke all on table public.creator_knowledge_uses from public, anon, authenticated;
grant select, insert on table public.creator_knowledge_uses to service_role;

comment on table public.creator_knowledge_uses is
  'Insert-only ledger: which creator_knowledge items were SUPPLIED to which generation''s prompt. Service role only. The denormalised counters on creator_knowledge are derived from this.';

-- ── THE WRITER, AND THE ONLY WAY THE COUNTERS CAN STAY TRUE ────────────────
--
-- ⚠️ THE LEDGER AND THE COUNTERS MUST MOVE TOGETHER OR NEITHER IS TRUSTWORTHY.
-- Two round trips from the edge (insert rows, then bump counters) can half-fail
-- and leave a count that disagrees with the ledger it claims to summarise. One
-- function, one statement each, one transaction.
--
-- ⚖️ AND THE BUMP ONLY COUNTS ROWS THE LEDGER ACTUALLY ACCEPTED. `on conflict do
-- nothing` makes a repeat call a no-op, so a retry cannot inflate `used_count` —
-- the reason the unique index above exists.
create or replace function public.record_knowledge_use(
  p_owner uuid,
  p_generation uuid,
  p_voice uuid,
  p_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_owner is null then
    raise exception 'record_knowledge_use: p_owner is required';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  with inserted as (
    insert into public.creator_knowledge_uses (owner_id, voice_id, knowledge_id, generation_id)
    -- ⚖️ THE ID MUST BELONG TO THIS OWNER. The edge passes ids it read a moment
    -- ago, but a ledger that trusts an id it was handed is a ledger that can be
    -- made to say one creator's script used another creator's knowledge.
    select p_owner, p_voice, k.id, p_generation
    from public.creator_knowledge k
    where k.id = any(p_ids) and k.owner_id = p_owner
    on conflict do nothing
    returning knowledge_id
  ),
  bumped as (
    update public.creator_knowledge k
    set used_count = k.used_count + 1,
        last_used_at = now()
    where k.id in (select knowledge_id from inserted)
    returning 1
  )
  select count(*) into v_count from bumped;
  return v_count;
end;
$$;

revoke all on function public.record_knowledge_use(uuid, uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.record_knowledge_use(uuid, uuid, uuid, uuid[]) to service_role;

comment on function public.record_knowledge_use(uuid, uuid, uuid, uuid[]) is
  'Record that these knowledge items were supplied to one generation''s prompt, and bump their rotation counters. Idempotent per (generation_id, knowledge_id); ids not belonging to p_owner are ignored. Returns how many counters moved.';
