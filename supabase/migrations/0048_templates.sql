-- Reusable reference templates. A creator/agency saves a proven reference + its
-- remix settings (fidelity / tone / delivery / note) so they can re-remix that
-- structure for a new topic without re-finding the link. Owner-scoped via RLS.
create table if not exists public.templates (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  reference_url text not null,
  note          text,
  fidelity      text,
  tone          text,
  delivery      text,
  created_at    timestamptz not null default now()
);

alter table public.templates enable row level security;

drop policy if exists "templates_select_own" on public.templates;
create policy "templates_select_own" on public.templates for select using (auth.uid() = owner_id);
drop policy if exists "templates_insert_own" on public.templates;
create policy "templates_insert_own" on public.templates for insert with check (auth.uid() = owner_id);
drop policy if exists "templates_delete_own" on public.templates;
create policy "templates_delete_own" on public.templates for delete using (auth.uid() = owner_id);

create index if not exists templates_owner on public.templates (owner_id, created_at desc);
grant select, insert, delete on public.templates to authenticated;
