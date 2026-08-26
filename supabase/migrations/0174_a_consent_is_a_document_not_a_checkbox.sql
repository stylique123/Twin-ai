-- A CONSENT IS A SIGNED DOCUMENT. THIS TABLE ONLY POINTS AT ONE.
--
-- ── WHAT #204 ACTUALLY ASKS FOR ───────────────────────────────────────────
--
-- Issue #204 gates the beta on ~12 real recordings, and its consent section is
-- specific in ways that rule out the obvious implementation:
--
--   "must be in writing, before recording"
--   "signature or an unambiguous email reply"
--   "Store signed consents durably and SEPARATELY FROM THE RECORDINGS"
--   "Participants do not need to be creators. Friends and colleagues are fine."
--
-- ⚠️ SO AN IN-APP "I CONSENT" CHECKBOX AT THE RECORDING MOMENT IS NOT THIS, and
-- shipping one would be worse than shipping nothing: it would create the
-- appearance of compliance. The participants are recruited out of band and many
-- will never open the product. A timestamp written by a button is not a
-- signature, and a column on the recording's row is not "separately".
--
-- What this table is, therefore, is a REGISTER: it records that a signed
-- document exists, where it lives, and what it actually said -- never the
-- document, and never the participant's name or email. The signed artifact and
-- the identity stay outside this database, which is what "separately" means.
--
-- ── WHY THE ATTESTATIONS ARE COLUMNS AND NOT A JSONB BLOB ─────────────────
--
-- #204 lists six things the form must state. A blob would let five of six pass
-- unnoticed. Each is its own NOT NULL boolean and the CHECK below refuses a row
-- where any is false, because a consent missing one of them is not a weaker
-- consent -- it is not consent for what we would be doing.
create table if not exists public.eval_consents (
  id uuid primary key default gen_random_uuid(),

  -- ⚠️ PSEUDONYMOUS ON PURPOSE. A short opaque label ("P-07") that maps to a
  -- person only in the operator's own separate record. Putting a name or an
  -- email here would defeat "separately from the recordings" by reuniting the
  -- identity with the material inside one database.
  participant_ref text not null,

  -- Where the signed document actually lives -- a filing-system reference, not
  -- a URL into our storage. The document is deliberately NOT in this database.
  artifact_location text not null,

  -- The six statements #204 requires the form to make, each recorded as its own
  -- fact. `discloses_third_party_processing` is the one people forget: the
  -- Director sends transcripts and derived analysis to Google. Raw video does
  -- not leave our infrastructure, but the participant's words do.
  states_purpose boolean not null,
  states_who_sees_it boolean not null,
  states_not_published_or_marketing boolean not null,
  states_not_used_for_training boolean not null,
  states_retention_period boolean not null,
  states_right_to_withdraw boolean not null,
  discloses_third_party_processing boolean not null,

  -- ⚠️ BEFORE RECORDING, AND THE GATE CHECKS IT. Stored rather than assumed so
  -- a consent obtained after the fact is visible as such instead of passing.
  granted_at timestamptz not null,

  -- ⚖️ NULLABLE TIMESTAMPTZ, NOT A BOOLEAN -- the precedent 0124 set for
  -- product withdrawal, for the same reason: "when was this withdrawn" is a
  -- fact worth keeping, and a boolean cannot hold it. Null means live.
  -- Withdrawal gets a READER, it is never destructive: the row stays so the
  -- record of what was agreed, and when it ended, survives.
  withdrawn_at timestamptz,

  created_at timestamptz not null default now(),

  -- A consent that does not state all seven things is not a consent for what we
  -- would be doing with the recording.
  constraint eval_consent_states_everything check (
    states_purpose and states_who_sees_it and states_not_published_or_marketing
    and states_not_used_for_training and states_retention_period
    and states_right_to_withdraw and discloses_third_party_processing
  ),
  -- Withdrawing before granting is a data-entry error, not a state.
  constraint eval_consent_withdrawn_after_granted check (
    withdrawn_at is null or withdrawn_at >= granted_at
  ),
  constraint eval_consent_ref_is_short check (length(participant_ref) between 1 and 40)
);

-- One live consent per participant. A second row for the same person is either
-- a re-consent after withdrawal (legal, and the withdrawn one is not live) or a
-- duplicate nobody meant to create.
create unique index if not exists eval_consents_live_ref_idx
  on public.eval_consents (participant_ref) where withdrawn_at is null;

alter table public.eval_consents enable row level security;

-- ⚠️ NO CLIENT TOUCHES THIS, IN EITHER DIRECTION. There is no creator-facing
-- view of it and no browser path that should write one -- a participant is not
-- a user of the product. `revoke all` first rather than enumerating verbs,
-- because ROW SECURITY DOES NOT GATE TRUNCATE and enumerating is how 0172
-- shipped with a hole in it. Nothing is granted back: the register is
-- service-role only, read by the eval gate and written by an operator.
revoke all on table public.eval_consents from anon, authenticated;

-- ⚠️ NO POLICY EXISTS ON PURPOSE. RLS is enabled with no policy, so even a
-- future accidental grant still denies every client row. Belt and braces,
-- because the cost of being wrong here is somebody's face and voice.
