-- 0106 — TWO THINGS WITH NOWHERE TO LIVE.
--
-- Phase 12 item 13 (screen recording as a clip type) and §7a's blocked
-- production-mode signal both stopped at the same wall: the value they need has
-- no column. Neither is a design question; both are one field.
--
-- ---------------------------------------------------------------------------
-- 1. A CLIP IS NOT A SOURCE
-- ---------------------------------------------------------------------------
--
-- `media_assets.kind` was a closed list — ('source', 'music', 'output',
-- 'thumbnail') — and a screen recording is none of them. It is not the SOURCE:
-- that is the one take the editor cuts, pinned by a capture SHA to the script
-- the creator read, and there is exactly one per project by design. A screen
-- capture is footage shown DURING that take.
--
-- Adding a kind is safe here in a way it usually is not, and the reason is
-- checkable rather than hopeful: EVERY existing consumer names 'source'
-- explicitly (`a.kind = 'source'`, or `<> 'source'` in the two negative cases),
-- so no existing query widens to pick a clip up. 0091's
-- `source_validate_not_source` even refuses to validate a non-source asset,
-- which is the behaviour we want — a clip is not put through the source
-- validator, because that validator enforces properties of a recorded TAKE.
--
-- THE IDEMPOTENCY BACKBONE EXTENDS TO CLIPS, DELIBERATELY.
-- `media_assets_source_needs_attempt` required a `recording_attempt_id` only
-- for sources. A screen capture is exactly the case where a creator retries —
-- the share-picker is cancelled, the wrong window is chosen, the tab is
-- refreshed — so a clip gets the same guarantee: one attempt is one asset, no
-- matter how many tabs call create. Without it, three cancelled attempts leave
-- three half-uploaded rows and the creator picks between them.
--
-- ---------------------------------------------------------------------------
-- 2. THE REFERENCE'S HALF OF PRODUCTION-MODE MATCH
-- ---------------------------------------------------------------------------
--
-- §7a calls production-mode match "the one nobody builds and it is the most
-- valuable", and says "the flags already carry it". Building the ranking found
-- that half true: the CAPABILITY FLAGS carry the CREATOR's half (can they film
-- objects, record a screen). NOTHING carried the REFERENCE's half — no field
-- said whether a gallery card is a multi-clip montage, a screen capture, or one
-- continuous piece to camera.
--
-- So the signal was blocked on a missing measurement rather than on wiring.
-- These two columns are that measurement.
--
-- NULL IS THE POINT, AGAIN. Three states, exactly as 0103's capability flags:
-- true, false, and NOBODY HAS ASSESSED THIS CARD. The gallery is full of
-- scraped rows nobody has looked at, and defaulting them to false would tell a
-- creator who cannot film objects that every unassessed reference is fine for
-- them — a missing value read as a real one, in the place §7a says it costs
-- most. There is deliberately NO BACKFILL, because there is no answer to
-- backfill.

-- ---------------------------------------------------------------------------
-- 1. media_assets: the 'clip' kind
-- ---------------------------------------------------------------------------
-- The old CHECK was declared inline, so its name is whatever Postgres chose.
-- `drop constraint if exists <guessed name>` would silently do NOTHING on a
-- mismatch and then add a SECOND check beside the surviving restrictive one —
-- leaving 'clip' refused, with a migration that reported success. So the old
-- one is found BY ITS DEFINITION and dropped by its real name.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public' and rel.relname = 'media_assets'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%thumbnail%'
  loop
    execute format('alter table public.media_assets drop constraint %I', c.conname);
  end loop;
end $$;
-- ⚖️ THE LOOP ABOVE ALREADY DROPS THIS ONE, BUT ONLY BY ACCIDENT: it matches on
-- the definition containing 'thumbnail', and this constraint happens to list
-- 'thumbnail'. Edit that list and the migration silently stops being
-- re-runnable. The explicit drop-by-name does not depend on the definition.
alter table public.media_assets
  drop constraint if exists media_assets_kind_check;
alter table public.media_assets
  add constraint media_assets_kind_check
  check (kind in ('source', 'music', 'output', 'thumbnail', 'clip'));

-- One attempt, one asset — for clips as well as sources.
alter table public.media_assets
  drop constraint if exists media_assets_source_needs_attempt;
alter table public.media_assets
  add constraint media_assets_source_needs_attempt
  check (kind not in ('source', 'clip') or recording_attempt_id is not null);

-- WHICH declared slot this clip fills. Phase 12 item 11 writes `[SHOW: the
-- settings page]` into the script; this is the name it is matched back to.
-- NULL means an unattached clip, which is a legitimate state (a creator can
-- record something before deciding where it goes) and NOT a clip that fills
-- every slot.
alter table public.media_assets
  add column if not exists clip_label text;
alter table public.media_assets
  drop constraint if exists media_assets_clip_label_only_on_clips;
alter table public.media_assets
  add constraint media_assets_clip_label_only_on_clips
  check (clip_label is null or kind = 'clip');
alter table public.media_assets
  drop constraint if exists media_assets_clip_label_len;
alter table public.media_assets
  add constraint media_assets_clip_label_len
  check (clip_label is null or length(btrim(clip_label)) between 1 and 200);

-- The query a capture screen runs: this generation's clips, newest first.
create index if not exists media_assets_clip_idx
  on public.media_assets (generation_id, kind, created_at desc)
  where kind = 'clip';

-- ---------------------------------------------------------------------------
-- 2. gallery_items: what a reference REQUIRES to shoot
-- ---------------------------------------------------------------------------
-- Both nullable with no default. NULL = nobody has assessed this card, which is
-- the state nearly every scraped row is in and must stay in until something
-- actually looks.
alter table public.gallery_items
  add column if not exists requires_filming_objects boolean;
alter table public.gallery_items
  add column if not exists requires_screen_recording boolean;

-- Who assessed it, so an answer can be trusted or re-checked rather than taken
-- on faith. A closed list: 'human' is somebody who watched it, 'model' is a
-- reading of the card's own text, and the two are not the same evidence — the
-- distinction `referenceEvidence.ts` spends its whole taxonomy on.
alter table public.gallery_items
  add column if not exists requirements_source text;
alter table public.gallery_items
  drop constraint if exists gallery_items_requirements_source_check;
alter table public.gallery_items
  add constraint gallery_items_requirements_source_check
  check (requirements_source is null or requirements_source in ('human', 'model'));

-- An assessment must say where it came from, and a source with no assessment is
-- a claim about nothing. The two travel together or neither exists.
alter table public.gallery_items
  drop constraint if exists gallery_items_requirements_need_source;
alter table public.gallery_items
  add constraint gallery_items_requirements_need_source
  check (
    (requires_filming_objects is null and requires_screen_recording is null)
      = (requirements_source is null)
  );

-- No new grants. `gallery_items` already gives authenticated SELECT, and these
-- are read-only facts about a curated card: the discovery scraper (service role)
-- is what will write them. A client that could set them could tell itself a
-- reference is shootable.
