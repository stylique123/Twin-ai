-- WHICH VERSION DID THEY STOP AT?
--
-- ⚠️ `script_edits` (0127) RECORDS EVERY EDIT WITH ITS BEFORE AND AFTER, and
-- cannot say which one was the last. An edit trail without a terminus is a list
-- of attempts with no answer to "and then what did they shoot" — so the pair
-- that actually carries signal (what we wrote → what they were willing to say
-- out loud) cannot be assembled from it at all.
--
-- ⚖️ AND THE COST IS PAID IN ADVANCE, WHICH IS WHY THIS IS A COLUMN AND NOT AN
-- EVENT. Every edit row written before this exists is an attempt that cannot be
-- told from a decision. Storing the terminus in `ops_events` would work for
-- counting and would be useless for the join the ranking signal actually needs,
-- and the rows accumulating in the meantime would have to be discarded rather
-- than backfilled. A column on `generations` makes today's edits usable later;
-- an event makes them evidence of nothing.
--
-- ── WHAT THE ACCEPTANCE IS ────────────────────────────────────────────────
--
-- Entering the teleprompter with a script, not saving an edit. A save is
-- mid-thought; a creator who opens the recorder has stopped arguing.
-- `prepareCaptureMode('record', ...)` is the one seam (Constitution §5.1) and it
-- already proves the script is durable before the teleprompter is usable, so the
-- version recorded here is the version in the database — never a draft.
--
-- ⚠️ RE-ENTRY IS NOT A SECOND ACCEPTANCE. Creators open the recorder, back out,
-- change a line and come back. The sha is the words; a re-entry with the same
-- words overwrites with an identical value and moves `accepted_final_at`, which
-- is the honest record of "they looked again and still meant it". Counting
-- entries would report someone checking their script three times as three
-- decisions.

alter table public.generations
  -- ⚠️ NOT CRYPTOGRAPHIC AND NOT MEANT TO BE. FNV-1a over the spoken lines, for
  -- change detection between two versions of one script. See
  -- packages/shared/src/acceptedFinal.ts, which is the only writer.
  add column if not exists accepted_final_sha text,
  add column if not exists accepted_final_at timestamptz,
  -- Cheap corroboration: a sha alone cannot tell a reader whether the accepted
  -- script grew or shrank against what was generated.
  add column if not exists accepted_final_word_count integer;

-- ⚠️ ALL THREE OR NONE. A sha with no timestamp is a half-written row, and a
-- timestamp with no sha claims an acceptance nobody can identify. The failure
-- this forbids is a partial write leaving a row that looks like evidence.
alter table public.generations
  drop constraint if exists generations_accepted_final_all_or_nothing;
alter table public.generations
  add constraint generations_accepted_final_all_or_nothing check (
    (accepted_final_sha is null and accepted_final_at is null and accepted_final_word_count is null)
    or (accepted_final_sha is not null and accepted_final_at is not null and accepted_final_word_count is not null)
  );

-- ⚠️ A COUNT THAT CANNOT BE NEGATIVE, AND ZERO IS ALSO REFUSED. A script with no
-- spoken words is not an acceptance of an empty script; it is an event that did
-- not happen, and the client returns null rather than a zero stamp. This is the
-- database refusing to store the row the client is written never to send.
alter table public.generations
  drop constraint if exists generations_accepted_final_word_count_positive;
alter table public.generations
  add constraint generations_accepted_final_word_count_positive check (
    accepted_final_word_count is null or accepted_final_word_count > 0
  );

-- The query this exists to serve: the accepted generations for one creator,
-- newest first, to be joined against `script_edits`.
create index if not exists generations_accepted_final_idx
  on public.generations (user_id, accepted_final_at desc)
  where accepted_final_at is not null;

-- ⚠️ COLUMN BY COLUMN, like every other client-writable field on this table
-- (0014 selected_hook, 0036 approved, 0053 scene_timeline, 0134 hook_choice).
-- A table-wide update grant here would let a client rewrite the blueprint it was
-- charged for.
grant update (accepted_final_sha, accepted_final_at, accepted_final_word_count)
  on public.generations to authenticated;

comment on column public.generations.accepted_final_sha is
  'FNV-1a of the spoken lines of the script the creator took to camera. NOT cryptographic; identity only. NULL means no acceptance has been recorded, never "they accepted nothing".';
