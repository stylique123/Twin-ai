-- NO VIDEO TWIN HAS EVER WRITTEN HAS AN OUTCOME.
--
-- ⚠️ MEASURED, 2026-09-09. 85 generations. `post_outcome_observations` holds
-- ZERO rows. Nothing anywhere records whether a script Twin wrote was filmed,
-- let alone published or watched. So every ranking decision in the product --
-- which references to surface, which angles to offer, which hook shapes to
-- generate -- rests on what creators CLICK, which is a measure of what looks
-- appealing in a gallery and not of what turned into a video.
--
-- ⚖️ THE SIGNAL THIS UNLOCKS IS ONE NOBODY ELSE CAN COMPUTE. Views on the
-- original reference say it was a good video. Whether a REMIX of it got filmed
-- says it was a good REFERENCE. Only Twin sees both ends of that, and it is the
-- ranking signal the gallery has been missing.
--
-- ── WHY A ROW AT GENERATION TIME, AND NOT A COLUMN ADDED LATER ────────────
--
-- ⚠️ THE CONTEXT IS UNRECOVERABLE AFTERWARDS. Which door she came through,
-- what shape was written, how long it was targeted at, what stage she was at
-- and what her niche was THAT DAY all exist for the duration of one request and
-- are then discarded. A column added in three months can be backfilled with
-- nothing: the 85 generations already written are permanently unattributable,
-- and every day without this adds ~2.7 more.
--
-- ⚖️ AND THE CONTEXT IS FROZEN ON PURPOSE, NOT JOINED. A creator's follower
-- count and niche change; reading them at analysis time would attribute today's
-- stage to a video made at 1,500 followers, and "segment before aggregating"
-- is the rule this table exists to serve. A frozen snapshot cannot drift from
-- the thing it describes. It is the same argument the frozen borrowing baseline
-- makes: a measuring stick that moves with the thing it measures cannot judge it.
--
-- ⚠️ THIS TABLE WILL NOT SUPPORT A CONCLUSION FOR MONTHS, AND THAT IS WRITTEN
-- HERE SO A FUTURE READER DOES NOT MISTAKE THIN DATA FOR A FINDING. At ~2.7
-- generations a day, a hundred rows is five weeks and a segmented question --
-- "which hook shape holds attention for creators under 10k in skincare" -- needs
-- many multiples of that. Anything read out of this table before then must state
-- its n. Absence of a finding is not evidence a check ran.

create table if not exists public.generation_outcomes (
  id uuid primary key default gen_random_uuid(),
  -- CASCADE for 0137's reason: an outcome for a deleted video is not a fact
  -- anybody can use, and "delete a video deletes it" is an existing promise.
  generation_id uuid not null references public.generations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,

  -- ── THE CONTEXT, FROZEN AT GENERATION TIME ──────────────────────────────
  --
  -- ⚖️ TEXT, NOT ENUM TYPES, for 0137's reason: these vocabularies change, and
  -- a value retired between the generation and the query is exactly the history
  -- worth keeping. Narrowing to the current enum would silently under-count the
  -- past.
  --
  -- ⚠️ EVERY ONE OF THESE IS NULLABLE AND NULL MEANS "NOT KNOWN", NEVER A
  -- DEFAULT. A generation with no reference has no `reference_mechanism`; a
  -- creator whose scan never produced a niche has no niche. Writing 'unknown'
  -- or 'none' here would create a value that aggregates as though it were an
  -- answer, which is the defect `isConclusive` exists to prevent elsewhere.
  -- ⚠️⚠️ AND THIS IS A SHORTER LIST THAN THE ONE THAT WAS ASKED FOR, BECAUSE
  -- MOST OF IT DOES NOT EXIST. The specification says "everything before
  -- was_filmed exists today and is discarded on every generation". Checked
  -- against the request handler rather than assumed, and that is true of some of
  -- it and false of most: `door`, `hook_shape`, `angle_type`, `format_label`
  -- and `creator_stage_band` are not structured values anywhere in
  -- generate-blueprint. They exist only as prose inside the prompt text.
  --
  -- ⚖️ SO THEY ARE NOT COLUMNS YET. A column nobody writes is the same defect as
  -- a field nobody reads, pointed the other way, and this repository has found
  -- four of the latter this week. Each needs a specific piece of work first,
  -- named here so the gap is a task rather than a mystery:
  --
  --   door               the client knows it and does not send it. `readEntryDoor`
  --                      already exists in packages/shared/src/entryDoor.ts with a
  --                      mutation-tested clamp; the request body needs the field.
  --   hook_shape         nothing classifies the written hook. `hookChoice` records
  --                      WHICH of five was picked, not what SHAPE it was -- and
  --                      production says 45 of 46 were auto-defaults anyway.
  --   angle_type         same: no taxonomy exists, and inventing one here would
  --                      freeze a guess into months of rows.
  --   creator_stage_band needs a follower count at generation time. The scan has
  --                      one; it is not carried into the request.
  --
  -- What follows is only what the handler genuinely holds.

  -- The creator's niche as the scan recorded it, copied rather than joined, so a
  -- creator who changes niche does not retroactively relabel old videos.
  niche text,
  sub_niche text,

  -- ⚖️ THE THREE THE HANDLER ACTUALLY HAS. `selected_goal`, `selected_focus` and
  -- `reference_use` already live in `generation_choices` and are deliberately NOT
  -- duplicated here -- one fact, one home -- so an analysis joins the two tables
  -- on `generation_id` rather than trusting two copies to agree.
  substance_budget_beats integer,
  reference_duration_sec integer,
  had_reference boolean not null,

  -- ── THE OUTCOME, OBSERVED LATER ─────────────────────────────────────────
  --
  -- ⚠️⚠️ THREE STATES, AND COLLAPSING TWO OF THEM DESTROYS THE ONLY NEGATIVE
  -- SIGNAL IN THE PRODUCT. `false` means she looked at the script and decided
  -- not to film it. NULL means she has not said yet. Those are completely
  -- different facts: the first is the single most valuable row this table can
  -- hold, because everything else in Twin measures enthusiasm at the moment of
  -- clicking and nothing measures regret. A boolean defaulting to false would
  -- record every unanswered script as a rejection and drown the real ones.
  --
  -- ⚖️ SO: NULLABLE, NO DEFAULT, AND SILENCE IS NEITHER ANSWER. The same rule
  -- the capability questions already follow.
  was_filmed boolean,
  filmed_answered_at timestamptz,
  was_published boolean,
  published_at timestamptz,

  -- ⚠️ NULL IS NOT ZERO, AND HERE IT IS THE WHOLE DIFFERENCE BETWEEN "posted
  -- and nobody watched" and "we have not looked yet". A video with 0 views at
  -- 24h is a finding; a video we never measured is not.
  views_24h integer,
  views_7d integer,
  retention_pct numeric,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One row per generation. A retry must not double-count an outcome.
  unique (generation_id)
);

