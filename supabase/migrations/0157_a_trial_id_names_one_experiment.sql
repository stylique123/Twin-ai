-- A TRIAL ID NAMES ONE EXPERIMENT, AND THE ROW MUST SAY WHICH.
--
-- ⚠️ 0155 AND 0156 STORED THE ARMS BUT NOT WHAT WAS HELD IDENTICAL. A reader a
-- month from now can see model_a, model_b and two thinking budgets, and still
-- cannot answer "was this the same prompt?" — because the prompt, vocabulary and
-- schema live in code that has since moved on. Provenance that requires a git
-- archaeology dig is provenance nobody performs.
--
-- ⚖️ DIGESTS, NOT BLOBS. Storing the full system instruction and schema on every
-- row would duplicate kilobytes per trial to answer a question a 16-character
-- digest answers exactly: were these two runs asked the same thing. The blob
-- lives in the repo, where it is versioned; the digest is the join key.
--
-- ⚠️ AND THE MANIFEST IS IMMUTABLE ONCE AN ARM HAS RUN. A retry or a partially
-- resumed batch must not be able to change what is being compared underneath the
-- same trial — that turns one experiment into a mixture of two, and the row
-- would look perfectly well-formed. The worker refuses on a mismatch; this
-- column is what it compares against.
alter table public.extraction_parity_trials
  add column if not exists manifest jsonb;

comment on column public.extraction_parity_trials.manifest is
  'The pinned experiment: model_a, model_b, thinking_resolved, timeout_ms, '
  'system_sha, vocabulary_sha, schema_sha, arms_asymmetric. Written before either arm '
  'runs and refused if it disagrees with a stored trial for the same key.';
