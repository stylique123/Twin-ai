-- WHAT TWIN LEARNED, ROUND 3 (owner review of the first lessons, 2026-09-28).
--
-- 1. "heard 2×" on a lesson she said once: the page showed `weight`, which a
--    rating note starts at 2. `heard` is the real count of times it was learned.
-- 2. Notes about ONE video ("start from the customer…", "explain the 12oz bag")
--    had become rules for every video, and one script was already written with
--    them. The learner now keeps only standing lessons (scope), and existing
--    one-offs were switched off per account as data, not here.
-- 3. Near-copies are collapsed by the learner and by the writer's ordering.
alter table public.creator_lessons add column if not exists heard integer not null default 1;

update public.creator_lessons
   set heard = case when source in ('rating', 'hook_pick') then greatest(1, weight / 2) else greatest(1, weight) end;

create or replace function public.learn_lesson(
  p_owner uuid, p_kind text, p_text text, p_phrase text, p_source text, p_source_id text, p_weight integer
) returns void
language sql security definer set search_path = public as $$
  insert into public.creator_lessons (owner_id, kind, text, phrase, source, source_id, weight, heard)
  values (p_owner, p_kind, p_text, p_phrase, p_source, p_source_id, greatest(1, p_weight), 1)
  on conflict (owner_id, text) do update
    set weight = public.creator_lessons.weight + greatest(1, excluded.weight),
        heard = public.creator_lessons.heard + 1,
        phrase = coalesce(public.creator_lessons.phrase, excluded.phrase),
        updated_at = now();
$$;
revoke all on function public.learn_lesson(uuid, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.learn_lesson(uuid, text, text, text, text, text, integer) to service_role;
