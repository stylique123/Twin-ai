-- TwinAI Phase 6 — one-click Auto-editor.
--
-- Flow: the browser uploads a recorded take to the private `takes` bucket
-- (own-folder only), then enqueues an `autoedit` job. The worker (service role)
-- downloads the take, burns word-synced captions, normalizes to vertical 1080x1920
-- with loudness-corrected audio, and writes the finished MP4 to the private
-- `edits` bucket — returning a signed URL in the job result.
--
-- Buckets `takes` and `edits` are created out-of-band (Storage API). This
-- migration adds the RLS that makes direct browser upload + scoped enqueue safe.

-- ---- Storage: users touch only their OWN folder (prefix = their uid) --------
-- Path convention: <bucket>/<auth.uid()>/<file>
do $$ begin
  -- takes: owner can upload + read their own
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='twinai takes insert') then
    create policy "twinai takes insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'takes' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='twinai takes read') then
    create policy "twinai takes read" on storage.objects for select to authenticated
      using (bucket_id = 'takes' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  -- edits: owner can read their finished renders
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='twinai edits read') then
    create policy "twinai edits read" on storage.objects for select to authenticated
      using (bucket_id = 'edits' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

-- ---- Generations: remember the finished render (for the Library) -----------
alter table public.generations add column if not exists edit_path text;

-- ---- Jobs: let a user enqueue ONLY their own `autoedit` jobs ----------------
-- Every other job type stays server-only (created by edge functions via the
-- service role). This keeps the surface tight: no arbitrary job injection.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='jobs' and policyname='user enqueue autoedit') then
    create policy "user enqueue autoedit" on public.jobs for insert to authenticated
      with check (owner_id = auth.uid() and type = 'autoedit');
  end if;
end $$;
