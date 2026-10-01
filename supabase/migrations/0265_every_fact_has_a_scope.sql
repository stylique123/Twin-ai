-- ⚠️ OWNER 2026-10-01: "scope every existing fact that can be confidently tied to
-- one product or one brand; mark the rest account-general explicitly; nothing
-- left blank and falling back to name-matching." 0260 tagged 2 of 2,363 rows.
--
-- fact_scope: 'product' (product_entity_id set), 'brand' (brand_id set) or
-- 'account' (about her, her craft, her business as a whole). One function
-- decides it, for the backfill AND for every new row (trigger), so a fact can
-- never arrive unscoped again.
--
-- ⚖️ CONFIDENT MEANS UNAMBIGUOUS. A fact is a product's only when it names that
-- product (its full name, or TWO words of its name that no other product of hers
-- uses and that are not common in her own facts — "signature blend" yes, one
-- word no: "food review" is not the dog food)
-- and names no other product. Two products named → account (it is a comparison,
-- not one product's fact). Her brand's name and no product → brand.
alter table public.creator_knowledge add column if not exists fact_scope text
  check (fact_scope is null or fact_scope in ('product', 'brand', 'account'));
alter table public.creator_knowledge add column if not exists brand_id uuid references public.brands(id) on delete set null;

create or replace function public.scope_fact(p_owner uuid, p_text text, p_evidence text default null)
returns table (scope text, product_id uuid, brand_id uuid)
language plpgsql stable security definer set search_path = public as $fn$
#variable_conflict use_column
declare
  t text := ' ' || regexp_replace(lower(coalesce(p_text, '') || ' ' || coalesce(p_evidence, '')), '[^a-z0-9]+', ' ', 'g') || ' ';
  hits uuid[] := '{}';
  p record;
  b record;
  w text;
  total int;
  n int;
  nm text;
begin
  select count(*) into total from public.creator_knowledge where owner_id = p_owner;
  for p in select e.id, lower(coalesce(e.name, '')) as name from public.product_entities e
           where e.owner_id = p_owner and e.archived_at is null and length(btrim(coalesce(e.name, ''))) >= 3 loop
    nm := btrim(regexp_replace(p.name, '[^a-z0-9]+', ' ', 'g'));
    if position(' ' || nm || ' ' in t) > 0 or position(' ' || nm || 's ' in t) > 0 then
      hits := hits || p.id; continue;
    end if;
    n := 0;
    foreach w in array regexp_split_to_array(regexp_replace(p.name, '[^a-z0-9]+', ' ', 'g'), ' ') loop
      continue when length(w) < 4 or w = any (array['product','products','handmade','ceramic','small','large','custom','original','classic','premium','beans','coffee','candle','candles','bowl','mug','kit','pack','set','band','support','coaching','pattern']);
      -- the word must belong to this product alone…
      continue when exists (select 1 from public.product_entities o where o.owner_id = p_owner and o.archived_at is null and o.id <> p.id
                              and (' ' || regexp_replace(lower(coalesce(o.name, '')), '[^a-z0-9]+', ' ', 'g') || ' ') like '% ' || w || ' %');
      -- …and not be an everyday word in her own facts (≤ 15% of them).
      continue when total >= 20 and (select count(*) from public.creator_knowledge k where k.owner_id = p_owner
                                       and (' ' || regexp_replace(lower(k.text), '[^a-z0-9]+', ' ', 'g') || ' ') like '% ' || w || ' %') > total * 0.15;
      if position(' ' || w || ' ' in t) > 0 or position(' ' || w || 's ' in t) > 0 then n := n + 1; end if;
    end loop;
    -- One shared word is a coincidence ("food review" is not the dog food);
    -- two distinctive words of its name are the product.
    if n >= 2 then hits := hits || p.id; end if;
  end loop;
  if cardinality(hits) = 1 then
    return query select 'product'::text, hits[1], (select e.brand_id from public.product_entities e where e.id = hits[1]); return;
  end if;
  if cardinality(hits) = 0 then
    for b in select r.id, lower(r.name) as name from public.brands r where r.owner_id = p_owner and length(btrim(coalesce(r.name, ''))) >= 3 loop
      if position(' ' || regexp_replace(b.name, '[^a-z0-9]+', ' ', 'g') || ' ' in t) > 0 then
        return query select 'brand'::text, null::uuid, b.id; return;
      end if;
    end loop;
  end if;
  return query select 'account'::text, null::uuid, null::uuid;
end $fn$;
revoke all on function public.scope_fact(uuid, text, text) from public, anon, authenticated;

-- Every new row is scoped on the way in. A row that arrives with a product id
-- (an objective answer, a confirmed comment) keeps it.
create or replace function public.creator_knowledge_scope() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare s record;
begin
  if new.product_entity_id is not null then
    new.fact_scope := 'product';
    if new.brand_id is null then select e.brand_id into new.brand_id from public.product_entities e where e.id = new.product_entity_id; end if;
  elsif new.fact_scope is null then
    select * into s from public.scope_fact(new.owner_id, new.text, new.evidence);
    new.fact_scope := s.scope; new.product_entity_id := s.product_id; new.brand_id := s.brand_id;
  end if;
  return new;
end $fn$;
drop trigger if exists creator_knowledge_scope on public.creator_knowledge;
create trigger creator_knowledge_scope before insert on public.creator_knowledge
  for each row execute function public.creator_knowledge_scope();

-- Backfill: every existing row.
update public.creator_knowledge k set fact_scope = 'product',
       brand_id = coalesce(k.brand_id, (select e.brand_id from public.product_entities e where e.id = k.product_entity_id))
 where k.product_entity_id is not null and k.fact_scope is null;
update public.creator_knowledge k set fact_scope = s.scope, product_entity_id = s.product_id, brand_id = s.brand_id
  from lateral public.scope_fact(k.owner_id, k.text, k.evidence) s
 where k.fact_scope is null;

-- The writer reads this view; it must carry the scope (columns appended, same filter).
create or replace view public.creator_knowledge_writable with (security_invoker = true) as
  select id, owner_id, voice_id, kind, text, basis, confidence, times_seen, source_ref, source_url,
         last_observed_at, source_expiry, created_at, updated_at, source, surface_forms, cost, consensus,
         extractor_version, last_used_at, used_count, evidence, question_id, creator_confirmed_at,
         video_posted_at, sensitive, creator_excluded_at, product_entity_id, fact_scope, brand_id
  from public.creator_knowledge
  where not sensitive and creator_excluded_at is null;
