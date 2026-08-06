-- 0110 — REFERENCE-1: DID WE ACTUALLY WATCH THE VIDEO, OR DID WE PATTERN-MATCH?
--
-- `generate-blueprint` already branches on this. When `transcript_id` resolves
-- to a real transcript the prompt says "REFERENCE (REAL — analyzed from the
-- actual video)"; when it does not, the prompt falls back to a URL and the
-- creator's note, and the system instruction tells the model to frame
-- `reference_read.why_it_works` as how the PROVEN FORMAT holds attention rather
-- than as a fact about that clip.
--
-- Both branches produce a confident-looking `reference_read`. NOTHING RECORDS
-- WHICH ONE RAN.
--
-- ── WHY THAT IS A TRUST DEFECT AND NOT A LOGGING GAP ──────────────────────
--
-- A creator pastes a link, waits, and receives a "why it works" analysis. They
-- have no way to tell whether Twin read their video or reasoned from the shape
-- of videos like it. The fallback is reached by ingest failure, an unsupported
-- host, a private post, or a timeout — every one of them silent, and every one
-- of them leaving a screen that looks identical to the successful case.
--
-- The harm is not that pattern mode is bad. It is genuinely useful, and it is
-- the honest thing to do when a transcript cannot be had. The harm is that the
-- creator cannot tell, so they extend the trust earned by the real path to the
-- inferred one — and the first time they notice is when a "retention insight"
-- describes a video that does not exist. That is the same failure shape as the
-- discarded brief in 0109: a question asked and dropped is worse than one never
-- asked, because the belief is the dangerous half.
--
-- ── SERVER-OWNED, AND THE MODEL CANNOT WRITE IT ───────────────────────────
--
-- The obvious cheap version is a field inside `blueprint`. It is wrong: the
-- blueprint IS the model's output, so a field there is a claim the model makes
-- about its own evidence — exactly the thing that cannot be trusted. This is a
-- separate column, written by the edge function from the branch it actually
-- took, after the model returns. The model never sees it and cannot set it.
--
-- ── THREE STATES, BECAUSE UNSET IS NOT `pattern` ──────────────────────────
--
-- NULL means this generation predates the column — we genuinely do not know
-- which path ran, and saying "pattern" would be inventing a fact about history
-- to make a badge render. A reader must show nothing rather than guess, which
-- is the same rule preflight follows for an unmeasured signal.
--
--   real     a transcript was loaded and its text/structure reached the prompt
--   pattern  no transcript; the model reasoned from the format
--   none     no reference was supplied at all
--
-- `reason` is only meaningful for `pattern` and names WHY the real path was not
-- taken, so a creator reading "we could not read this one" gets the actual
-- cause rather than a shrug.

create or replace function public.is_reference_analysis(p jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select p is null
      or (
        jsonb_typeof(p) = 'object'
        and p ? 'mode'
        and p ->> 'mode' in ('real', 'pattern', 'none')
        and not exists (
          select 1 from jsonb_object_keys(p) k where k not in ('mode', 'reason')
        )
        -- A reason is a NON-EMPTY string when present, for the same reason 0109
        -- refuses one: an empty string reads as "no reason given" to anything
        -- that trims and as "a reason exists" to anything that checks the key.
        and (
          not p ? 'reason'
          or (jsonb_typeof(p -> 'reason') = 'string' and btrim(p ->> 'reason') <> '')
        )
        -- A reason belongs to the fallback. Attaching one to `real` would
        -- describe a failure that did not happen.
        and (not p ? 'reason' or p ->> 'mode' = 'pattern')
      );
$$;
revoke all on function public.is_reference_analysis(jsonb) from public, anon, authenticated;
grant execute on function public.is_reference_analysis(jsonb) to authenticated, service_role;

alter table public.generations
  add column if not exists reference_analysis jsonb;

alter table public.generations
  drop constraint if exists generations_reference_analysis_shape;
alter table public.generations
  add constraint generations_reference_analysis_shape
  check (public.is_reference_analysis(reference_analysis));

-- NO CLIENT WRITE GRANT, DELIBERATELY.
--
-- 0054 locked down `generations` INSERT and 0074 revoked the editor columns; the
-- client reads this via RLS and never writes it. That is the whole point: a
-- column a client can write is a column that can claim we watched a video we
-- did not. Only the edge function's service role sets it, from the branch it
-- actually executed.
comment on column public.generations.reference_analysis is
  'REFERENCE-1. Server-owned provenance for the reference read: {"mode":"real"|"pattern"|"none"[,"reason":"..."]}. '
  'Written by generate-blueprint from the branch it took, never by the model and never by a client. '
  'NULL means the generation predates the column — unknown, not "pattern".';
