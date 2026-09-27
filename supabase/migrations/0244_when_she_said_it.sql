-- WHEN SHE SAID IT (24-ideas #8, contradictions across time).
--
-- ⚠️ No table recorded when a creator's video was posted, so "she said X in
-- March and the opposite in August" was unknowable. TikTok and Instagram post
-- ids ENCODE their own creation time, so the date is read from the link Twin
-- already stores on every transcript fact — no scrape, no guess. YouTube ids
-- carry no date and stay null.
alter table public.creator_knowledge add column if not exists video_posted_at timestamptz;

create or replace function public.video_posted_at_from_url(p_url text)
returns timestamptz language plpgsql immutable set search_path = public as $$
declare
  v_id numeric; v_code text; v_alpha text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; i int;
begin
  if p_url is null then return null; end if;
  -- TikTok: the top 32 bits of the video id are unix seconds.
  v_id := substring(p_url from 'tiktok\.com/.*/video/(\d{15,20})')::numeric;
  if v_id is not null then return to_timestamp(floor(v_id / 4294967296)); end if;
  -- Instagram: the shortcode is the media id in base64url; its top bits are
  -- milliseconds since Instagram's epoch (1314220021721).
  v_code := substring(p_url from 'instagram\.com/(?:[^/]+/)?(?:p|reel|reels|tv)/([A-Za-z0-9_-]{8,12})');
  if v_code is null then return null; end if;
  v_id := 0;
  for i in 1..length(v_code) loop
    v_id := v_id * 64 + (strpos(v_alpha, substr(v_code, i, 1)) - 1);
  end loop;
  return to_timestamp((floor(v_id / 8388608) + 1314220021721) / 1000.0);
exception when others then return null;
end;
$$;

create or replace function public.creator_knowledge_stamp_video_date()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.video_posted_at is null and new.source_url is not null then
    new.video_posted_at := public.video_posted_at_from_url(new.source_url);
  end if;
  return new;
end;
$$;
drop trigger if exists creator_knowledge_video_date on public.creator_knowledge;
create trigger creator_knowledge_video_date before insert or update of source_url on public.creator_knowledge
  for each row execute function public.creator_knowledge_stamp_video_date();

update public.creator_knowledge set video_posted_at = public.video_posted_at_from_url(source_url)
 where video_posted_at is null and source_url is not null;

-- A CHANGE OF MIND IS A CANDIDATE UNTIL SHE CONFIRMS IT.
create table if not exists public.creator_shifts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  voice_id uuid references public.brand_voices(id) on delete set null,
  earlier_id uuid references public.creator_knowledge(id) on delete cascade,
  later_id uuid references public.creator_knowledge(id) on delete cascade,
  earlier_text text not null, later_text text not null,
  earlier_at timestamptz not null, later_at timestamptz not null,
  summary text not null check (length(summary) between 4 and 240),
  status text not null default 'found' check (status in ('found', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz, filed_at timestamptz,
  unique (earlier_id, later_id),
  check (later_at >= earlier_at + interval '60 days')
);
alter table public.creator_shifts enable row level security;
drop policy if exists creator_shifts_owner_read on public.creator_shifts;
create policy creator_shifts_owner_read on public.creator_shifts for select using (owner_id = auth.uid());

create table if not exists public.shift_searches (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  searched_at timestamptz not null default now()
);
alter table public.shift_searches enable row level security;

create or replace function public.decide_shift(p_id uuid, p_is_real boolean)
returns boolean language sql security definer set search_path = public as $$
  with u as (
    update public.creator_shifts
       set status = case when p_is_real then 'confirmed' else 'rejected' end, decided_at = now()
     where id = p_id and owner_id = auth.uid() and status = 'found'
    returning 1)
  select exists(select 1 from u);
$$;
revoke all on function public.decide_shift(uuid, boolean) from public, anon;
grant execute on function public.decide_shift(uuid, boolean) to authenticated;

-- One creator at a time: at least two dated opinions 60+ days apart, not
-- searched in the last 30 days.
create or replace function public.shifts_due(p_limit integer default 1)
returns table (owner_id uuid)
language sql stable security definer set search_path = public as $$
  select k.owner_id
  from public.creator_knowledge k
  left join public.shift_searches s on s.owner_id = k.owner_id
  where k.kind = 'opinion' and k.source = 'transcript' and k.video_posted_at is not null
    and (s.owner_id is null or s.searched_at < now() - interval '30 days')
  group by k.owner_id, s.searched_at
  having max(k.video_posted_at) - min(k.video_posted_at) >= interval '60 days'
  order by s.searched_at nulls first
  limit greatest(1, least(p_limit, 5));
$$;
revoke all on function public.shifts_due(integer) from public, anon, authenticated;
grant execute on function public.shifts_due(integer) to service_role;
