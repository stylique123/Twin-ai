-- WHAT THE CREATOR CHOSE, KEPT.
--
-- ⚠️ 41 GENERATIONS, ZERO RECORDS. The goal, the focus and the reference
-- preference reach the writer and are then gone — not on `generations`, not in
-- `blueprint`, not in `beat_audit`. Verified by querying all three.
--
-- ⚠️ SO EVERY QUESTION ABOUT THESE OPTIONS IS CURRENTLY UNANSWERABLE. Does
-- anybody pick `authority`? Did retiring the outcome question change what people
-- choose? Is `stay_close` ever used? These options are supposed to drive Gallery
-- ranking, the Creative Decision Plan, script structure and CTA behaviour, and
-- there is no evidence about any of it.
--
-- ⚖️ AND IT BLOCKS A DECISION ALREADY IN FRONT OF US. The `sell` + no-commercial-
-- target contradiction cannot be measured before it is fixed, because nothing
-- records how often `sell` is chosen at all. Measure-before-enforcing is not
-- optional discipline here; it is the difference between fixing a real rate and
-- guessing at one.
--
-- ⚖️ A TABLE RATHER THAN MORE JSON ON `generations`. These are the questions we
-- expect to aggregate — counts by goal, by focus, over time — and a jsonb blob is
-- where aggregation goes to die. One row per generation, columns that GROUP BY.

create table if not exists public.generation_choices (
  id uuid primary key default gen_random_uuid(),
  -- ⚠️ CASCADE, because a choice about a deleted video is not a fact anybody can
  -- use, and "delete a video deletes it" is an existing promise this must keep.
  generation_id uuid not null references public.generations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,

  -- ⚖️ TEXT, NOT AN ENUM TYPE. These vocabularies change — the outcome question
  -- was retired this month — and a Postgres enum turns every change into a
  -- migration with a lock. The application owns the vocabulary; this records what
  -- was chosen, including a value that has since been retired, which is exactly
  -- the history worth having.
  selected_goal text,
  selected_focus text,
  reference_use text,

  -- ⚠️ NULLABLE AND MEANT TO BE. Most videos promote nothing, and a NOT NULL here
  -- would force a placeholder that later reads as a product.
  selected_product_id uuid references public.product_entities(id) on delete set null,

  created_at timestamptz not null default now(),

  -- One row per generation. A retry must not double-count a choice.
  unique (generation_id)
);

create index if not exists generation_choices_owner_created_idx
  on public.generation_choices (owner_id, created_at desc);
-- The aggregate this exists to serve: how often is each goal chosen.
create index if not exists generation_choices_goal_idx
  on public.generation_choices (selected_goal);

alter table public.generation_choices enable row level security;

-- ⚠️ READ YOUR OWN, WRITE NOTHING. The rows are written by the edge function
-- under the service role; a client that could INSERT here could report choices
-- nobody made, and the whole value of the table is that it records what actually
-- happened. No insert, update or delete policy is granted to `authenticated`
-- ON PURPOSE — this is not an omission to be helpfully filled in later.
drop policy if exists generation_choices_select_own on public.generation_choices;
create policy generation_choices_select_own on public.generation_choices
  for select to authenticated
  using (owner_id = auth.uid());

grant select on public.generation_choices to authenticated;

-- ⚖️ NO `changed_from_default` COLUMN, AND THE REASON IS NOT OVERSIGHT. It was
-- asked for, and it answers a good question: is Twin's recommended default
-- actually useful? But Twin does not currently pre-select or recommend a goal —
-- the chips start empty and the creator must pick one. A column recording
-- "changed from nothing" would answer a different question than the one asked,
-- and would read as evidence about a default that does not exist. It belongs in
-- the same change that introduces a recommended default, where it can mean what
-- its name says.
