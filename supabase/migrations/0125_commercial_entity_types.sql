-- WIDEN WHAT A COMMERCIAL ENTITY CAN BE, WHILE THE TABLE IS STILL EMPTY.
--
-- ⚖️ THE TIMING IS THE ARGUMENT. `product_entities` holds ZERO rows today, so
-- renaming a value costs one `alter constraint` and nothing else. The moment a
-- creator registers a product it becomes a data migration with a backfill, a
-- window where the CHECK and the code disagree, and a rollback that has to
-- un-rename rows. The vocabulary is never cheaper to fix than right now.
--
-- ⚠️ `PHYSICAL` → `PHYSICAL_PRODUCT` AND `DIGITAL` → `DIGITAL_PRODUCT` because a
-- bare adjective reads as a property of the entity rather than as its kind, and
-- the spec's list is explicit. `SAAS` and `SERVICE` are already nouns and stay.
--
-- The five new kinds are things creators actually sell that had nowhere to go:
-- a COURSE is not SaaS, a COMMUNITY is not a service, an APP is distinct from
-- SAAS for what can be shown on camera (a phone screen versus a dashboard), and
-- MARKETPLACE covers reselling. OTHER exists so the enum never forces a
-- misclassification — a wrong kind is worse than an unspecific one, because
-- `inferShowability` reads it to decide what the Director may ask for.
--
-- ⚠️ NO BACKFILL STATEMENT IS INCLUDED, ON PURPOSE. There is nothing to
-- backfill, and an `update … set type = …` here would be a silent no-op that
-- future readers would mistake for evidence that rows were migrated. If this
-- ever runs against a database that DOES hold rows, it fails loudly on the
-- constraint instead — which is the correct outcome, not an inconvenience.

alter table public.product_entities
  drop constraint if exists product_entities_type_known;

alter table public.product_entities
  add constraint product_entities_type_known
  check (type in (
    'SAAS',
    'APP',
    'PHYSICAL_PRODUCT',
    'DIGITAL_PRODUCT',
    'SERVICE',
    'COURSE',
    'COMMUNITY',
    'MARKETPLACE',
    'OTHER'
  ));

comment on column public.product_entities.type is
  'What the thing IS — separate from `relationship`, which is what the creator '
  'may say about their tie to it. Read by inferShowability to decide whether a '
  'scene may depend on it being visible, so a wrong kind is worse than OTHER.';