-- The two aggregates this exists to serve: outcomes for one creator over time,
-- and "which shapes actually got filmed" segmented the way the rule requires.
create index if not exists generation_outcomes_owner_created_idx
  on public.generation_outcomes (owner_id, created_at desc);
-- ⚖️ PARTIAL, because the only rows this question has any use for are the ones
-- somebody answered, and today that is none of them.
create index if not exists generation_outcomes_filmed_idx
  on public.generation_outcomes (niche, had_reference)
  where was_filmed is not null;

alter table public.generation_outcomes enable row level security;

-- ⚠️ READ YOUR OWN, WRITE NOTHING -- 0137's rule, and it matters more here.
-- The context half is written by the edge function under the service role, and
-- a client that could INSERT could report a shape that was never generated. The
-- creator's own answer to "did you film it" still does not come through a table
-- grant: it goes through a function that may set that one column and no other,
-- so answering a question can never become rewriting the context it is about.
-- No insert, update or delete policy is granted to `authenticated` ON PURPOSE.
drop policy if exists generation_outcomes_select_own on public.generation_outcomes;
create policy generation_outcomes_select_own on public.generation_outcomes
  for select to authenticated
  using (owner_id = auth.uid());

grant select on public.generation_outcomes to authenticated;

-- ⚠️ AND THE DEFAULTS MUST BE TAKEN BACK, WHICH GRANTING SELECT DOES NOT DO.
-- Verified on production for 0137: `authenticated` held INSERT, UPDATE, DELETE
-- and TRUNCATE afterwards, because Supabase's default privileges grant ALL on
-- new public tables and a narrower `grant select` adds to them rather than
-- replacing them. A table that records what happened must not be writable by
-- the people it records.
revoke insert, update, delete, truncate on public.generation_outcomes from authenticated;
revoke all on public.generation_outcomes from anon;

comment on table public.generation_outcomes is
  'One row per generation, written at generation time with the context frozen, '
  'and updated later with what actually happened to the video. AT ~2.7 '
  'GENERATIONS A DAY THIS NEEDS MONTHS BEFORE IT SUPPORTS A CONCLUSION -- state '
  'the sample size with anything read out of it. was_filmed is three-state: '
  'true filmed, false declined, NULL not yet asked; false is the only negative '
  'signal in the product and must never be defaulted.';

comment on column public.generation_outcomes.was_filmed is
  'true = filmed. false = looked at it and did not film it. NULL = not answered. '
  'Collapsing false and NULL destroys the only measure of regret Twin has.';
