-- STAGING LOST FOUR CASCADES AND NOBODY NOTICED FOR FORTY-EIGHT DAYS.
--
-- ⚠️ THE MEASURED FACT. A rolled-back probe deleting the oldest fixture user on
-- staging (2026-09-10) is REFUSED, and not by an append-only trigger:
--
--   23503 / update or delete on table "media_assets" violates foreign key
--   constraint "generations_source_asset_id_fkey" on table "generations"
--
-- ⚠️ THE MECHANISM, AND IT IS NOT THE CONSTRAINT NAMED IN THE ERROR.
-- `media_assets.owner_id` cascades from `auth.users`, so the delete tries to
-- remove the creator's assets. `generations.source_asset_id` is NO ACTION — on
-- purpose; its sibling `approved_output_asset_id` is SET NULL, and both are the
-- same on production — so the surviving generation row blocks the asset delete.
-- On production the generation would not survive: `generations_user_id_fkey`
-- cascades the row away first. ON STAGING THAT CONSTRAINT DOES NOT EXIST.
--
-- ⚠️⚠️ FOUR CONSTRAINTS, FIVE COLUMNS, ALL DECLARED IN THIS REPO AND ABSENT ON
-- STAGING. Verified by a COMPLETE scan of staging's public schema for uuid owner
-- columns with no foreign key, not by a hand-written table list — a partial
-- search reports absence it has not established:
--
--   generations.user_id             0001_init.sql:56
--   brand_voices.owner_id           0002_brand_voices.sql:23
--   jobs.owner_id                   0002_brand_voices.sql:82
--   workspace_members.owner_id      0049_team_seats.sql:12
--   workspace_members.member_id     0049_team_seats.sql:13
--
-- Every one of those lines says `references auth.users (id) on delete cascade`.
-- Production carries all four. Staging carries neither. The repo is not wrong
-- and production is not wrong: STAGING DRIFTED, and the thing it drifted on is
-- the constraint the matrix's own cleanup depends on.
--
-- ⚖️ THE COST WAS NOT DISK. It was that the matrix has been asserting production
-- behaviour against a schema production does not have. 12,589 fixture users
-- accumulated over 48 days because none could ever be deleted; that is the
-- symptom that made the drift visible, not the reason to care about it.
--
-- ⚖️ AND THE FIXTURE COUNT WAS NEVER THE PROBLEM. A run creates 25 users, not
-- 12,530 — measured exactly, not counted in the source: since #803 stamped the
-- run id into fixture addresses, staging holds 100 tagged users across 4
-- distinct run tags. 25 is one identity per authorization boundary under test
-- (owner, peer, outsider, rate-limited, ...) and reusing them would delete the
-- isolation the run tag exists to provide. THE GROWTH WAS NEVER OVER-CREATION.
-- IT WAS THAT DELETION HAD BEEN SILENTLY IMPOSSIBLE SINCE THE FIRST RUN.
--
-- 🔎 HOW A DECLARED CONSTRAINT GOES MISSING — INFERRED, NOT MEASURED. All three
-- migrations use `create table if not exists`. Where the table already existed,
-- the entire create is a no-op INCLUDING ITS FOREIGN KEYS, and the migration
-- still records as applied. That fits every observation (only tables from early
-- migrations are affected; later tables all carry their keys) but I have no
-- staging history that proves it, so it is written here as a hypothesis and not
-- as a finding.
--
-- ⚖️ WHY THIS IS SAFE TO RUN ON PRODUCTION: each statement asks `pg_constraint`
-- whether the key is already there and does nothing if it is, so on production
-- all five are no-ops. ⚠️ AN EARLIER DRAFT OF THIS FILE USED `drop constraint if
-- exists` FOLLOWED BY `add`, WHICH IS NOT A NO-OP AT ALL: on production it would
-- have dropped a live key and revalidated 49,475 rows under an ACCESS EXCLUSIVE
-- lock, while the comment above it claimed otherwise. There are also ZERO
-- orphan rows to clean first — measured across all 58,830 affected staging rows
-- (generations 49,475 · jobs 7,720 · workspace_members 1,635 · brand_voices 0).
-- That tidiness is owed an explanation and has one: no user delete has ever
-- succeeded, so no orphan could ever have been created. The constraints will
-- validate as written.
--
-- ⚠️⚠️ AND THE ABSENT KEY WAS LOAD-BEARING FOR A CI PROBE, WHICH IS THE
-- CLEAREST EVIDENCE THAT THE DRIFT MATTERED. The first matrix run carrying this
-- migration went red in four minutes:
--
--   ERROR: insert or update on table "brand_voices" violates foreign key
--   constraint "brand_voices_owner_id_fkey"
--   DETAIL: Key (owner_id)=(3a8d12d5-...) is not present in table "users".
--
-- `staging-integration.yml`'s 0171 probe inserted a `brand_voices` row with
-- `owner_id = gen_random_uuid()`. That had worked for as long as the probe has
-- existed, FOR NO OTHER REASON THAN THAT STAGING HAD NO SUCH KEY. The probe now
-- takes a real owner from `auth.users`. The key is not weakened: trading a
-- production constraint for a green tick is the trade this whole migration
-- exists to undo.
--
-- ⚖️ IT ALSO MADE THE PROBE'S NEGATIVE CASE EXACT. With a random owner that
-- insert violated the CHECK *and* the key at once, and passed only because
-- Postgres evaluates a CHECK on the tuple before firing an FK trigger — so the
-- thing under test was being proven by an accident of evaluation order.
--
-- ⚠️ ONE CONSTRAINT PER STATEMENT, DELIBERATELY. A single `alter table` naming
-- several is one atom to a reader and to the migration-coverage guard, whose
-- regex reads the first item only.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'generations_user_id_fkey' and conrelid = 'public.generations'::regclass and contype = 'f'
  ) then
    alter table public.generations
      add constraint generations_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'brand_voices_owner_id_fkey' and conrelid = 'public.brand_voices'::regclass and contype = 'f'
  ) then
    alter table public.brand_voices
      add constraint brand_voices_owner_id_fkey
      foreign key (owner_id) references auth.users (id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'jobs_owner_id_fkey' and conrelid = 'public.jobs'::regclass and contype = 'f'
  ) then
    alter table public.jobs
      add constraint jobs_owner_id_fkey
      foreign key (owner_id) references auth.users (id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspace_members_owner_id_fkey' and conrelid = 'public.workspace_members'::regclass and contype = 'f'
  ) then
    alter table public.workspace_members
      add constraint workspace_members_owner_id_fkey
      foreign key (owner_id) references auth.users (id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspace_members_member_id_fkey' and conrelid = 'public.workspace_members'::regclass and contype = 'f'
  ) then
    alter table public.workspace_members
      add constraint workspace_members_member_id_fkey
      foreign key (member_id) references auth.users (id) on delete cascade;
  end if;
end $$;
