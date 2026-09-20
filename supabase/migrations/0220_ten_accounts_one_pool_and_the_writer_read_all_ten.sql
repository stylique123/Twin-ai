-- TEN PEOPLE'S SPEECH IN ONE POOL, AND THE COMPILER DRANK FROM ALL OF IT.
--
-- ⚠️ `transcripts` IS SCOPED TO `owner_id` AND NOTHING ELSE. The style/CTA
-- compiler in `generate-blueprint` reads:
--
--     .eq('owner_id', ownerId).eq('subject', 'own')
--     .order('created_at', { ascending: false }).limit(8)
--
-- with no voice scoping at all. Measured 2026-09-19: owner 30b0b9b2 holds TEN
-- ready voices — ten DIFFERENT people's accounts, `matthew_berman`,
-- `starterstory` and `davidheikka` among them. Whichever of the ten a script is
-- written for, the "how does this creator actually talk" evidence is the 8 most
-- recent transcripts across ALL TEN. Four of those handles returned
-- byte-identical totals (15 transcripts, 5,535 chars) because they are not four
-- stores; they are one store read four times.
--
-- ⚖️ THIS IS THE `garyvee` PROBLEM MADE STRUCTURAL. Storing a public figure's
-- sentences under a stranger's `subject='own'` is the fabrication class this
-- repo refuses; here the mixing needs no mis-scan to happen — a second voice is
-- enough, and the product offers one.
--
-- ⚖️ WHY `brand_voice_id` AND NOT `creator_handle`, WHICH THIS TABLE ALREADY
-- HAS. A handle is not an identity: accounts rename (two of the five voices
-- measured tonight had become unreadable under their stored handle while their
-- videos still played), and the same handle on two platforms is two people.
-- `brand_voice_id` is the key every `build_voice` payload already carries next
-- to the urls — which is also what makes the backfill below possible at all.
--
-- ⚖️ NULLABLE, AND THE NULL RULE IS THE WHOLE DESIGN. Rows this backfill cannot
-- attribute stay NULL, and the reader includes NULL **only when the owner has
-- exactly one voice at all** (not merely one READY voice: a failed or building
-- voice can already own stored rows). For every owner in production but one that is
-- unambiguous, so nothing regresses and no recovered speech is lost; for a
-- multi-voice owner the ambiguous rows are excluded rather than blended, which
-- stops the mixing immediately and without waiting on the backfill's accuracy.
alter table public.transcripts
  add column if not exists brand_voice_id uuid references public.brand_voices(id) on delete set null;

create index if not exists transcripts_voice_own_idx
  on public.transcripts (brand_voice_id, created_at desc)
  where subject = 'own';

-- Backfill from the job payloads, which are the only record of which voice a
-- given video was transcribed FOR.
--
-- ⚠️ AMBIGUITY IS LEFT NULL RATHER THAN GUESSED. If the same url was ever
-- transcribed under two different voices for one owner, attributing it either
-- way invents a fact; `having count(distinct vid) = 1` drops those, and the
-- reader's NULL rule then handles them correctly on its own.
--
-- ⚖️ RE-RUNNABLE: guarded by `brand_voice_id is null`, so a second apply is a
-- no-op rather than a rewrite (check_migration_rerunnable).
with pairs as (
  select distinct
    (j.payload->>'brand_voice_id')::uuid as vid,
    j.owner_id,
    jsonb_array_elements_text(j.payload->'urls') as url
  from public.jobs j
  where j.type = 'build_voice'
    and jsonb_typeof(j.payload->'urls') = 'array'
    and j.payload->>'brand_voice_id' ~ '^[0-9a-fA-F-]{36}$'
    and j.owner_id is not null
), unambiguous as (
  -- ⚠️ `min(uuid)` DOES NOT EXIST IN POSTGRES, and this shipped saying it did:
  -- CI is green on this file because staging has no `public.transcripts`, so
  -- the statement is never executed anywhere until it reaches production. The
  -- text cast is the aggregate; the `having` above already guarantees there is
  -- exactly ONE distinct value, so which row it picks cannot matter.
  select owner_id, url, (min(vid::text))::uuid as vid
  from pairs
  group by owner_id, url
  having count(distinct vid) = 1
)
update public.transcripts t
   set brand_voice_id = u.vid
  from unambiguous u
 where t.brand_voice_id is null
   and t.subject = 'own'
   and t.owner_id = u.owner_id
   and t.source_url = u.url;
