-- A COMMUNITY IS NOT ONE THING TO FILM.
--
-- Every other product type has a single answer to "what does the camera see":
-- the object, the landing page, the dashboard. A community has SURFACES — the
-- about page, the feed, the classroom, the calendar, the one pinned win — and
-- each one proves something different. Legitimacy, activity, curriculum value,
-- cadence, results. A creator told "show your community" has no idea which of
-- those to open, so they open the feed, which is the weakest of them.
--
-- ⚖️ ONE COLUMN, NOT SIX. The map is a document about one entity and is read
-- whole or not at all; splitting it into columns would invite half-answers that
-- each look complete. It also keeps this to a single additive column on a table
-- that already exists, which is the cheapest shape that can carry the answer.
--
-- ⚠️ AND THE THREE-STATE DISCIPLINE IS THE WHOLE POINT, so it is written here
-- rather than left to the reader:
--     absent   — the creator was never asked, or skipped. The writer stays
--                SILENT about it. Never guessed at, never filled in.
--     explicit — "none", "private", "free". A real answer, including a negative
--                one, and the writer must not ask for it again.
--     value    — usable.
-- `null` on this column means the creator has no community map at all, which is
-- the ordinary state for every product that is not a community.
alter table public.product_entities
  add column if not exists community_map jsonb;

-- ⚠️ A MAP THAT IS NOT AN OBJECT IS A BUG, NOT A VARIANT. The readers index into
-- it by key; an array or a bare string would read as undefined at every field
-- and produce a community scene built from nothing, silently. Null stays legal
-- because "no map" is the normal case.
alter table public.product_entities
  drop constraint if exists product_entities_community_map_is_an_object;
alter table public.product_entities
  add constraint product_entities_community_map_is_an_object
  check (community_map is null or jsonb_typeof(community_map) = 'object');

comment on column public.product_entities.community_map is
  'The surfaces, proof items and privacy states for a COMMUNITY entity. Absent = never asked (writer stays silent); explicit "none"/"private" = answered negative (never re-ask); value = usable. Unanswered privacy is treated as blur — nothing ships assuming permission.';
