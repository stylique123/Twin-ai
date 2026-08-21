-- A CONFIGURATION EXPERIMENT MUST NOT BE MISTAKEN FOR A MODEL EXPERIMENT.
--
-- ⚠️ 0155 STORED BOTH THINKING BUDGETS BUT NOT WHETHER THE ASYMMETRY WAS
-- INTENDED. A reader finding two different budgets on a row cannot tell whether
-- the trial was deliberately varying configuration or accidentally confounded
-- by it — and those two rows answer different questions while looking identical.
--
-- ⚖️ THE FIRST PARITY TRIAL ISOLATES THE MODEL ID. The harness now REFUSES to
-- run unless the arms differ only by model; `allowAsymmetry` is the explicit
-- opt-in for the follow-up experiment ("does a different Flash thinking
-- configuration recover the gap?"), and this column is where that intent is
-- written down rather than inferred from a commit date.
--
-- Default false, because every trial written before this column existed was
-- required to be symmetric by the code that wrote it.
alter table public.extraction_parity_trials
  add column if not exists asymmetric boolean not null default false;

-- ⚠️ THE UNIQUE INDEX MUST INCLUDE IT, OR THE FOLLOW-UP OVERWRITES THE BASELINE.
-- 0155 keyed one trial per (url, model_a, model_b). A deliberate asymmetric
-- re-run of the same pair would upsert straight over the symmetric result it is
-- supposed to be compared against, and the baseline would vanish silently.
drop index if exists extraction_parity_trials_one_per_url_pair;
create unique index if not exists extraction_parity_trials_one_per_url_pair
  on public.extraction_parity_trials (url, model_a, model_b, asymmetric);
