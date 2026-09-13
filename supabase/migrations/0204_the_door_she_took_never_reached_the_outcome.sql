-- 0204 — THE SECOND OF THE FOUR MISSING OUTCOME DIMENSIONS BECOMES A VALUE.
--
-- ⚠️ 0203 LEFT THIS ONE OUT AND SAID EXACTLY WHY: "the client genuinely does not
-- send it. `readEntryDoor` exists with a mutation-tested clamp, so this is a
-- request-shape change across web + edge, not a read the handler can already
-- do." That request-shape change is what ships alongside this migration, so the
-- reason to hold it back is gone rather than waived.
--
-- ⚠️⚠️ AND THE DOOR IS ALREADY RECORDED SOMEWHERE ELSE, WHICH IS NOT THE SAME
-- THING. `entry_impressions` (0183) has held one row per door taken since the
-- four doors were named. It knows a creator went through a door; it does not
-- know what the build that door opened turned into, because nothing joins the
-- two. Joining them after the fact on owner and timestamp would be a guess --
-- a creator who opens the studio twice in a minute breaks it -- so the door is
-- carried onto the outcome row instead, where the join is an identity.
--
-- ⚖️ THE DOOR IS STATED, NEVER DERIVED, AND THAT IS WHY IT IS WORTH A COLUMN.
-- The handler can see `reference_url` and `selected_product_id` and could infer
-- something door-shaped from them. What it could not do is tell "she chose the
-- idea door" apart from "she pasted text that did not look like a URL" -- both
-- arrive with no link -- and that distinction is the entire reason `entryDoor.ts`
-- exists. An inferred column here would silently answer a different question
-- than the one it is named for.
--
-- ⚠️ NULL IS "SHE DID NOT SAY", AND IT WILL BE COMMON AT FIRST. Every client
-- older than this deploy sends no door at all, and every one of those rows must
-- read as absent rather than as the commonest door. Defaulting would put an
-- invented answer into the denominator of every question this column is for.
alter table public.generation_outcomes
  add column if not exists entry_door text;

-- ⚠️ THE FOUR DOORS `entryDoor.ts` DECLARES, AND A FIFTH MAY NOT ARRIVE FROM A
-- REQUEST BODY. The edge function validates against the same four before the
-- insert; this CHECK is the second of the two, and it is the one that holds when
-- the first is edited.
alter table public.generation_outcomes
  drop constraint if exists generation_outcomes_entry_door_known;
alter table public.generation_outcomes
  add constraint generation_outcomes_entry_door_known check (
    entry_door is null
    or entry_door in ('reference', 'idea', 'product', 'browse')
  );

comment on column public.generation_outcomes.entry_door is
  'Which of the four doors (entryDoor.ts) the creator came through for this '
  'build, as STATED by the client -- never inferred from the request shape, '
  'because an inference cannot tell a chosen idea door from text that did not '
  'look like a URL. NULL means she did not say, which every client older than '
  '0204 does, and must not be read as the commonest door.';
