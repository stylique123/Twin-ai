-- §R — One handle, many owners: the guard that is a QUESTION, not a block.
--
-- ⚠️ MEASURED 2026-09-20. Six handle+platform pairs are claimed by more than one
-- owner, across 20 `ready` voices:
--     garyvee/tiktok 5 · styliquetechnologies/instagram 5 · hormozi/instagram 4
--     alexhormozi/youtube 2 · mrbeast/instagram 2 · woodsyleather/youtube 2
-- Two people cannot both own one TikTok account, so multi-owner is an OBJECTIVE
-- signal needing no celebrity list and no follower threshold.
--
-- ⚠️ BUT IT DOES NOT MEAN ONE THING, WHICH IS WHY AUTO-REFUSAL IS THE WRONG FIX.
-- `garyvee`/`hormozi`/`mrbeast` are strangers' accounts scanned as the creator's
-- own — their sentences stored under `subject='own'` and handed to the writer as
-- things the creator said. `styliquetechnologies` under five owners is one team
-- legitimately sharing a company account. A refusal breaks the second case;
-- silence ships the first. So we ASK, and record the ANSWER.
--
-- ⚖️ WHAT A "NO" DOES — AND WHY IT IS A DEMOTION, NOT A DELETION. Studying a
-- competitor is legitimate; claiming their speech as your own is not. So a
-- disclaimed voice KEEPS its row and its profile and becomes a REFERENCE voice,
-- and its stored speech is restamped `subject = 'reference'`.
--
-- ⚖️ AND THAT RESTAMP IS THE WHOLE POINT OF DOING IT THIS WAY. Every reader that
-- matters already filters on `subject = 'own'` — the style compiler in
-- `generate-blueprint`, `remineKnowledge`, the voice compiler. Flipping `subject`
-- therefore switches ALL of them off for that voice at once, with no new column
-- for a reader to forget. This guard rides the filter the codebase already
-- trusts rather than adding a second one beside it.
--
-- ⚠️ FORWARD-ONLY: NOTHING IS BACKFILLED TO 'own'. Marking the unconflicted rows
-- 'own' would assert an ownership fact nobody supplied — the same fabrication in
-- a smaller font. `unverified` is the default and behaves exactly as today; only
-- an explicit 'reference' has teeth. Six single-owner voices in production are
-- public figures scanned by someone who is not them (hubermanlab, zachking,
-- aliabdaal, davidheikka, matthew_berman, starterstory) and show NO objective
-- signal — they stay `unverified` rather than being blessed by a backfill.

alter table public.brand_voices
  add column if not exists ownership text not null default 'unverified',
  -- ⚠️ 'NEVER ASKED' AND 'ASKED, NO ANSWER YET' ARE DIFFERENT STATES and the UI
  -- needs to tell them apart, or it re-asks a question the creator has already
  -- dismissed on every single page load.
  add column if not exists ownership_asked_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'brand_voices_ownership_check'
  ) then
    alter table public.brand_voices
      add constraint brand_voices_ownership_check
      check (ownership in ('unverified', 'own', 'reference'));
  end if;
end $$;

-- The conflict lookup: "does anyone else already claim this handle+platform?"
-- Lowercased because `garyvee` and `GaryVee` are one account.
create index if not exists brand_voices_handle_claim_idx
  on public.brand_voices (lower(handle), platform);

create index if not exists brand_voices_ownership_idx
  on public.brand_voices (ownership) where ownership <> 'unverified';

grant update (ownership, ownership_asked_at) on public.brand_voices to authenticated;

-- ---------------------------------------------------------------------------
-- The restamp, as a trigger rather than as client code.
--
-- ⚖️ A TRIGGER, BECAUSE THE INVARIANT MUST NOT DEPEND ON WHICH CLIENT WRITES.
-- The answer can arrive from the web app, from `start-dna`, from an admin fixing
-- a row by hand. If the restamp lived in one of those, the other two would leave
-- a voice marked `reference` whose speech was still stamped `own` — which is
-- precisely the silent state this section exists to remove.
--
-- ⚠️ SCOPED BY `brand_voice_id`, WHICH IS WHY 0220 HAD TO LAND FIRST. Before
-- that column existed the only handle on a transcript was `owner_id`, and an
-- owner with ten voices would have had all ten demoted by one answer about one.
-- Rows still NULL are left alone: unattributed is not the same as disclaimed,
-- and demoting them would silently retire speech that may belong to a voice the
-- creator has confirmed.
-- ---------------------------------------------------------------------------
create or replace function public.brand_voice_ownership_restamp()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.ownership = 'reference' and coalesce(old.ownership, '') <> 'reference' then
    update public.transcripts
       set subject = 'reference'
     where brand_voice_id = new.id
       and subject = 'own';
  end if;
  return new;
end;
$$;

drop trigger if exists brand_voices_ownership_restamp on public.brand_voices;
create trigger brand_voices_ownership_restamp
  after update of ownership on public.brand_voices
  for each row execute function public.brand_voice_ownership_restamp();

-- ---------------------------------------------------------------------------
-- The reader.
--
-- ⚠️ RLS MEANS THE CLIENT CANNOT SEE THE CONFLICT. A creator can read their own
-- `brand_voices` rows and nobody else's — which is exactly the information the
-- question depends on. Without this the UI could never ask about the 20 voices
-- that ALREADY exist, and the guard would only ever apply to future scans.
--
-- ⚖️ IT RETURNS IDS AND A COUNT, NEVER THE OTHER OWNERS. Who else claims the
-- handle is not the asking creator's business, and leaking it would turn a
-- safety question into a directory of other people's accounts.
create or replace function public.voice_ownership_conflicts()
returns table (voice_id uuid, other_owners int)
language sql
security definer set search_path = public
stable
as $$
  select v.id,
         (select count(distinct o.owner_id)::int
            from public.brand_voices o
           where lower(o.handle) = lower(v.handle)
             and o.platform = v.platform
             and o.owner_id <> v.owner_id)
    from public.brand_voices v
   where v.owner_id = auth.uid()
     and v.ownership = 'unverified'
     and exists (
       select 1 from public.brand_voices o
        where lower(o.handle) = lower(v.handle)
          and o.platform = v.platform
          and o.owner_id <> v.owner_id
     );
$$;

revoke all on function public.voice_ownership_conflicts() from public;
grant execute on function public.voice_ownership_conflicts() to authenticated;
