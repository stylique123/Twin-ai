-- 0208 — `ops_events.severity` HAS NO CONSTRAINT AND CARRIES FOUR SPELLINGS,
-- TWO OF WHICH ARE THE SAME WORD.
--
-- ⚠️ MEASURED IN PRODUCTION 2026-09-13:
--     warn      303   2026-07-15 .. 2026-09-12
--     warning    17   2026-09-10 .. 2026-09-12
--     critical   11   2026-08-16 .. 2026-09-13
--     error       1   2026-09-02
--   NULLs: none. And the CODE writes a fifth, `info`, which has not landed yet.
--
-- ⚠️⚠️ AND I ADDED TWO OF THE FOUR THIS WEEK. The `warning` rows begin
-- 2026-09-10; `generation_record_not_written` (#849) and the residential-proxy
-- escalation pair (#850) each picked a spelling by copying whichever neighbour
-- they happened to read. That is exactly what an unconstrained enum column
-- does: every new writer is locally reasonable and the column drifts anyway.
--
-- ⚖️ `warn` IS CANONICAL BECAUSE OF THE COUNT, NOT THE TASTE. It holds 303 rows
-- to `warning`'s 17, so this backfill rewrites 17 rows rather than 303 -- and
-- when a migration must rewrite one side, the smaller side is the one less
-- likely to lose something. It also matches `console.warn`, which every one of
-- these call sites logs beside.
--
-- ⚖️ FOUR LEVELS, AND `info` IS ONE OF THEM RATHER THAN A REJECT. The code
-- already writes it (`script_regenerated`, and the SUCCESSFUL half of the
-- escalation pair), and a success is genuinely not a warning. Constraining it
-- away would force the next writer to mislabel a success as a problem.
--
-- ⚠️ NULL STAYS LEGAL, DELIBERATELY. One writer (`heartbeat_digest`, in
-- scripts/ops) inserts no severity at all. NOT NULL would turn that into a
-- rejected insert -- and a telemetry write that fails is precisely the defect
-- #849 was built to stop. NULL means "the writer did not say", which is a
-- different fact from any level and must not be defaulted into one.
update public.ops_events set severity = 'warn' where severity = 'warning';

alter table public.ops_events
  drop constraint if exists ops_events_severity_known;
alter table public.ops_events
  add constraint ops_events_severity_known check (
    severity is null
    or severity in ('info', 'warn', 'error', 'critical')
  );

comment on column public.ops_events.severity is
  'How loud this event is: info, warn, error, critical. NULL means the writer '
  'did not say, which is not a level and must not be read as one. Before 0208 '
  'this column was unconstrained and carried both ''warn'' (303 rows) and '
  '''warning'' (17) for the same idea; the 17 were rewritten to ''warn''.';
