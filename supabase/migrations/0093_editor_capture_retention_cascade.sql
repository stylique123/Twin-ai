-- Editor v2 — Phase 7 exit correction, follow-up: the LAST referential action
-- the capture guard still blocks.
--
-- Found by the Phase-2 staging matrix (G6 "retention cascade"), which is the
-- first thing in this project to run these tables against a real parent row.
--
-- History of this guard:
--   * 0090 created `editor_capture_no_mutate` refusing every UPDATE and DELETE.
--   * 0091 §1b already forward-corrected the DELETE half: a direct DELETE
--     (pg_trigger_depth() = 1) is refused, a parent cascade (depth > 1) is
--     permitted, so retention leaves no orphan rows. That fix is correct and
--     stays exactly as it is.
--
-- What 0091 did NOT cover: `source_capture_intents.generation_id` is declared
-- `references generations(id) ON DELETE SET NULL`. Postgres implements SET NULL
-- as an **UPDATE** on the child row — and the guard refuses every UPDATE
-- unconditionally, at any trigger depth. So deleting a generation raised
-- `capture_row_immutable` and rolled the whole transaction back.
--
-- Net effect had this reached production: deleting a generation would fail
-- permanently for any source carrying a capture intent — i.e. every teleprompter
-- recording. Retention sweeps and "delete this recording" would both break, and
-- data a user asked to be rid of would be undeletable. (Account erasure was NOT
-- affected: auth.users is ON DELETE CASCADE, which 0091 already permits.)
--
-- Why the gates missed it: Gate-D's schema subset declares `generation_id uuid`
-- with no foreign key at all, so the SET NULL action never fires there. The
-- harness is corrected in the same commit to carry the real FK and assert both
-- referential paths, so this class cannot hide again.
--
-- The exemption stays as narrow as the fact requires:
--   * depth 1 (a statement someone issued directly) — refused for UPDATE and
--     DELETE alike, service_role included. Unchanged; this is the property the
--     guard exists for.
--   * depth > 1 (running inside another trigger, which for these tables means a
--     parent's FK action) — DELETE permitted, as 0091 established. UPDATE
--     permitted ONLY when the row differs solely by generation_id having become
--     NULL: the exact shape of ON DELETE SET NULL. An in-cascade UPDATE touching
--     any other column is still refused.
--
-- Idempotent (create or replace); no schema change; no data change.

create or replace function public.editor_capture_no_mutate()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  o jsonb;
  n jsonb;
begin
  if pg_trigger_depth() > 1 then
    -- Parent cascade from media_assets / auth.users (0091's correction).
    if tg_op = 'DELETE' then
      return old;
    end if;
    o := to_jsonb(old);
    n := to_jsonb(new);
    -- generations ON DELETE SET NULL, and ONLY that: the FK column must be
    -- going to NULL and every other column must be byte-identical.
    if tg_op = 'UPDATE'
       and n ? 'generation_id'
       and n->>'generation_id' is null
       and o - 'generation_id' = n - 'generation_id'
    then
      return new;
    end if;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'capture_row_immutable: % direct deletes are not permitted (retention runs via the parent cascade)', tg_table_name
      using errcode = 'raise_exception';
  end if;
  raise exception 'capture_row_immutable: % is append-only', tg_table_name
    using errcode = 'raise_exception';
end;
$$;

comment on function public.editor_capture_no_mutate() is
  'Append-only guard for the capture tables (intents, manifests, script '
  'snapshots). Refuses every directly-issued UPDATE/DELETE, service_role '
  'included. Permits only a parent FK action: a cascade DELETE, or the '
  'generation_id SET NULL — so retention and erasure are never blocked by '
  'provenance rows.';
