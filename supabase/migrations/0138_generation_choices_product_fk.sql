-- THE FOREIGN KEY 0137 COULD NOT DECLARE.
--
-- ⚠️ SPLIT OUT SO THE TABLE ITSELF CAN BE EXERCISED. `product_entities` does not
-- exist on staging: 0120 creates it and is excluded there, because its own FK
-- target `brand_voices` is a fixture applied AFTER the migration loop. A
-- reference to it inside 0137 made that migration fail on staging and took the
-- whole table with it — so the insert path had no automated exercise anywhere,
-- which is exactly the uncollected cost the coverage guard was written about.
--
-- ⚖️ PRODUCTION KEEPS THE INTEGRITY. Splitting is not weakening: the constraint
-- is identical, it simply arrives in a file staging is allowed to skip. 0120's
-- exclusion states the principle this follows — weakening a production FK to
-- suit the staging ordering would be the tail wagging the dog.
--
-- ⚠️ MANUAL APPLY: the constraint is ALREADY PRESENT in production, because the
-- table was applied there by hand on 2026-08-17 with the reference inline. The
-- guard below makes this file a no-op against that state rather than an error,
-- and a real migration anywhere the table was created without it.
do $$
begin
  if to_regclass('public.product_entities') is null then
    raise notice 'product_entities absent — skipping the FK, as staging does';
    return;
  end if;
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.generation_choices'::regclass
       and conname = 'generation_choices_selected_product_id_fkey'
  ) then
    raise notice 'FK already present — nothing to do';
    return;
  end if;
  alter table public.generation_choices
    add constraint generation_choices_selected_product_id_fkey
    foreign key (selected_product_id)
    references public.product_entities(id) on delete set null;
end $$;
