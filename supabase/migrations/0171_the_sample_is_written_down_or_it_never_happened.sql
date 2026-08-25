-- THE ACCOUNT HALF OF THE TALKING-HEAD GATE HAD NOWHERE TO PUT ITS ANSWER.
--
-- ⚠️ THE MECHANISM EXISTS AND IS CONNECTED TO NOTHING. `messageForOwnAccount`
-- (packages/shared) turns three numbers into a sentence a creator reads about
-- their own videos; `sampleOwnAccount` (worker) produces those numbers. Neither
-- has a caller, and the reason is this: the scan has no per-video talking-head
-- data and no column to keep any in. The reference-video half has been live for
-- weeks -- transcribe.ts -> earlyLookStep -> judgeFit -- because it had a place
-- to write to. This is that place.
--
-- ⚖️ FOUR COLUMNS, NOT ONE jsonb, AND THE REASON IS THE CONSTRAINTS. The counting
-- rule has real invariants -- `usable` only ever increments in the same branch
-- as `checked`, so `usable > checked` is not a possible sample, it is a drifted
-- writer. A jsonb blob can hold that pair and no check would notice. Columns can
-- refuse it. 0170 used jsonb because a community map is an open-ended document;
-- this is four integers with arithmetic between them.
--
-- ⚠️ ALL FOUR OR NONE, WHICH IS THE 0169 LESSON APPLIED. A half-written sample --
-- a count with no `complete` flag, or a flag with no counts -- is a state no
-- reader can act on, and the reader here is a sentence shown to a person about
-- their own work. NULL across the board means NEVER SAMPLED, and that is a
-- legitimate, permanent state for every voice that existed before this shipped.
--
-- ⚖️ AND ABSENT MUST NOT READ AS COMPLETE. This is the exact bug #537 landed to
-- prevent, one layer down. `own_sample_complete` is nullable but NEVER defaults
-- to true: a sample still being collected writes `false`, and a voice that was
-- never sampled writes nothing at all. A DEFAULT true here would hand a verdict
-- to every historical row in the table on the day it applied.
--
-- ⚖️ RE-RUNNABLE: `add column if not exists` throughout, constraints dropped
-- before being added, comments idempotent. Applying this twice changes nothing
-- the second time.

alter table public.brand_voices
  add column if not exists own_sample_usable integer;

alter table public.brand_voices
  add column if not exists own_sample_checked integer;

alter table public.brand_voices
  add column if not exists own_sample_complete boolean;

alter table public.brand_voices
  add column if not exists own_sample_no_answer integer;

comment on column public.brand_voices.own_sample_usable is
  'Of the creator''s own videos we got an answer about, how many are them talking to camera. NULL means never sampled.';

comment on column public.brand_voices.own_sample_checked is
  'Videos we ACTUALLY got an answer about -- never videos we attempted. A video that failed to download was not looked at, and the creator-facing sentence names this number.';

comment on column public.brand_voices.own_sample_complete is
  'False while the sample is still being collected; true when the run finished, including when it finished having learned nothing. NULL means never sampled. NEVER defaults to true -- absent is not complete.';

comment on column public.brand_voices.own_sample_no_answer is
  'Attempts that produced no answer -- failed downloads, model declines. Reported, never folded into own_sample_checked.';

-- ⚠️ A HALF-WRITTEN SAMPLE IS REFUSED. See 0169: a reason with no time and a
-- time with no reason are both states the reader cannot act on.
alter table public.brand_voices
  drop constraint if exists brand_voices_own_sample_is_whole;

alter table public.brand_voices
  add constraint brand_voices_own_sample_is_whole
  check (
    (own_sample_usable is null and own_sample_checked is null
      and own_sample_complete is null and own_sample_no_answer is null)
    or
    (own_sample_usable is not null and own_sample_checked is not null
      and own_sample_complete is not null and own_sample_no_answer is not null)
  );

-- ⚖️ AND THE ARITHMETIC THE COUNTING RULE GUARANTEES IS ENFORCED, not assumed.
-- `countOneLook` increments `usable` only inside the branch that increments
-- `checked`, so usable <= checked holds by construction in the worker. Stating it
-- here means a future writer that stops honouring it fails loudly at the write
-- rather than quietly producing "7 of the 5 videos we looked at".
alter table public.brand_voices
  drop constraint if exists brand_voices_own_sample_arithmetic;

alter table public.brand_voices
  add constraint brand_voices_own_sample_arithmetic
  check (
    own_sample_usable is null
    or (own_sample_usable >= 0
        and own_sample_checked >= 0
        and own_sample_no_answer >= 0
        and own_sample_usable <= own_sample_checked)
  );
