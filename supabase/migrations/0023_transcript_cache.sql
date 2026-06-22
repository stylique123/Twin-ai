-- Efficiency (#cost+time): reference-transcript cache.
--
-- A reference video transcribed once never needs transcribing again. Repeat
-- references — especially gallery remixes of the SAME viral video by many users —
-- otherwise re-run yt-dlp/Apify + faster-whisper + a structure Gemini call every
-- time. We key transcripts by a normalized URL and clone a recent one into the
-- caller's own row (RLS-owned) instead of re-doing the work. Saves both the
-- per-remix transcription cost AND ~3-30s of latency on cache hits.

alter table public.transcripts add column if not exists url_key text;
create index if not exists transcripts_urlkey_idx on public.transcripts (url_key, created_at desc);

-- Clone the most recent cached transcript for a URL key into a new row owned by
-- p_owner. Returns the new transcript id, or null on a cache miss. Only clones
-- transcripts that already have a derived structure (so the blueprint path is
-- complete). Service-role only.
create or replace function public.clone_cached_transcript(p_url_key text, p_owner uuid, p_max_age_days integer default 30)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare new_id uuid; src public.transcripts;
begin
  if p_url_key is null or p_url_key = '' then return null; end if;
  select * into src from public.transcripts
   where url_key = p_url_key
     and structure is not null
     and created_at >= now() - make_interval(days => p_max_age_days)
   order by created_at desc
   limit 1;
  if not found then return null; end if;

  insert into public.transcripts (owner_id, source_url, url_key, platform, language, duration_sec, text, words, segments, structure)
  values (p_owner, src.source_url, src.url_key, src.platform, src.language, src.duration_sec, src.text, src.words, src.segments, src.structure)
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.clone_cached_transcript(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.clone_cached_transcript(text, uuid, integer) to service_role;
