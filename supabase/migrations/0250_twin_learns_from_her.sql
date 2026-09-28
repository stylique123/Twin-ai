-- WHAT TWIN HAS LEARNED FROM HER (owner, 2026-09-28).
--
-- Ratings were saved (0233) and nothing on the writing side read her words.
-- A lesson is one short rule with its source, written by the worker's learner
-- from her rating notes and tags, her test viewers and her own hook picks, and
-- read by generate-blueprint on every script. She can see and switch off each
-- one on "What Twin knows".
--
-- ⚖️ ADDITIVE: one table, and a lessons_at marker on script_ratings, audience_tests
-- and generations (her hook pick), so each source is learned exactly once.
create table if not exists public.creator_lessons (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('avoid', 'prefer', 'style', 'hook')),
  text        text not null check (length(text) between 3 and 300),
  phrase      text check (phrase is null or length(phrase) <= 100),
  source      text not null check (source in ('rating', 'rating_tag', 'audience', 'hook_pick')),
  source_id   text,
  weight      integer not null default 1,
  times_used  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, text)
);
create index if not exists creator_lessons_owner_active on public.creator_lessons (owner_id) where active;

alter table public.creator_lessons enable row level security;
drop policy if exists creator_lessons_own_read on public.creator_lessons;
create policy creator_lessons_own_read on public.creator_lessons for select to authenticated using (owner_id = auth.uid());
-- She may switch a lesson off (or back on); only the learner writes them.
drop policy if exists creator_lessons_own_toggle on public.creator_lessons;
create policy creator_lessons_own_toggle on public.creator_lessons for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists creator_lessons_own_delete on public.creator_lessons;
create policy creator_lessons_own_delete on public.creator_lessons for delete to authenticated using (owner_id = auth.uid());

alter table public.script_ratings add column if not exists lessons_at timestamptz;
alter table public.audience_tests add column if not exists lessons_at timestamptz;
alter table public.generations add column if not exists hook_lesson_at timestamptz;

-- A rating she edits is learned again: changing it clears the marker.
create or replace function public.script_ratings_relearn()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.stars is distinct from old.stars or new.tags is distinct from old.tags
     or new.change_note is distinct from old.change_note then
    new.lessons_at := null;
  end if;
  return new;
end $$;
drop trigger if exists script_ratings_relearn on public.script_ratings;
create trigger script_ratings_relearn before update on public.script_ratings
  for each row execute function public.script_ratings_relearn();

-- Repetition is the signal: the same lesson again adds weight instead of a row.
create or replace function public.learn_lesson(
  p_owner uuid, p_kind text, p_text text, p_phrase text, p_source text, p_source_id text, p_weight integer
) returns void
language sql security definer set search_path = public as $$
  insert into public.creator_lessons (owner_id, kind, text, phrase, source, source_id, weight)
  values (p_owner, p_kind, p_text, p_phrase, p_source, p_source_id, greatest(1, p_weight))
  on conflict (owner_id, text) do update
    set weight = public.creator_lessons.weight + greatest(1, excluded.weight),
        phrase = coalesce(public.creator_lessons.phrase, excluded.phrase),
        updated_at = now();
$$;
revoke all on function public.learn_lesson(uuid, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.learn_lesson(uuid, text, text, text, text, text, integer) to service_role;

-- Counted when a script is written with them, so she can see what is in use.
create or replace function public.lessons_used(p_ids uuid[])
returns void
language sql security definer set search_path = public as $$
  update public.creator_lessons set times_used = times_used + 1 where id = any(p_ids);
$$;
revoke all on function public.lessons_used(uuid[]) from public, anon, authenticated;
grant execute on function public.lessons_used(uuid[]) to service_role;
