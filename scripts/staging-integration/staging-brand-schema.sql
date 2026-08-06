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

-- ---------------------------------------------------------------------------
-- THE REVIEW COLUMNS ON `generations`, without which 0111 fails at RUN TIME.
-- ---------------------------------------------------------------------------
-- Staging's `generations` is a stub: 11 columns, enough for the editor to hang a
-- project off. Production's has the agency-review fields, and 0111's
-- `set_generation_approval` writes `review_status` in the same statement that
-- records the approval binding.
--
-- THE FAILURE MODE IS THE ONE THIS WORKFLOW KEEPS GETTING BITTEN BY. plpgsql
-- does not resolve column references when a function is CREATED, so 0111
-- applies cleanly, the function is created cleanly, and the first CALL dies
-- with:
--
--   ERROR: 42703: column g.review_status does not exist
--   CONTEXT: PL/pgSQL function set_generation_approval(uuid,boolean,text) line 16
--
-- A 42703 from four frames inside a security-definer function, on a staging run,
-- with nothing in the diff that mentions `review_status`. Exactly the shape of
-- the 0100 and 0104 incidents recorded in staging-integration.yml — a symptom
-- that looks nothing like a missing column.
--
-- Verified by applying 0111 to staging and calling the function: it failed
-- precisely as above. These three columns are what production already has
-- (0035/0056), added here so the fixture can host the real migration rather
-- than a version of it edited to fit.
alter table public.generations add column if not exists review_status text;
alter table public.generations add column if not exists review_note   text;
alter table public.generations add column if not exists reviewed_at   timestamptz;
