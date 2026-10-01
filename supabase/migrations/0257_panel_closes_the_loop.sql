-- ⚠️ AUDIT 2026-10-01 (persona panel brief). 172 tests: a flagged gap led to a
-- rewritten line in ~3%. "Unanswered question" was flagged 83 times, backed by
-- 5 of 10 viewers on average, and needs a fact only the creator has. So:
--   needs_her   — questions the panel says only she can answer (asked on the page)
--   working     — what landed and why (a positive signal, learned from)
--   unverified  — specific details in the script her material does not back
--   out_of_scope — viewers who would not watch this KIND of video, left out
alter table public.audience_tests
  add column if not exists needs_her jsonb not null default '[]'::jsonb,
  add column if not exists working jsonb not null default '[]'::jsonb,
  add column if not exists unverified jsonb not null default '[]'::jsonb,
  add column if not exists out_of_scope int not null default 0;

-- Her answer to one panel question: stored on the test (so the worker rewrites
-- the line with it) and in her knowledge as her own stated words.
create or replace function public.answer_panel_question(p_generation uuid, p_index int, p_answer text)
returns boolean language plpgsql security definer set search_path = public as $fn$
declare
  t record;
  q jsonb;
  a text := btrim(coalesce(p_answer, ''));
begin
  if length(a) < 1 or length(a) > 240 then return false; end if;
  select * into t from public.audience_tests where generation_id = p_generation and owner_id = auth.uid();
  if not found then return false; end if;
  q := t.needs_her -> p_index;
  if q is null then return false; end if;
  update public.audience_tests
     set needs_her = jsonb_set(needs_her, array[p_index::text],
                     q || jsonb_build_object('answer', a, 'answered_at', now(), 'applied_at', null))
   where generation_id = p_generation;
  insert into public.creator_knowledge (owner_id, kind, text, basis, source, confidence, times_seen, source_ref, evidence, last_observed_at)
  values (auth.uid(), 'fact', a, 'stated', 'asked', 0.9, 1,
          left('panel:' || p_generation::text || ':' || p_index::text, 200),
          left('Asked by Twin: ' || coalesce(q ->> 'question', ''), 240), now())
  on conflict do nothing;
  return true;
end $fn$;
revoke all on function public.answer_panel_question(uuid, int, text) from public;
grant execute on function public.answer_panel_question(uuid, int, text) to authenticated;

-- Answered panel questions not yet written into the script.
create or replace function public.panel_answers_pending(p_limit int default 1)
returns table(generation_id uuid, owner_id uuid, blueprint jsonb, needs_her jsonb)
language sql stable security definer set search_path = public as $fn$
  select t.generation_id, t.owner_id, g.blueprint, t.needs_her
  from public.audience_tests t join public.generations g on g.id = t.generation_id
  where exists (select 1 from jsonb_array_elements(t.needs_her) q
                where q ? 'answer' and coalesce(q ->> 'applied_at', '') = '')
  order by t.created_at desc
  limit greatest(1, least(p_limit, 5));
$fn$;
revoke all on function public.panel_answers_pending(int) from public;

-- Panels v2 are built from her posts AND her niche's real high-reach videos,
-- and each viewer says what kind of her videos they watch. Old panels rebuild.
create or replace function public.panels_due(p_limit integer default 1)
returns table(voice_id uuid, owner_id uuid, profile jsonb, posts integer)
language sql stable security definer set search_path to 'public' as $function$
  select v.id, v.owner_id, v.profile,
         (select count(*)::int from public.scraped_posts s where s.voice_id = v.id)
  from public.brand_voices v
  left join public.audience_panels p on p.voice_id = v.id
  where v.status = 'ready' and v.profile is not null
    and (p.voice_id is null
         or p.built_at < now() - interval '7 days'
         or coalesce(p.built_from ->> 'v', '1') <> '2'
         or p.posts_seen < (select count(*) from public.scraped_posts s where s.voice_id = v.id) - 5)
  order by p.built_at nulls first
  limit greatest(1, least(p_limit, 10));
$function$;
