-- Editor v2 — Phase 4 gate hardening: bound the analysis component namespace.
--
-- `media_analyses.component` was free text (0082). The component set is a
-- CONTRACT — the five planned analysis components and nothing else — so a
-- worker bug or future typo cannot mint an unbounded namespace of immutable
-- rows. Extending the set is a deliberate migration, exactly like a status
-- enum.
alter table public.media_analyses
  add constraint media_analyses_component_bounded
  check (component in ('inspection', 'speech', 'visual', 'audio', 'hook'));
