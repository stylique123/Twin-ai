-- Third hardening batch from the launch gap-audit (abuse surface + data integrity).

-- [MED abuse] Unmoderated public gallery inserts. The original gallery design
-- (0008) let any authenticated user insert a row with visibility='public', which
-- every other user then sees in the discovery feed — a spam / malicious-URL /
-- NSFW vector with no moderation behind it. In practice the live public feed is
-- populated only by the discovery scraper (service role, bypasses RLS), and there
-- is no client UI that submits public items. Lock the client path to PRIVATE saves
-- only; public items can come exclusively from the trusted scraper. (Defense in
-- depth — even a direct anon-key insert can no longer seed public spam.)
do $$ begin
  if exists (select 1 from pg_policies where tablename='gallery_items' and policyname='gallery own insert') then
    drop policy "gallery own insert" on public.gallery_items;
  end if;
  create policy "gallery own insert" on public.gallery_items for insert to authenticated
    with check (owner_id = auth.uid() and visibility = 'private');
end $$;

-- Likewise stop a user from flipping their own private item to public via update
-- (the public feed must stay scraper-curated until there's a moderation flow).
do $$ begin
  if exists (select 1 from pg_policies where tablename='gallery_items' and policyname='gallery own update') then
    drop policy "gallery own update" on public.gallery_items;
  end if;
  create policy "gallery own update" on public.gallery_items for update to authenticated
    using (owner_id = auth.uid()) with check (owner_id = auth.uid() and visibility = 'private');
end $$;

-- [LOW integrity] One default brand voice per owner is currently enforced only by
-- a BEFORE trigger (0002). Add the hard DB guarantee with a partial unique index.
-- First demote any pre-existing duplicates (keep the most recently updated) so the
-- index can be created safely on live data.
with ranked as (
  select id, row_number() over (partition by owner_id order by updated_at desc, created_at desc) as rn
  from public.brand_voices where is_default
)
update public.brand_voices b set is_default = false
from ranked r where b.id = r.id and r.rn > 1;

create unique index if not exists brand_voices_one_default_per_owner
  on public.brand_voices (owner_id) where is_default;
