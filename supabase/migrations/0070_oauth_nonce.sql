-- Production-readiness (Phase 3) — server-stored single-use OAuth state nonces.
--
-- Security review's one production blocker: the `social` OAuth connect `state` was a
-- stateless HMAC blob that embedded the initiating user's id, was NOT session-bound,
-- had NO enforced expiry (the callback ignored the timestamp), and was NOT single-use
-- (fully replayable). Because the callback attributed the resulting social tokens
-- purely from `state.userId`, a valid state minted by an attacker could be delivered
-- to a victim (connection-fixation / account-linking CSRF): the victim authorizes
-- with THEIR credentials and the tokens land under the ATTACKER's owner_id — and
-- POSTING_LIVE is already true.
--
-- Fix: mint a random, single-use, short-TTL nonce row here at authenticated `start`
-- time (keyed to the real user), and in the callback atomically CONSUME it (delete +
-- return) and take owner_id/platform from the stored row — not from anything the
-- redirect carries. A replay finds no row; a stale nonce is rejected by age.

create table if not exists public.oauth_nonce (
  nonce      text primary key,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  platform   text not null,
  created_at timestamptz not null default now()
);

-- Service-role only. The client never reads or writes nonces directly — the `social`
-- edge function (service role) mints and consumes them. No RLS policies are added, so
-- with RLS enabled the anon/authenticated roles get nothing.
alter table public.oauth_nonce enable row level security;
revoke all on public.oauth_nonce from anon, authenticated;

create index if not exists oauth_nonce_created_at_idx on public.oauth_nonce (created_at);
