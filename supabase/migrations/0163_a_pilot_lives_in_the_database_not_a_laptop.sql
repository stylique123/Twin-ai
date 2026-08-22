-- A PILOT THAT LIVES IN A LAPTOP IS NOT AN EXPERIMENT, IT IS A NOTE.
--
-- ⚠️ THE DEFECT THIS FIXES IS ARCHITECTURAL AND IT WAS MINE. The frame pilot
-- froze its sample into .twinai-pilot/run.json and served the review from
-- 127.0.0.1. That means the frozen manifest cannot cross machines: enqueue on
-- one box and label on another, and the second box finds no manifest, DRAWS ITS
-- OWN SAMPLE, and the pre-registration is silently gone -- the exact
-- substitution the digest exists to refuse. It also means the reviewer must be
-- sitting at the machine that ran the command.
--
-- ⚖️ SO THE DATABASE IS THE AUTHORITY AND THE LOCAL FILE IS AT MOST A MIRROR.
-- A pilot is created and frozen here, enqueued BY ID from the frozen rows,
-- reviewed through Twin behind the owner's own session, and locked here. No
-- step needs the media to pass through whoever is orchestrating.
--
-- ⚠️ AND NO CLIENT ROLE TOUCHES ANY OF IT. These tables carry claims about
-- thousands of other creators' videos and an operator's un-locked judgments.
-- Same posture as reference_transcripts and reference_frames: RLS on, no
-- grants, reached only by the service role through an authenticated edge
-- function that checks who is asking.

-- ── the run: frozen once, then only its status moves ────────────────────────
create table if not exists public.visual_pilot_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text not null,
  -- ⚠️ THE ALGORITHM THAT DREW IT, VERSIONED. A sample is only re-drawable if
  -- you know which selector drew it; "deterministic" is a property of a
  -- specific function, not of the idea of one.
  selection_version text not null,
  requested_size int not null check (requested_size between 1 and 10),
  frozen_size int not null check (frozen_size >= 1),
  -- The digest of the sorted urls. Substitution after this point is refusable
  -- rather than merely discouraged.
  sample_digest text not null check (sample_digest ~ '^[0-9a-f]{64}$'),
  -- ⚖️ THE BILL, RECORDED BEFORE THE SPEND. force bypasses the transcript
  -- cache, so each reference pays a fresh acquisition AND a frames pull.
  expected_max_downloads int not null check (expected_max_downloads > 0),
  status text not null default 'frozen'
    check (status in ('frozen', 'enqueued', 'collecting', 'ready_for_label', 'locked', 'abandoned')),
  -- ── set only at lock ──
  locked_at timestamptz,
  locked_by text,
  review_version int not null default 0,
  claims_digest text,
  evidence_digest text,
  aggregate jsonb,
  friction jsonb,
  decision jsonb,
  brief jsonb,
  -- ⚠️ A LOCK IS ALL OR NOTHING. A row claiming to be locked without a time or
  -- a person is not a lock, it is a flag somebody flipped.
  constraint pilot_lock_is_complete check (
    (status <> 'locked' and locked_at is null and locked_by is null)
    or (status = 'locked' and locked_at is not null and locked_by is not null and review_version >= 1)
  )
);

-- ── the frozen references, with the stratum each was drawn from ─────────────
create table if not exists public.visual_pilot_references (
  pilot_run_id uuid not null references public.visual_pilot_runs (id) on delete cascade,
  url text not null,
  -- ⚠️ RECORDED AT SELECTION TIME. Deriving the stratum later from the CURRENT
  -- transcript_chars would re-read a number the pilot itself may have changed,
  -- and the draw would stop being explicable.
  stratum text not null check (stratum in ('chars_zero', 'chars_tiny')),
  creator_handle text,
  -- Filled in as the run progresses; null means not yet terminal.
  terminal_state text check (terminal_state in ('READY_FOR_LABEL', 'FAILED', 'UNREADABLE')),
  failure_code text,
  failure_stage text,
  frames_sampled int,
  download_route text,
  -- ⚖️ 0159 ARRIVING INSIDE THE PILOT. A reference drawn as silent can come back
  -- speaking, and then its frames were scheduled on beats rather than uniformly
  -- and it is no longer an example of the population drawn.
  turned_out_to_have_speech boolean not null default false,
  primary key (pilot_run_id, url)
);

