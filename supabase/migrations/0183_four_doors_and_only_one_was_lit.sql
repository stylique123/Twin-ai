-- WHICH WAY IN DID THEY TAKE, AND DID THEY KNOW THE OTHERS WERE THERE?
--
-- ⚠️ NEITHER HALF OF THAT IS ANSWERABLE TODAY. `V2Create` routes on a regex —
-- `/^https?:\/\//` sends the text to `reference_url`, anything else to
-- `reference_note` — and the two are genuinely different builds. Nothing records
-- which one happened. `generations` carries the RESULT (a url, or a note), so a
-- note row is equally consistent with "they chose to describe an idea" and with
-- "they pasted something that did not look like a link and were silently
-- re-routed". Those are opposite findings and the table cannot separate them.
--
-- ⚠️ AND THE OFFER IS THE HALF THAT MAKES THE COUNT READABLE. "Most creators
-- take the reference door" means one thing when four doors are on screen and
-- nothing at all when the screen says "Paste a video link…" and shows one. The
-- old screen was the second case, so any door count taken before this ships
-- would measure the copy, not the creator. `offered` is stored per row rather
-- than derived from the shipped version, because the screen changes and the
-- rows have to stay interpretable after it does.
--
-- ⚖️ ONE ROW PER ENTRY, NOT ONE PER CREATOR. A creator who starts three videos
-- this week made three separate choices, and collapsing them would turn a
-- behaviour into a preference. That means this table GROWS with use — it is an
-- append-only impression log, deliberately narrow, and it holds no creator text.
--
-- ⚠️ IT STORES NO SENTENCE THE CREATOR TYPED. `had_text` is a boolean, because
-- the question here is "did they arrive with something", not "what was it" —
-- the words themselves already land on `generations` when a build happens, and
-- copying them into a second table would create two records that can disagree
-- about what the creator said.

create table if not exists public.entry_impressions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,

  -- 'reference' | 'idea' | 'product' | 'browse'. See packages/shared/src/entryDoor.ts.
  -- ⚖️ TEXT WITH A CHECK, NOT AN ENUM, following 0128's reasoning verbatim: a
  -- fifth door should be countable before it needs a migration.
  door text not null,

  -- 'chosen' | 'preselected'. THE DISTINCTION THE REGEX COULD NOT DRAW, and the
  -- reason this table exists at all.
  source text not null,

  -- Every door on screen at that moment, including the one taken. Fixed order,
  -- deduped, normalised by `entryImpression` so two rows are comparable without
  -- the reader knowing how the caller spelled its array.
  offered text[] not null,

  -- Whether anything had been typed yet. Separates "opened on the idea door and
  -- wrote something" from "opened on it and left".
  had_text boolean not null,

  created_at timestamptz not null default now(),

  constraint entry_impressions_door_valid
    check (door in ('reference', 'idea', 'product', 'browse')),
  constraint entry_impressions_source_valid
    check (source in ('chosen', 'preselected')),
  -- ⚠️ A DOOR YOU WENT THROUGH WAS ON SCREEN BY DEFINITION. Without this a
  -- caller that forgot to list it writes a row saying a creator took a door
  -- nobody was offering, and that row is indistinguishable from a real finding
  -- about a hidden door.
  constraint entry_impressions_offered_contains_door
    check (door = any(offered)),
  -- An empty offer is not a screen. One door IS a legitimate row (it is what the
  -- old screen would have written) so the floor is one, not two.
  constraint entry_impressions_offered_nonempty
    check (array_length(offered, 1) between 1 and 8)
);

-- The query this exists to serve: door mix over time, and door mix conditioned
-- on what was offered.
create index if not exists entry_impressions_owner
  on public.entry_impressions (owner_id, created_at desc);
create index if not exists entry_impressions_door
  on public.entry_impressions (door, created_at desc);

alter table public.entry_impressions enable row level security;

-- ⚠️ INSERT AND SELECT ONLY. An impression is a fact about a moment that has
-- already happened; nothing may edit or delete one, so there is deliberately no
-- update or delete policy. A log that can be rewritten is not evidence.
drop policy if exists entry_impressions_select_own on public.entry_impressions;
create policy entry_impressions_select_own on public.entry_impressions
  for select using (auth.uid() = owner_id);

drop policy if exists entry_impressions_insert_own on public.entry_impressions;
create policy entry_impressions_insert_own on public.entry_impressions
  for insert with check (auth.uid() = owner_id);

comment on table public.entry_impressions is
  'One row per time a creator starts a video: which door they took, whether they '
  'chose it or the screen preselected it, and which doors were on screen. Holds '
  'no creator text. Append-only — there is no update or delete policy.';

comment on column public.entry_impressions.offered is
  'Doors visible at that moment, including the one taken. Stored per row, not '
  'derived from the shipped screen, so rows stay interpretable after the screen changes.';
