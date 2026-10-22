-- 0293 — WHAT THE OWNER THOUGHT OF EACH CANARY SCRIPT (Fast Path v1, Track B (3)).
--
-- One row per canary script: a 1-10 rating, the script as he actually used it
-- (what he edited is the difference from the shipped blueprint script), and a
-- free note. "Posted yes or no and the link" is NOT here: it already lives in
-- public.posts (generation_id, external_url, via markPosted), so a second copy
-- would be a second source of truth.
--
-- ⚖️ CANARY ONLY, BY CONSTRUCTION. The insert policy accepts a row only for her
-- own generation whose saved blueprint carries the server-set tag
-- `canary: true` (generate-blueprint; the request body cannot set it).
-- ⚖️ READERS: apps/web/src/components/CanaryFeedback.tsx (her own row) and
-- scripts/ops/canaryDailyReport.mjs (counts and averages only).
-- FILE ONLY: not applied. Apply before CANARY_ACCOUNT_IDS is set.
create table if not exists public.canary_feedback (
  generation_id  uuid primary key references public.generations(id) on delete cascade,
  owner_id       uuid not null references auth.users(id) on delete cascade,
  rating         smallint not null check (rating between 1 and 10),
  edited_script  text check (edited_script is null or length(edited_script) <= 8000),
  note           text check (note is null or length(note) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.canary_feedback enable row level security;
drop policy if exists canary_feedback_own_read on public.canary_feedback;
create policy canary_feedback_own_read on public.canary_feedback for select to authenticated
  using (owner_id = auth.uid());
drop policy if exists canary_feedback_own_insert on public.canary_feedback;
create policy canary_feedback_own_insert on public.canary_feedback for insert to authenticated
  with check (owner_id = auth.uid() and exists (
    select 1 from public.generations g
    where g.id = generation_id and g.user_id = auth.uid() and (g.blueprint ->> 'canary') = 'true'));
drop policy if exists canary_feedback_own_update on public.canary_feedback;
create policy canary_feedback_own_update on public.canary_feedback for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
