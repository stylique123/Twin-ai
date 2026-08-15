-- WHAT THE WRITER DID WITH WHAT IT WAS GIVEN, KEPT.
--
-- ⚠️ G8's COUNTER RUNS ON EVERY GENERATION AND ITS READINGS EXPIRE.
-- `entailment_gaps` — a figure asserted in a beat whose own citation does not
-- carry it — is computed in `generate-blueprint` and emitted inside the
-- `beat_substance` console.log, along with the unsupported-substance issues, the
-- progress-check count and the proof-quality breakdown. Edge logs expire within
-- days, so the question G8 is actually open on ("a number NOT from the
-- reference, citing a real but unrelated item — which nothing has measured yet")
-- cannot accumulate an answer no matter how much traffic runs.
--
-- ⚖️ THIS IS 0130 AGAIN, ONE LAYER DOWN. 0130 kept what the selector SUPPLIED;
-- this keeps what the writer DID with it. Together they make a generation
-- answerable end to end — thin store, starved selector, or a writer inventing on
-- top of good supply are three different diagnoses that look identical in a
-- finished script, and only the pair can tell them apart.
--
-- ⚖️ A SECOND COLUMN RATHER THAN AN EXTENSION OF `selection`. That column is
-- documented as what the selector handed over; folding beat outcomes into it
-- would make its own comment false, and a column whose name disagrees with its
-- contents is how `source_ref` got read as provenance it never carried.
alter table public.generations
  add column if not exists beat_audit jsonb;

comment on column public.generations.beat_audit is
  'What the writer did with the supplied knowledge for this generation: beats by '
  'declared source, unsupported-substance issue codes, progress checks, '
  'proof quality, and entailment_gaps (G8 — a figure whose own citation does not '
  'carry it). NULL means not recorded (every row written before 0131), never '
  '"clean".';

-- ⚠️ THE QUESTION IS "HOW OFTEN DOES A BEAT ASSERT A FIGURE ITS CITATION DOES
-- NOT CARRY", which is a scan across every generation. Unindexed that is a
-- sequential scan for a routine check, and a check that is slow is a check
-- nobody runs.
create index if not exists generations_beat_audit_entailment
  on public.generations ((( beat_audit ->> 'entailment_gaps')::int), created_at desc)
  where beat_audit is not null;
