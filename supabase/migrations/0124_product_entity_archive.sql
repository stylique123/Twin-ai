-- ARCHIVE, BECAUSE THE SPEC SUPPLIED THE READER THAT WAS MISSING.
--
-- ⚠️ 0120 SHIPPED WITH DELETE AS THE ONLY WAY OUT, and #354 argued for keeping
-- it that way: a `retired` flag would be read by nothing, and a retired row
-- `generate-blueprint` did not filter would keep granting the permission the
-- creator had just withdrawn. That argument was right about the danger and
-- wrong about the conclusion. The danger is real; the answer is to WRITE THE
-- READER, not to make withdrawal destructive.
--
-- ⚖️ WHAT ARCHIVE MEANS, PRECISELY. An archived entity:
--
--     * is NOT offered for new videos          (excluded from every read that
--                                               feeds generation)
--     * KEEPS its provenance                   (scripts already written about
--                                               it still resolve their entity)
--     * does NOT free its slot for the owned   (the partial unique index is a
--       uniqueness guard                        REPLAY guard — see below)
--
-- ⚠️ THE INDEX IS DELIBERATELY NOT MADE PARTIAL ON `archived_at`. It would be
-- natural to write `where ... and archived_at is null` so a creator could
-- archive one owned product and mint another. That would reopen the exact
-- defect 0120 closed: `Onboarding` re-runs its confirm step on remount, and a
-- creator who archives mid-flow would then accumulate duplicates on every pass.
-- Swapping the owned product is a deliberate act that belongs in an explicit
-- replace flow, not a side effect of archiving. Correctness guard stays a
-- correctness guard.
--
-- ⚖️ NULLABLE `timestamptz`, NOT A BOOLEAN. "When was this withdrawn" is a fact
-- worth keeping — it dates the end of a sponsorship, and a boolean cannot. Null
-- means live, which is the same three-state discipline `basis` and `source`
-- already use: unrecorded is not false.

alter table public.product_entities
  add column if not exists archived_at timestamptz;

-- Live entities, read constantly by the library and by generation. Archived
-- rows are the minority and are read only when the creator asks to see them,
-- so the index covers the common path rather than the whole table.
create index if not exists product_entities_live_idx
  on public.product_entities (owner_id, created_at desc)
  where archived_at is null;

comment on column public.product_entities.archived_at is
  'When the creator withdrew this entity. Null = live. Archived entities are '
  'excluded from every read that feeds generation, but are retained so scripts '
  'already written about them keep their provenance. Does NOT free the '
  'one-owned-per-voice slot: that index is a replay guard, not a quota.';
