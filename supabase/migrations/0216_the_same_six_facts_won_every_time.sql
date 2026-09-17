-- WHAT HAS ALREADY BEEN SPENT, SO THE SAME SIX FACTS STOP WINNING.
--
-- ⚠️ THE DEFECT IS NOT A SHORTAGE OF SUPPLY. A creator with forty good facts
-- produces one good script and then five near-repeats of it, because the
-- selector is DETERMINISTIC on inputs that barely move: relevance against the
-- brief, then `times_seen`, then kind. Run it twice on the same niche and the
-- same rows win twice. §G17 already records repetition as the top defect in
-- finished scripts and records that it does not respond to instruction; this is
-- one of its mechanical causes, upstream of the writer entirely.
--
-- ⚖️ SO THIS IS BOOKKEEPING, NOT EXTRACTION, AND THAT IS WHY IT IS WORTH DOING
-- FIRST. Every other way to improve depth gets MORE material. This makes the
-- material already held actually reach a script. More supply poured into a
-- selector that spends the same six rows forever does not move the number it
-- appears to move.
--
-- ⚖️ TWO COLUMNS, NOT A LEDGER TABLE, AND THE REJECTED DESIGN IS WORTH RECORDING.
-- A `knowledge_spend(knowledge_id, generation_id, spent_at)` table is the more
-- auditable shape and was the first draft. It was rejected because the SELECTOR
-- is the reader, the selector runs inside the generation's hot path, and
-- PostgREST cannot aggregate a child table in the same query — so every
-- generation would pay a second round trip, or the two would drift into two
-- answers to one question. What a generation used is separately recoverable
-- from `generations.selection`, which already exists and is already written.
--
-- ⚠️ `spend_count` DEFAULTS TO 0 AND `last_spent_at` TO NULL, AND THE PAIR IS
-- READ AS "NEVER SPENT" ONLY WHEN BOTH AGREE. Every one of the existing rows
-- starts there, which is TRUE of them: nothing has ever recorded a spend, so
-- nothing has been spent as far as this database knows. This is the one place in
-- the knowledge table where a zero default is honest rather than a guess, and
-- the reason is that the absence is OURS, not the creator's.
alter table public.creator_knowledge
  add column if not exists last_spent_at timestamptz,
  add column if not exists spend_count integer not null default 0;

alter table public.creator_knowledge
  drop constraint if exists creator_knowledge_spend_count_sane;
alter table public.creator_knowledge
  add constraint creator_knowledge_spend_count_sane
  check (spend_count >= 0);

comment on column public.creator_knowledge.last_spent_at is
  'When this row last reached a DELIVERED script. NULL means never. Not written for a generation that was refunded, because a script the creator was not charged for did not spend anything.';
comment on column public.creator_knowledge.spend_count is
  'How many delivered scripts this row has reached. 0 is honest rather than a guess: the absence is ours, not the creator''s.';

-- The selector orders on these inside the generation's hot path.
create index if not exists creator_knowledge_spend_idx
  on public.creator_knowledge (owner_id, last_spent_at);

-- MARK WHAT A DELIVERED SCRIPT ACTUALLY USED.
--
-- ⚠️ IT TAKES THE IDS THE PROMPT CARRIED, NOT THE IDS THAT WERE SELECTED
-- UPSTREAM OF IT. Those differ: `selectSpeakable` caps at ten, and a row that
-- lost its slot was not spent. Marking the wider set would retire material that
-- never reached a writer, which is the same defect as the one this fixes,
-- pointing the other way and harder to see.
--
-- ⚖️ OWNER-SCOPED, so a caller cannot age out another account's knowledge.
-- `security definer` is what lets the edge write columns the creator's own RLS
-- policy does not expose for update; the owner filter is what keeps that from
-- being a hole.
--
-- ⚖️ AND IT IS IDEMPOTENT PER CALL, NOT PER ROW. Calling it twice for one
-- generation counts two spends, which is WRONG but harmless — it retires a row
-- slightly early. The alternative, keying on a generation id, would make this
-- function fail when a generation is regenerated, which retires nothing and is
-- worse. Stated rather than silently chosen.
create or replace function public.mark_knowledge_spent(p_owner uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;
  with marked as (
    update public.creator_knowledge
      set last_spent_at = now(),
          spend_count = spend_count + 1,
          updated_at = now()
    where owner_id = p_owner
      and id = any(p_ids)
    returning 1
  )
  select count(*) into v_count from marked;
  return v_count;
end;
$$;

revoke all on function public.mark_knowledge_spent(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.mark_knowledge_spent(uuid, uuid[]) to service_role;

comment on function public.mark_knowledge_spent(uuid, uuid[]) is
  'Record that these knowledge rows reached a delivered script. Owner-scoped. Called only on a billable generation: a refunded script spent nothing.';
