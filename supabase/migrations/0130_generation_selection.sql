-- WHAT REACHED THE WRITER, KEPT FOR LONGER THAN A LOG RETENTION WINDOW.
--
-- ⚠️ SIX COUNTERS WERE BUILT AND ALL SIX ARE `console.log`. `substance_route_shadow`
-- carries the selection shape (how many substance items, how many spoken, how
-- many figures, whether the floor was starved) and the container supply check.
-- It is emitted per generation to the edge logs — which expire within days. So
-- the readings do not accumulate: a month of production traffic leaves nothing
-- to count at the end of it.
--
-- ⚖️ THAT IS THE SAME DEFECT AS C8's SCRIPT HOLE, POINTED AT QUALITY INSTEAD OF
-- FAILURE. In both cases the information exists at the moment it matters and is
-- written somewhere that forgets. The fix is the same and it is not a new table:
-- the `generations` row is already inserted on this exact path, it already
-- survives, and the counters describe THAT row.
--
-- ⚖️ NULL IS "NOT RECORDED", AND IT IS THE HONEST STATE FOR EVERY ROW WRITTEN
-- BEFORE THIS. Defaulting to `{}` would make historical generations look like
-- they supplied nothing to the writer, which is a measurement, not an absence.
alter table public.generations
  add column if not exists selection jsonb;

comment on column public.generations.selection is
  'What the knowledge selector actually handed the writer for this generation: '
  'substance/spoken/figure counts, the available denominators, whether the '
  'substance floor was starved, and the container supply check. NULL means not '
  'recorded (every row written before 0130), never "supplied nothing".';

-- ⚠️ THE QUESTION THIS EXISTS TO ANSWER IS "HOW OFTEN WAS THE FLOOR STARVED",
-- which is a scan over a jsonb field across every generation. Without an index
-- that is a sequential scan of the whole table for a routine check, so the
-- check stops being run.
create index if not exists generations_selection_starved
  on public.generations (((selection ->> 'starved')::boolean), created_at desc)
  where selection is not null;
