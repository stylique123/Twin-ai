-- TwinAI initial schema
-- Profiles (creator DNA + credits), generations, credit ledger, RLS, and an
-- atomic credit-spend RPC used by the edge function.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  display_name text,
  plan        text not null default 'free',
  credits     integer not null default 30, -- internal credits; Free = 3 recreations (advertised and granted match)
  dna         jsonb,
  onboarded   boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Column-level lockdown: users may only change non-sensitive fields.
-- credits / plan / email / id are writable ONLY by the service role + triggers.
revoke update on public.profiles from authenticated, anon;
grant update (dna, display_name, onboarded) on public.profiles to authenticated;

-- Create a profile row automatically when a user signs up (starter credits via table default).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- generations
-- ---------------------------------------------------------------------------
create table if not exists public.generations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  reference_url  text,
  reference_note text,
  fidelity       text not null default 'balanced',
  blueprint      jsonb not null,
  credits_spent  integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists generations_user_idx on public.generations (user_id, created_at desc);

alter table public.generations enable row level security;

create policy "own generations read"   on public.generations for select using (auth.uid() = user_id);
create policy "own generations insert" on public.generations for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- credit ledger (audit trail for every spend / top-up)
-- ---------------------------------------------------------------------------
create table if not exists public.credit_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  delta      integer not null,
  reason     text not null,
  created_at timestamptz not null default now()
);

alter table public.credit_events enable row level security;
create policy "own credit events read" on public.credit_events for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- spend_credits: atomically decrement credits, fail if insufficient.
-- Called by the edge function (service role) before generating.
-- ---------------------------------------------------------------------------
create or replace function public.spend_credits(p_user uuid, p_amount integer, p_reason text)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  remaining integer;
begin
  -- Only positive spends allowed. Refunds go through refund_credits().
  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  update public.profiles
    set credits = credits - p_amount
    where id = p_user and credits >= p_amount
    returning credits into remaining;

  if remaining is null then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  insert into public.credit_events (user_id, delta, reason)
  values (p_user, -p_amount, p_reason);

  return remaining;
end;
$$;

-- ---------------------------------------------------------------------------
-- refund_credits: add credits back (service-role only). Positive amount.
-- ---------------------------------------------------------------------------
create or replace function public.refund_credits(p_user uuid, p_amount integer, p_reason text)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  remaining integer;
begin
  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  update public.profiles
    set credits = credits + p_amount
    where id = p_user
    returning credits into remaining;

  insert into public.credit_events (user_id, delta, reason)
  values (p_user, p_amount, p_reason);

  return remaining;
end;
$$;

-- Credit-mutating RPCs are NEVER callable from the browser — service role only.
revoke all on function public.spend_credits(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.refund_credits(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.spend_credits(uuid, integer, text) to service_role;
grant execute on function public.refund_credits(uuid, integer, text) to service_role;
