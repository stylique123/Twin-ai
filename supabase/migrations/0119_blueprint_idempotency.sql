-- ONE CLICK MUST COST ONE REMIX, NOT THREE.
--
-- `generate-blueprint` spends credits with `spend_credits` BEFORE the model call
-- and refunds only from its `catch`. That is correct for a FAILED build. It does
-- nothing at all for the case a creator actually hit: the same build being
-- STARTED more than once.
--
-- The mechanism, exactly. `V2Building` runs the build in a `useEffect`, guarded
-- by `started.current` — a `useRef`. A ref lives on the component instance, so
-- navigating away and back (or refreshing) mounts a NEW instance with
-- `started.current === false`, and the build runs again. Every run is a fresh,
-- successful, fully-charged generation. Nothing failed, so nothing refunded.
-- Three navigations = three remixes for one video.
--
-- `start-editor-v2` already solved this: the client mints an idempotency key per
-- CLICK-INTENT and the database converges retries of that click onto one row.
-- This is the same contract for the blueprint, and it belongs in the database
-- rather than in the client, because the client is the thing that keeps
-- remounting. A ref cannot survive a refresh; a unique index can.
--
-- SCOPED PER USER, not globally: two creators must never collide on a key, and a
-- key is only ever meaningful next to the person who minted it.
--
-- PARTIAL, so the column stays optional. Every generation written before this
-- migration — and any caller that does not send a key — has NULL, and NULL is
-- not "some other row's key". A unique index over a nullable column would still
-- permit unlimited NULLs in Postgres, but the partial predicate says so out
-- loud: absence is not a value, and this index has an opinion about keys only.
alter table public.generations
  add column if not exists idempotency_key text;

create unique index if not exists generations_user_idempotency_key
  on public.generations (user_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.generations.idempotency_key is
  'Per-user key for one build INTENT. A remount, refresh or retry of the same '
  'click reuses it, so generate-blueprint returns the existing generation '
  'instead of spending another remix. NULL = a caller that sent no key.';
