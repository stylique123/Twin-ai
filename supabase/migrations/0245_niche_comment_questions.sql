-- QUESTIONS FROM ACROSS HER NICHE (24-ideas #11). The worker reads public
-- comments on YouTube library videos (official API, free key, only when
-- YOUTUBE_API_KEY is set) for QUESTIONS only and files them as shared niche
-- objection notes. One row per video read, so nothing is read twice.
create table if not exists public.niche_comment_reads (
  gallery_item_id uuid primary key references public.gallery_items(id) on delete cascade,
  read_at timestamptz not null default now(),
  questions integer not null default 0,
  failure text
);
alter table public.niche_comment_reads enable row level security;

create or replace function public.niche_comment_due(p_limit integer default 1)
returns table (gallery_item_id uuid, url text, bucket text, sub_niche text, views bigint)
language sql stable security definer set search_path = public as $$
  select g.id, g.url, r.bucket, r.sub_niche, r.views::bigint
  from public.corpus_reads r
  join public.gallery_items g on g.id = r.gallery_item_id
  left join public.niche_comment_reads n on n.gallery_item_id = g.id
  where r.status = 'read' and g.platform = 'youtube' and n.gallery_item_id is null
  order by r.views desc nulls last
  limit greatest(1, least(p_limit, 10));
$$;
revoke all on function public.niche_comment_due(integer) from public, anon, authenticated;
grant execute on function public.niche_comment_due(integer) to service_role;
