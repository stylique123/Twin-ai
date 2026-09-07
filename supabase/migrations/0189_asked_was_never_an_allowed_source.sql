-- AN ANSWER A CREATOR TYPES MUST BE ALLOWED TO LAND.
--
-- ⚠️ MEASURED IN PRODUCTION 2026-09-07. `creator_knowledge` holds 1,088 rows
-- across 26 creators and EVERY ONE came from scraping:
--
--     source = 'caption' ......... 610
--     source = 'transcript' ...... 478
--     source = 'asked' ...........   0
--
-- Nothing any creator has ever typed is in the store. Meanwhile
-- `creator_questions_put` records TWELVE questions marked `answered`, by FOUR
-- creators, between 2026-09-03 and 2026-09-05.
--
-- ⚠️ THE CAUSE IS THIS CONSTRAINT, PROVEN BY EXECUTION AND NOT BY READING. An
-- insert of source='asked' against production returns SQLSTATE 23514,
-- constraint `creator_knowledge_source_check`, whose allowed list is
-- ('caption','transcript','user','previous_video'). 'asked' is the one source
-- the application writes for a human answer, and the database never permitted
-- it.
--
-- ⚠️ AND 0187 IS NAMED "a creator could never store their own answer". It
-- granted INSERT and added the RLS policy -- the PERMISSION half -- and stopped
-- there. Nobody afterwards ran an insert to see whether one now succeeded, so a
-- migration that fixed half a bug read as a migration that fixed it. Absence of
-- an error is not evidence a check ran.
--
-- ⚖️ 'user' IS LEFT IN AND NOT REUSED. It is a different provenance --
-- `answer-beat-ask` and the interview both write 'asked' specifically, and
-- SPOKEN_SOURCES in generate-blueprint already treats 'asked' as speech the
-- creator uttered. Collapsing them would lose the distinction the writer reads.
--
-- ⚖️ IDEMPOTENT, AND SAFE TO APPLY TWICE: the constraint is dropped by name
-- first, so a re-run rebuilds the same definition rather than failing.

alter table public.creator_knowledge
  drop constraint if exists creator_knowledge_source_check;

alter table public.creator_knowledge
  add constraint creator_knowledge_source_check
  check (
    source is null
    or source = any (array['caption'::text, 'transcript'::text, 'user'::text,
                           'previous_video'::text, 'asked'::text])
  );
