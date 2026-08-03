-- 0098: which render did we actually post?
--
-- WHAT IS MISSING
--
-- `posts` links to a GENERATION (0007). One generation can have MANY
-- edit_projects: 0078 only forbids two ACTIVE projects per source, completed
-- ones accumulate, and re-rendering is the explicit product plan. So the link
-- from a posted video back to the edit it came from is one-to-MANY through a
-- shared parent — which is to say, it does not exist.
--
-- The consequence is not subtle. `posts.views` is filled "only by a real
-- analytics source" (0007), and when that source arrives every number it
-- delivers will attach to a generation that may have produced three different
-- videos with three different hooks, three different cut densities and three
-- different endings. You could not say WHICH render earned the views. Every
-- question worth asking about performance — did the tighter cut do better, did
-- opening on the second sentence help, is the punchy caption preset worth it —
-- needs exactly this join and cannot be answered without it.
--
-- WHY IT IS URGENT RATHER THAN MERELY USEFUL
--
-- This is the one gap in the performance-feedback design that CANNOT be
-- repaired later. A retention curve can be backfilled from a platform API. A
-- decision vector can be recomputed from a stored plan. But a video posted
-- before this column exists has no recoverable link to its render: the
-- generation is all that was written down, and the extra edit_projects that
-- might explain it are indistinguishable after the fact. Every day without it
-- is a day of permanently unattributable history.
--
-- WHAT THIS ADDS
--
-- Two nullable pointers and one partial index. Nullable because every existing
-- row genuinely does not know its render — writing a guess here would be worse
-- than the gap, since a wrong attribution is indistinguishable from a right one
-- and poisons exactly the analysis this exists to enable.
--
--   * edit_project_id — the render. THE join key.
--   * output_asset_id — the exact file, so a re-render of the same project is
--     still distinguishable from the version that was actually posted.
--
-- `on delete set null` on both: deleting a project must not delete the record
-- that a post happened. The post is a fact about the world; the project is our
-- working. Losing the link is a smaller harm than losing the row.
--
-- NO NEW POLICY IS NEEDED. `posts` is owner-scoped (0007) and these columns are
-- not sensitive — they are internal ids, already only visible to the owner of
-- the row. The client cannot see another user's post at all, so it cannot see
-- these either.

alter table public.posts
  add column if not exists edit_project_id uuid references public.edit_projects(id) on delete set null,
  add column if not exists output_asset_id uuid references public.media_assets(id) on delete set null;

comment on column public.posts.edit_project_id is
  'The render this post was made from. THE join key between a posted video and the decisions that shaped it. Null on rows created before 0098, and on posts whose file did not come from an edit_project — never guessed.';
comment on column public.posts.output_asset_id is
  'The exact output file posted, so a later re-render of the same project stays distinguishable from the version that actually went out.';

-- Partial: the analysis queries all filter to rows that HAVE a render, and for
-- a long while most rows will not.
create index if not exists posts_edit_project_idx
  on public.posts (edit_project_id) where edit_project_id is not null;
