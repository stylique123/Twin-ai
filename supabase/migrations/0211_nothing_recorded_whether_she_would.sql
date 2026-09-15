-- NOTHING RECORDED WHETHER SHE WOULD HAVE.
--
-- ⚠️ MEASURED ON PRODUCTION 2026-09-14: 134 scripts generated, 6 camera opens,
-- 6 recordings, 0 script edits, 0 exports. 128 of 134 scripts never had a
-- camera opened, and there is no row anywhere that says whether the creator
-- would have recorded them.
--
-- ⚠️⚠️ SO THE DROP IS UNATTRIBUTABLE, AND THAT IS THE ONLY PROBLEM THIS SOLVES.
-- `recordingFunnel.ts` is explicit: a funnel says where people died, never what
-- killed them. 128 non-openers is equally consistent with a bad script, an
-- irrelevant premise, an intimidating record button, no time, or somebody who
-- was only ever clicking around — and those need OPPOSITE fixes. That file
-- calls this "the single most valuable event this product does not yet
-- collect", and `SCRIPT_INTENTS` / `NO_RECORD_REASONS` have been written,
-- labelled in plain English, and read by nothing since it was created.
--
-- ⚖️ ON `generations`, NOT ITS OWN TABLE, because the grain is exactly one row
-- per script. Intent is a fact about THIS script; a separate table would invite
-- two rows for one answer and a join to discover which was current. This is the
-- same placement `accepted_final_*` (0182) and `hook_choice` (0134) already use
-- for the same reason.
--
-- ⚖️ THREE COLUMNS AND NOT ONE, because a refusal without its reason is a
-- number nobody can act on. And the reason is nullable even when the intent is
-- `would_not_record`: a creator who declines to say why has still told us
-- something, and forcing a reason would make the honest answer impossible.
--
-- ⚠️ NO DEFAULT, EVER. An unanswered question must read as NULL, because
-- `OPTIONAL_STAGES` in recordingFunnel.ts contains `script_intent` for exactly
-- this reason: "a question nobody was shown is our omission, not their
-- abandonment — left required it would absorb the drop and report 'dropped at
-- script_intent' for 39 people who were never asked anything, hiding the fact
-- that what they actually did was not open the camera."

alter table public.generations
  add column if not exists script_intent text,
  add column if not exists script_intent_at timestamptz,
  add column if not exists no_record_reason text;

-- ⚠️ THE ENUMS LIVE IN THE DATABASE TOO, because a client is not a validator.
-- These must stay identical to SCRIPT_INTENTS and NO_RECORD_REASONS in
-- packages/shared/src/recordingFunnel.ts; a parity test asserts it.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'generations_script_intent_known'
  ) then
    alter table public.generations
      add constraint generations_script_intent_known check (
        script_intent is null
        or script_intent in ('would_record', 'would_edit_first', 'would_not_record')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'generations_no_record_reason_known'
  ) then
    alter table public.generations
      add constraint generations_no_record_reason_known check (
        no_record_reason is null
        or no_record_reason in (
          'topic_not_relevant', 'script_generic', 'not_my_voice', 'cannot_film_it',
          'recording_too_hard', 'no_time', 'just_exploring', 'other'
        )
      );
  end if;

  -- ⚠️ A REASON WITHOUT A REFUSAL IS A ROW NOBODY CAN READ. "It feels generic"
  -- attached to `would_record` is two answers that contradict each other, and a
  -- quality metric counting it would be counting a contradiction.
  if not exists (
    select 1 from pg_constraint where conname = 'generations_reason_needs_a_refusal'
  ) then
    alter table public.generations
      add constraint generations_reason_needs_a_refusal check (
        no_record_reason is null or script_intent = 'would_not_record'
      );
  end if;

  -- The timestamp and the answer arrive together or not at all; a time with no
  -- answer would put a row in the funnel's `script_intent` stage carrying
  -- nothing.
  if not exists (
    select 1 from pg_constraint where conname = 'generations_intent_time_needs_an_intent'
  ) then
    alter table public.generations
      add constraint generations_intent_time_needs_an_intent check (
        (script_intent is null) = (script_intent_at is null)
      );
  end if;
end $$;

-- ⚠️ THE CLIENT WRITES THIS, so it needs the same column-level grant
-- `hook_choice` (0134) and `accepted_final_*` (0182) have. Column grants are
-- what stop a client patching anything else on the row, which is why
-- `updateGenerationChoice` can take a free-form patch object safely.
grant update (script_intent, script_intent_at, no_record_reason)
  on public.generations to authenticated;

comment on column public.generations.script_intent is
  'Whether the creator said they would record this script. NULL means they were '
  'never asked, which is OUR omission and not their abandonment — never a default.';
comment on column public.generations.no_record_reason is
  'Why not, when they said no. Nullable even then: declining to say is itself an '
  'answer. Two values (no_time, just_exploring) are NOT script rejections and '
  'must never be pooled with the rest — see NOT_A_SCRIPT_REJECTION.';
