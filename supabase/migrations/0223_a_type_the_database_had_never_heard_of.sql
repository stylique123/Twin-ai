-- A TYPE THE APPLICATION OFFERED AND THE DATABASE HAD NEVER HEARD OF.
--
-- ⚠️ #967 ADDED `BUSINESS` TO `ENTITY_TYPES` AND NOT TO THIS CONSTRAINT. The
-- picker offered "My whole business, not one product", `attestedEntity` built
-- the row, `claimProductEntity` sent it — and `product_entities_type_known`
-- would have rejected it. A creator picking the one option added for her would
-- have been told her product could not be saved, with a Postgres constraint
-- name behind it. The feature was merged, deployed, and dead on first use.
--
-- ⚠️⚠️ AND NO TEST COULD SEE IT, WHICH IS THE PART WORTH RECORDING. Every test
-- of the new type passed: the enum has it, the picker offers it, the capability
-- question fires, the scene guidance is right. They all mock `supabase`, so the
-- one authority that would have refused was the one authority never consulted.
-- Found by reading `pg_constraint` on production, after the merge — which is
-- the only reason this is a migration and not an incident.
--
-- ⚖️ THE REAL DEFECT IS THAT TWO LISTS EXIST AND NOTHING TIED THEM. This
-- migration fixes today's drift; `check_enum_constraint_parity` fixes the class,
-- by failing CI whenever `ENTITY_TYPES` and this constraint disagree. The
-- migration without the gate would just wait for the next member.

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
    -- The thing the others belong to. See ENTITY_TYPES in
    -- packages/shared/src/productEntity.ts, which this must match exactly.
    'BUSINESS',
    'OTHER'
  ));
