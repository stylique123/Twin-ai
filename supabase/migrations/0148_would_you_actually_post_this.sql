-- THE ONLY STAGE NO TABLE CAN ANSWER.
--
-- ⚠️ 41 SCRIPTS, 3 RECORDINGS, 0 EXPORTS, 0 EDITS. Every other stage of the
-- funnel is already recorded somewhere — generations, script_edits,
-- source_capture_intents, media_assets, edit_projects, edit_outputs — and
-- `recordingFunnel.ts` reads those rather than minting a second version of the
-- truth. This is the one thing none of them knows: whether the creator would
-- actually put it on their account.
--
-- ⚖️ AND IT IS NOT `generations.approved`. That flag belongs to the review flow
-- and means "an approver signed this off". This is the creator's own answer
-- about their own feed, which is a different question with a different owner,
-- and folding one into the other would make both unreadable.
--
-- ⚖️ ONE ROW PER GENERATION, AND CHANGEABLE. A creator who says "only if I
-- changed some of it", edits it, and then would post it has told us something
-- real; freezing the first answer would record the worse one forever. The
-- previous answer is kept in `answered_before` so a change of mind is still
-- visible rather than overwritten silently.

create table if not exists public.publish_intents (
  generation_id  uuid primary key references public.generations(id) on delete cascade,
  owner_id       uuid not null references auth.users(id) on delete cascade,
  -- would_post | needs_changes | would_not_post — the union in recordingFunnel.ts
  intent         text not null,
  -- ⚠️ OPTIONAL AND UNPROMPTED. A required box turns a one-tap answer into a
  -- form and we stop getting answers at all.
  note           text,
  -- What they said last time, so a change of mind is legible.
  answered_before text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint publish_intents_intent_known
    check (intent in ('would_post', 'needs_changes', 'would_not_post')),
  constraint publish_intents_note_bounded
    check (note is null or char_length(note) <= 2000)
);

create index if not exists publish_intents_owner_idx
  on public.publish_intents (owner_id, created_at desc);

alter table public.publish_intents enable row level security;

-- ⚖️ THE CREATOR OWNS THEIR OWN ANSWER, and nobody else may write it. An answer
-- somebody else can set is not evidence about the creator.
drop policy if exists publish_intents_select_own on public.publish_intents;
create policy publish_intents_select_own on public.publish_intents
  for select using (auth.uid() = owner_id);

drop policy if exists publish_intents_insert_own on public.publish_intents;
create policy publish_intents_insert_own on public.publish_intents
  for insert with check (
    auth.uid() = owner_id
    -- ⚠️ AND ONLY ABOUT THEIR OWN GENERATION. Without this an authenticated
    -- user could answer on behalf of somebody else's script, which is exactly
    -- the shape of hole 0141 was written to close elsewhere.
    and exists (
      select 1 from public.generations g
      where g.id = generation_id and g.user_id = auth.uid()
    )
  );

drop policy if exists publish_intents_update_own on public.publish_intents;
create policy publish_intents_update_own on public.publish_intents
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ⚠️ NO DELETE POLICY, DELIBERATELY. Telemetry a creator can erase is telemetry
-- that disappears exactly when the answer was unflattering.

-- Keep `updated_at` honest and preserve the prior answer on a change of mind.
create or replace function public.publish_intents_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.intent is distinct from old.intent then
    new.answered_before := old.intent;
  end if;
  return new;
end $$;

drop trigger if exists publish_intents_touch on public.publish_intents;
create trigger publish_intents_touch
  before update on public.publish_intents
  for each row execute function public.publish_intents_touch();

comment on table public.publish_intents is
  'Would the creator actually post this? The one funnel stage no other table can answer. See packages/shared/src/recordingFunnel.ts.';
