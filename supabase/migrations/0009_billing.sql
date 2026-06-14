-- Provider-agnostic billing. TwinAI never hardcodes one processor: a single
-- subscriptions shape is written by whichever provider is active (stripe,
-- paddle, lemonsqueezy, payoneer, fasset, crypto, manual). Swapping or adding a
-- processor is an adapter + a webhook route, never a schema change.

-- One row per user describing their current paid state. The app reads plan +
-- status to gate features and top up credits; it never reads card data (the
-- processor holds that, we only keep references).
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Which processor owns this subscription. Free-form text on purpose so a new
  -- provider needs no migration; the app validates against its known set.
  provider text not null default 'manual',
  -- The processor's own id for the subscription/customer/charge (for reconcile).
  external_id text,
  customer_ref text,
  -- Internal plan name. Mirrors profiles.plan so gating has one source of truth.
  plan text not null default 'free',
  -- active | trialing | past_due | canceled | inactive
  status text not null default 'inactive',
  amount_cents integer,
  currency text not null default 'usd',
  -- For crypto/Fasset: the asset + wallet/tx so a payment can be verified later.
  pay_asset text,
  pay_address text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists subscriptions_provider_idx on public.subscriptions (provider, external_id);

-- Raw webhook log. Every processor event lands here first (idempotently) before
-- we mutate a subscription, so a replayed/duplicate webhook can never double-bill
-- or double-credit, and we keep an audit trail for disputes.
create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text,
  -- The processor's event id. Unique per provider so retries are no-ops.
  external_event_id text,
  user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  unique (provider, external_event_id)
);

create index if not exists billing_events_unprocessed_idx
  on public.billing_events (created_at) where processed = false;

-- RLS: a user may READ their own subscription (to render plan/billing UI). All
-- writes are service-role only (edge functions / webhooks). billing_events is
-- never client-readable.
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;

drop policy if exists subscriptions_owner_read on public.subscriptions;
create policy subscriptions_owner_read on public.subscriptions
  for select using (auth.uid() = user_id);

-- No client insert/update/delete policies: only the service role (which bypasses
-- RLS) may write, so a client can never grant itself a plan.

-- Keep updated_at fresh on any change.
create or replace function public.touch_subscription_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_subscription_updated_at();
