-- ⚠️ OWNER 2026-10-01: "If a creator corrects the same mistake twice, that's a
-- signal the lesson isn't being applied." Until now a second correction only
-- raised the lesson's `heard` count — silently. A MISS is recorded when a new
-- rating carries a lesson she ALREADY had, active, before the rated script was
-- written: the writer had the rule and broke it anyway.
--
-- Surfaced where it is looked at: on that lesson in "What Twin learned from
-- you" (red, with the script), and logged as an incident (`lesson_not_applied`).
create table if not exists public.lesson_misses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.creator_lessons(id) on delete cascade,
  generation_id uuid not null,
  source text not null,
  created_at timestamptz not null default now(),
  unique (lesson_id, generation_id)
);
create index if not exists lesson_misses_owner on public.lesson_misses (owner_id, created_at desc);
alter table public.lesson_misses enable row level security;
drop policy if exists lesson_misses_owner_read on public.lesson_misses;
create policy lesson_misses_owner_read on public.lesson_misses for select to authenticated using (owner_id = auth.uid());

-- One call per filed lesson: is this a correction of a rule the script already had?
create or replace function public.record_lesson_miss(p_owner uuid, p_text text, p_generation uuid, p_source text)
returns boolean language sql security definer set search_path = public as $$
  with hit as (
    select l.id from public.creator_lessons l
      join public.generations g on g.id = p_generation and g.user_id = p_owner
     where l.owner_id = p_owner and l.text = p_text and l.active and l.kind <> 'hook'
       and l.created_at < g.created_at
  ), ins as (
    insert into public.lesson_misses (owner_id, lesson_id, generation_id, source)
    select p_owner, hit.id, p_generation, p_source from hit
    on conflict (lesson_id, generation_id) do nothing
    returning 1)
  select exists(select 1 from ins);
$$;
revoke all on function public.record_lesson_miss(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.record_lesson_miss(uuid, text, uuid, text) to service_role;
