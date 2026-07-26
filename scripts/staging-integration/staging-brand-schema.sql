-- STAGING ONLY — NOT A MIGRATION. Never applied to production.
--
-- This file deliberately lives OUTSIDE supabase/migrations/ so it can never be
-- picked up by a migration runner. Production already has `brand_voices` (created
-- by 0002_brand_voices.sql and extended by 0043_brand_kit.sql); it needs nothing
-- from here.
--
-- WHY THIS EXISTS
-- The staging project (otgzjsagybpgtwweuptj) is a purpose-built EDITOR-ONLY test
-- bed: 17 tables covering the editor, the job queue and ops, with no `profiles`
-- and no brand tables. That was correct while the editor read neither.
--
-- The Phase 7 exit correction changed that. The Boot Manifest now pins the BRAND
-- SNAPSHOT CONTENT (external audit finding 3 — "brand not truly frozen"), so
-- `pinBrandSnapshot` → `resolveBrandSnapshot` reads `brand_voices` on every
-- editor_v2 job. On staging that table did not exist, so every Phase 3-7 run
-- failed at the pin step. The staging matrix caught it the first time it ever
-- reached Phase 3 with the brand pin in place.
--
-- WHAT IS MIRRORED, AND WHY ONLY THIS
-- Exactly the columns `resolveBrandSnapshot` reads, with the types the production
-- migrations declare, so the snapshot projected on staging has the same shape as
-- the one production will project:
--   owner_id, is_default   -- the default-voice lookup (0002)
--   profile   jsonb        -- the synthesized voice (0002)
--   brand_kit jsonb        -- colors/logo/caption preset (0043)
-- The app-side machinery around brand voices (discovery triggers, DNA cache,
-- reaper, share tokens, stats, RLS for the web client) is deliberately NOT
-- mirrored: the editor never reads it, and copying it here would create a second
-- source of truth that could drift from the real migrations without anything
-- noticing. This file is a fixture, not a schema authority.
--
-- Idempotent: safe to re-run on every staging dispatch.

create table if not exists public.brand_voices (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,
  handle      text not null default 'staging-fixture',
  platform    text not null default 'tiktok',
  label       text,
  profile     jsonb,
  status      text not null default 'building',
  is_default  boolean not null default false,
  error       text,
  brand_kit   jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists brand_voices_owner_idx
  on public.brand_voices (owner_id, created_at desc);

-- The editor reads through the service role only; no client ever touches this on
-- staging. RLS on with no policy = deny-all for anon/authenticated, which matches
-- the posture the editor relies on and keeps the fixture from being a hole.
alter table public.brand_voices enable row level security;
revoke all on public.brand_voices from public, anon, authenticated;
grant select, insert, update, delete on public.brand_voices to service_role;
