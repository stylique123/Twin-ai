-- Owner brief 2026-10-01 ("by niche"): the free hook_type label was "bold claim"
-- on 42-73% of every creator family, so the corpus could not say which hook
-- shapes a coach uses versus a product seller. Two finer labels, written by the
-- corpus reader from now on (no mass re-read).
alter table public.corpus_reads
  add column if not exists hook_move text,
  add column if not exists hook_gap text check (hook_gap is null or hook_gap in ('open', 'closed', 'none'));
