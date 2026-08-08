-- 0112 — A POST'S RENDER BINDING MUST BE ITS OWN.
--
-- 0098 added `posts.edit_project_id` and `posts.output_asset_id` and observed,
-- correctly at the time, that "no new policy is needed" — they were internal ids
-- that only the server ever wrote, visible only to the owner of the row.
--
-- That changed the moment `schedulePost` started writing them. `posts` is
-- owner-scoped by `owner_id = auth.uid()` (0007) and by nothing else, so a
-- client can now insert a post it owns while naming ANOTHER USER'S edit project
-- in the binding. The publish path signs the bound project's output. The result
-- is a cross-tenant read of somebody else's finished video, delivered to the
-- attacker's own connected account, using only the ordinary insert a calendar
-- performs.
--
-- The foreign keys do not help: they prove the ids EXIST, which was never the
-- question. Ownership is not expressible as a foreign key, so it is expressed
-- here.
--
-- ── THE RULE, AND WHY IT IS THIS RULE ─────────────────────────────────────
--
-- A binding is valid when the edit project belongs to the SAME GENERATION the
-- post is about, and the asset is the one that project actually produced.
--
-- Checking generation membership rather than checking `owner_id` directly is
-- deliberate and is the stronger of the two. `edit_projects` is reached through
-- its generation, so a project of the post's own generation is by construction
-- reachable by whoever may read that generation — including a workspace
-- collaborator, who legitimately may (0049 widened the read policy to the
-- workspace and an owner-id equality test here would break them). And it rules
-- out a second, quieter defect that an ownership test would allow through: a
-- post about generation A bound to a render of generation B, both mine. That is
-- not a security hole, it is a lie in the analytics join 0098 exists to enable.
--
-- ── NULL REMAINS "WE DID NOT RECORD WHICH" ────────────────────────────────
--
-- Both columns null passes untouched. Every post that predates the binding is
-- in that state, they are real posts, and a constraint that invalidated them
-- would take a working calendar down to enforce a rule about new rows.
--
-- Half a binding does NOT pass. A project without its asset cannot say which
-- file, and an asset without its project cannot be signed — either one is a
-- record that looks like provenance and is not.
--
-- ── A TRIGGER, NOT A CHECK ────────────────────────────────────────────────
--
-- The rule reads another table. A CHECK constraint may not, and a subquery
-- smuggled in through a function would be evaluated at times Postgres does not
-- promise (it is explicitly documented as unsupported, because a CHECK is
-- assumed to depend only on the row). A BEFORE trigger is the supported way to
-- express a cross-row invariant, and it fires on exactly the writes that matter.

create or replace function public.posts_binding_coherent()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_asset uuid;
  v_gen   uuid;
begin
  -- Unbound is a state, not an omission. See the header.
  if new.edit_project_id is null and new.output_asset_id is null then
    return new;
  end if;

  if new.edit_project_id is null or new.output_asset_id is null then
    -- AN FK CASCADE IS NOT A CALLER, and must not be refused.
    --
    -- Both columns are `on delete set null` (0098, for a good reason: deleting a
    -- project must not delete the record that a post happened). That cascade
    -- arrives here as an UPDATE nulling ONE side, which is a half binding — and
    -- a version of this trigger that simply raised would have made the
    -- constraint reach backwards and forbid deleting an edit project or a media
    -- asset at all, with an error message about posts.
    --
    -- So on UPDATE, half a binding COLLAPSES TO UNBOUND rather than failing. The
    -- surviving id would be provenance we can no longer resolve, and dropping it
    -- says the true thing: we no longer know which render this was.
    if tg_op = 'UPDATE' then
      new.edit_project_id := null;
      new.output_asset_id := null;
      return new;
    end if;
    raise exception
      'posts binding: name both the render and the file it produced, or neither (project=%, asset=%)',
      new.edit_project_id, new.output_asset_id
      using errcode = 'check_violation';
  end if;

  select ep.output_asset_id, ep.generation_id
    into v_asset, v_gen
    from public.edit_projects ep
   where ep.id = new.edit_project_id;

  if not found then
    raise exception 'posts binding: no such edit project %', new.edit_project_id
      using errcode = 'foreign_key_violation';
  end if;

  -- THE CROSS-TENANT CASE. A project belonging to a generation this post is not
  -- about is not this post's render, whoever owns it.
  if v_gen is distinct from new.generation_id then
    raise exception
      'posts binding: edit project % belongs to generation %, not to this post''s generation %',
      new.edit_project_id, v_gen, new.generation_id
      using errcode = 'check_violation';
  end if;

  -- And the asset must be the one that project produced, so the row cannot name
  -- a real project alongside a file that project never made.
  if v_asset is distinct from new.output_asset_id then
    raise exception
      'posts binding: edit project % produced asset %, not %',
      new.edit_project_id, v_asset, new.output_asset_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists posts_binding_coherent_trg on public.posts;
create trigger posts_binding_coherent_trg
  before insert or update of edit_project_id, output_asset_id, generation_id
  on public.posts
  for each row execute function public.posts_binding_coherent();

comment on function public.posts_binding_coherent() is
  'A post may only be bound to a render of its own generation, and to the asset '
  'that render produced. Both columns null is unbound and allowed; half a '
  'binding is not. Added by 0112 when schedulePost made these columns '
  'client-writable for the first time.';
