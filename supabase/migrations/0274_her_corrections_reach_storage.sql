-- HER CORRECTIONS REACH STORAGE (script batch audit 2026-10-03, parts 3 and 11).
--
-- Her rating notes ("the two-pound batches and cup-score claims I've excluded",
-- "I didn't describe it that way") became avoid lessons while the facts that
-- said those things stayed live. The worker's correction pass now reads each
-- note for what she rejects, files it as an avoid lesson with her words as the
-- phrase, and stamps `creator_excluded_at` on every stored fact that says it.
--
-- ⚖️ ADDITIVE. One marker column. Every existing rating starts with it null,
-- so the pass re-reads all of her past notes once: that IS the backfill, run by
-- the worker in small batches, never by hand against the live database.
alter table public.script_ratings add column if not exists corrections_at timestamptz;

-- A rating she edits is read again for corrections too.
create or replace function public.script_ratings_relearn()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.stars is distinct from old.stars or new.tags is distinct from old.tags
     or new.change_note is distinct from old.change_note then
    new.lessons_at := null;
    new.corrections_at := null;
  end if;
  return new;
end $$;
