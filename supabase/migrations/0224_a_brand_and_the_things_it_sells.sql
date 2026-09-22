-- A BRAND, AND THE THINGS IT SELLS.
--
-- ⚠️ REPORTED 2026-09-22: "there's a brand and then there's products." The
-- Product Library was one flat list, so a creator's business and the items it
-- sells sat side by side as equals, and the only way to describe the business
-- was a `BUSINESS` product type that — in the owner's words — "doesn't actually
-- change anything". Worse, the business's facts had nowhere to live: a product
-- linked to the shop's homepage absorbed the brand's story as if it were the
-- product's own description (measured on a real row the same day; see
-- `factPlacement.ts`).
--
-- ⚖️ A PARENT, NOT A TYPE. A brand is a separate row that products may point
-- at. Products that belong to nobody's brand — an affiliate item, a sponsor's
-- product — simply leave `brand_id` null; the owner was explicit that those
-- must never require creating a brand.
--
-- ⚠️⚠️ CONFIRMED IS A COLUMN BECAUSE A GUESS IS NOT AN ANSWER. The owner, on
-- every pre-fill so far: "every time you pre-fill something, it's not the right
-- one." A brand Twin suggests is stored with `confirmed = false` and scripts do
-- not read it until the creator presses "Yes, that's right" or edits it. The
-- writer filters on this column, so a wrong suggestion cannot reach a video.

create table if not exists public.brands (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  website     text,
  description text,
  confirmed   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists brands_owner_idx on public.brands (owner_id);

alter table public.product_entities
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists product_entities_brand_idx on public.product_entities (brand_id);

alter table public.brands enable row level security;

-- The creator owns their brands outright, exactly as they own their library.
drop policy if exists "own brands read" on public.brands;
create policy "own brands read"
  on public.brands for select using (auth.uid() = owner_id);
drop policy if exists "own brands insert" on public.brands;
create policy "own brands insert"
  on public.brands for insert with check (auth.uid() = owner_id);
drop policy if exists "own brands update" on public.brands;
create policy "own brands update"
  on public.brands for update
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "own brands delete" on public.brands;
create policy "own brands delete"
  on public.brands for delete using (auth.uid() = owner_id);

grant select, insert, update, delete on public.brands to authenticated;
grant update (brand_id) on public.product_entities to authenticated;