-- ── one row per claim a human will be asked about ───────────────────────────
create table if not exists public.visual_pilot_claims (
  id uuid primary key default gen_random_uuid(),
  pilot_run_id uuid not null references public.visual_pilot_runs (id) on delete cascade,
  url text not null,
  claim_path text not null,
  -- ⚠️ `answered` IS THE MODEL'S SILENCE, NOT THE REVIEWER'S. A field the model
  -- never answered is still a row -- dropping it would make the pass look more
  -- complete the worse it did.
  answered boolean not null,
  claim_value jsonb,
  cited_frames int[] not null default '{}',
  canonical_values text[],
  constraint pilot_claim_once unique (pilot_run_id, url, claim_path)
);

-- ── every click, appended ───────────────────────────────────────────────────
--
-- ⚠️ APPEND-ONLY ON PURPOSE. The CURRENT label is the latest row, and the
-- history IS the backtrack telemetry: an answer replaced and a claim returned
-- to are different facts, and an UPDATE would erase both.
create table if not exists public.visual_pilot_labels (
  id uuid primary key default gen_random_uuid(),
  pilot_run_id uuid not null references public.visual_pilot_runs (id) on delete cascade,
  claim_id uuid not null references public.visual_pilot_claims (id) on delete cascade,
  reviewer text not null,
  label text check (label in ('SUPPORTED', 'UNSUPPORTED', 'INDETERMINATE', 'WRONG_EVIDENCE')),
  corrected_value text,
  -- null label = an explicit SKIP, which is not an answer and must not satisfy
  -- the completeness check.
  created_at timestamptz not null default now()
);
create index if not exists visual_pilot_labels_claim_idx
  on public.visual_pilot_labels (claim_id, created_at desc);

-- ── review friction, the only input to #69 ─────────────────────────────────
create table if not exists public.visual_pilot_events (
  id bigserial primary key,
  pilot_run_id uuid not null references public.visual_pilot_runs (id) on delete cascade,
  kind text not null check (kind in ('session_start', 'label', 'relabel', 'skip', 'frame_change', 'nav', 'key')),
  claim_id uuid,
  via text,
  created_at timestamptz not null default now()
);
create index if not exists visual_pilot_events_run_idx on public.visual_pilot_events (pilot_run_id, created_at);

-- ⚠️ THE LOCK IS ENFORCED BY THE DATABASE, NOT BY THE BUTTON. A disabled control
-- is a suggestion; a trigger is the rule. Without this, any path that still held
-- a service key could append a label after the lock and the digests would
-- silently stop describing the labels.
create or replace function public.refuse_label_after_lock()
returns trigger language plpgsql as $$
declare locked boolean;
begin
  select (status = 'locked') into locked from public.visual_pilot_runs where id = new.pilot_run_id;
  if locked then
    raise exception 'pilot % is locked: labels are frozen, and re-reviewing is a NEW review version', new.pilot_run_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_refuse_label_after_lock on public.visual_pilot_labels;
create trigger trg_refuse_label_after_lock before insert on public.visual_pilot_labels
  for each row execute function public.refuse_label_after_lock();

-- ⚖️ AND THE FROZEN SAMPLE IS FROZEN. Adding or removing a reference after the
-- run leaves 'frozen' is post-hoc subsetting, which is the defect the digest
-- exists to refuse -- so the database refuses it rather than trusting callers.
create or replace function public.refuse_sample_change_after_freeze()
returns trigger language plpgsql as $$
declare st text;
begin
  select status into st from public.visual_pilot_runs
   where id = coalesce(new.pilot_run_id, old.pilot_run_id);
  if st is not null and st <> 'frozen' then
    raise exception 'pilot sample may not change once the run has left frozen (status %)', st;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_refuse_sample_change on public.visual_pilot_references;
create trigger trg_refuse_sample_change before insert or delete on public.visual_pilot_references
  for each row execute function public.refuse_sample_change_after_freeze();

alter table public.visual_pilot_runs       enable row level security;
alter table public.visual_pilot_references enable row level security;
alter table public.visual_pilot_claims     enable row level security;
alter table public.visual_pilot_labels     enable row level security;
alter table public.visual_pilot_events     enable row level security;

-- ⚠️ NO POLICIES AND NO GRANTS. RLS on with zero policies means anon and
-- authenticated reach nothing; the review page talks to an edge function that
-- checks WHO is asking and then uses the service role. A client grant here
-- would publish other creators' frames and an operator's un-locked judgments.
revoke all on public.visual_pilot_runs, public.visual_pilot_references,
  public.visual_pilot_claims, public.visual_pilot_labels, public.visual_pilot_events
  from anon, authenticated;
