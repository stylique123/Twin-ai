-- A WATCHED SESSION LIVES IN THE DATABASE, NOT ON A LAPTOP.
--
-- ⚠️ THE SAME DEFECT THAT 0163 FIXED FOR THE PILOT. `scripts/d1-observer.mjs`
-- reconstructs a timeline and serves a form from the container that ran it.
-- That container's localhost is reachable by nobody but itself, the session
-- record dies with the process, and a second observer on a second machine
-- produces a second unrelated record of "the D1 session".
--
-- ⚖️ AND THE HUMAN FIELD IS THE ONLY ONE THAT MATTERS. Telemetry can say a
-- creator opened the camera and closed it without recording. It CANNOT say
-- whether the script was wrong, the premise was wrong, the shot was too hard,
-- or their flatmate walked in — and those have completely different fixes. The
-- machine evidence is collected automatically so the observer's whole attention
-- is free for the one question a machine cannot answer.

-- ── the session ───────────────────────────────────────────────────────────
create table if not exists public.watched_sessions (
  id uuid primary key default gen_random_uuid(),

  -- Who ran the session, and who was watched. Separate columns because the
  -- observer is never the subject; a row where they match is a self-test, and
  -- reading it as evidence about creators would be a category error.
  observer_user_id uuid not null,
  subject_user_id uuid not null,

  -- ⚠️ CONSENT IS A PRECONDITION, NOT A FIELD TO FILL IN LATER. The constraint
  -- below refuses a started session without it. Recording that someone agreed
  -- AFTER watching them is not consent, it is bookkeeping.
  consent_given_at timestamptz,

  status text not null default 'created'
    check (status in ('created', 'watching', 'finished', 'locked', 'abandoned')),

  started_at timestamptz,
  finished_at timestamptz,
  locked_at timestamptz,
  locked_by uuid,

  -- The frozen taxonomy version the observation was recorded against. A later
  -- session scored on a different list is not comparable, and silently
  -- comparing them is how a taxonomy change looks like a behaviour change.
  taxonomy_version text not null default 'd1_blockers_v1',

  created_at timestamptz not null default now(),

  constraint watched_session_consent_before_watching check (
    status = 'created' or status = 'abandoned' or consent_given_at is not null
  ),
  constraint watched_session_lock_is_complete check (
    (status <> 'locked' and locked_at is null and locked_by is null)
    or (status = 'locked' and locked_at is not null and locked_by is not null)
  ),
  -- ⚠️ AN OBSERVER IS NOT THE SUBJECT. Enforced rather than trusted, because
  -- the easy way to "test the flow" is to watch yourself, and the resulting row
  -- looks exactly like real evidence.
  constraint watched_session_observer_is_not_subject check (observer_user_id <> subject_user_id)
);

-- ── the machine evidence, collected automatically ─────────────────────────
--
-- ⚠️ A SNAPSHOT, NOT A LIVE VIEW. analytics_events keeps changing; a report
-- generated a week later against a moving table is not the session that was
-- watched. The rows that existed inside the session window are copied here and
-- frozen at finish.
create table if not exists public.watched_session_events (
  id uuid primary key default gen_random_uuid(),
  watched_session_id uuid not null references public.watched_sessions(id) on delete cascade,
  event_name text not null,
  occurred_at timestamptz not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists watched_session_events_session_idx
  on public.watched_session_events (watched_session_id, occurred_at);

-- ── what the machine could NOT see ────────────────────────────────────────
--
-- ⚠️ ABSENT IS NOT ZERO, AND THIS TABLE EXISTS TO SAY SO. "the creator never
-- opened the camera" and "we never instrumented camera_opened" are identical in
-- an event stream and point at opposite fixes. Every required event that never
-- arrived is recorded as a named gap, and that list is the input to #71.
create table if not exists public.watched_session_gaps (
  id uuid primary key default gen_random_uuid(),
  watched_session_id uuid not null references public.watched_sessions(id) on delete cascade,
  event_name text not null,
  -- Why it is missing, as far as anyone can tell. NEVER guessed by the system:
  -- 'uninstrumented' is a fact about the code and is the only value the machine
  -- may write on its own.
  reason text not null check (reason in ('uninstrumented', 'not_reached', 'unknown')),
  created_at timestamptz not null default now(),
  unique (watched_session_id, event_name)
);

-- ── the human answer ──────────────────────────────────────────────────────
--
-- ⚠️ APPEND-ONLY, AND NEVER AUTO-GENERATED. No model, heuristic or rule may
-- write a row here. It is the observer's record of what the creator said, in
-- the creator's words, and it is the entire reason the session happened.
create table if not exists public.watched_session_observations (
  id uuid primary key default gen_random_uuid(),
  watched_session_id uuid not null references public.watched_sessions(id) on delete cascade,
  -- From the frozen taxonomy. OTHER is the pressure gauge on the list, not a
  -- failure of it: if OTHER wins twice, the taxonomy is wrong, and that is a
  -- finding rather than something to paper over.
  blocker text not null,
  -- ⚠️ THE CREATOR'S OWN WORDS. A blocker code alone says nothing; two sessions
  -- coded SCRIPT_REJECTION can mean "too formal" and "factually wrong about my
  -- product", which are different products.
  creator_reason text not null check (length(btrim(creator_reason)) > 0),
  recorded_by uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists watched_session_observations_session_idx
  on public.watched_session_observations (watched_session_id, created_at);

-- ── the refusals, as triggers ─────────────────────────────────────────────
create or replace function public.refuse_observation_after_lock()
returns trigger language plpgsql as $$
declare locked boolean;
begin
  select (status = 'locked') into locked
    from public.watched_sessions where id = new.watched_session_id;
  if locked then
    raise exception 'watched session % is locked — its observations are final', new.watched_session_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_refuse_observation_after_lock on public.watched_session_observations;
create trigger trg_refuse_observation_after_lock
  before insert or update on public.watched_session_observations
  for each row execute function public.refuse_observation_after_lock();

create or replace function public.refuse_evidence_change_after_finish()
returns trigger language plpgsql as $$
declare st text;
begin
  select status into st from public.watched_sessions
    where id = coalesce(new.watched_session_id, old.watched_session_id);
  if st in ('finished', 'locked') then
    raise exception 'the machine evidence for a % session may not change (status %)', st, st;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_refuse_evidence_change on public.watched_session_events;
create trigger trg_refuse_evidence_change
  before insert or update or delete on public.watched_session_events
  for each row execute function public.refuse_evidence_change_after_finish();

-- ── ACCESS ────────────────────────────────────────────────────────────────
--
-- ⚠️ SYSTEM-OWNED, EXACTLY AS 0163. RLS on, no policies, no client grants.
-- Supabase grants ALL on new public tables by default, so leaving this alone
-- would hand anon and authenticated INSERT, UPDATE, DELETE and TRUNCATE over a
-- creator's own words about why they stopped.
alter table public.watched_sessions enable row level security;
alter table public.watched_session_events enable row level security;
alter table public.watched_session_gaps enable row level security;
alter table public.watched_session_observations enable row level security;

revoke all on table public.watched_sessions from anon, authenticated;
revoke all on table public.watched_session_events from anon, authenticated;
revoke all on table public.watched_session_gaps from anon, authenticated;
revoke all on table public.watched_session_observations from anon, authenticated;
