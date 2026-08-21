-- THE FRAME THAT PRODUCED A CLAIM MUST OUTLIVE THE CALL THAT MADE IT.
--
-- ⚠️ TODAY IT DOES NOT. runVisualPass samples frames into a temp directory,
-- sends them to the model, and deletes the directory in its `finally`. The
-- visual profile that comes back cites `frame 2`, and frame 2 no longer exists
-- anywhere. A claim whose evidence has been deleted cannot be checked by a
-- human, which makes every visual field an assertion rather than a finding.
--
-- ⚖️ AND RE-SAMPLING IS NOT A SUBSTITUTE. Recovering frame 2 later means a
-- second download of the same video: it costs again, it can fail on an IP block
-- that did not exist at sample time, and a re-sample that lands one frame
-- earlier is no longer the evidence the model saw. Evidence you have to
-- re-acquire is not evidence, it is a re-enactment.
--
-- ⚠️ THE CORPUS IS NOT A PRODUCT SURFACE. These are frames of thousands of
-- OTHER creators' videos, exactly like reference_transcripts. No client role is
-- granted anything here and the bucket is private: a read grant would publish
-- the corpus to every signed-in account in exchange for no feature. The
-- labelling packet reads them through short-lived signed URLs minted for one
-- session, never through a standing grant.

create table if not exists public.reference_frames (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  -- ⚠️ THE NUMBER THE MODEL WAS TOLD TO CITE. `frame 2` in a visual claim means
  -- frame_index 2 here. One-based on purpose: renumbering it zero-based would
  -- silently re-point every citation already written.
  frame_index int not null check (frame_index >= 1),
  -- Where in the clip it came from. A sample that clusters is a sample whose
  -- temporal claims are weaker than their citations suggest, and that is only
  -- visible if each frame says when it was.
  at_seconds numeric(10, 3) not null check (at_seconds >= 0),
  -- ⚖️ WHICH SCHEDULE PRODUCED IT, carried per frame rather than per reference
  -- so a row is self-describing. The pilot compares content_beats against
  -- uniform, and a frame that cannot say which arm it belongs to is not in
  -- either.
  schedule_basis text not null check (schedule_basis in ('content_beats', 'uniform')),
  storage_path text not null,
  bytes int not null check (bytes > 0),
  -- The same bytes the model was shown, provable later. A frame silently
  -- replaced by a re-run would otherwise be indistinguishable from the original.
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  sampled_at timestamptz not null default now(),
  -- ⚠️ ONE FRAME PER INDEX PER REFERENCE, and re-sampling REPLACES rather than
  -- accumulating: two rows claiming to be frame 2 would make every citation
  -- ambiguous, which is the exact failure this table exists to end.
  constraint reference_frames_one_per_index unique (url, frame_index)
);

create index if not exists reference_frames_url_idx on public.reference_frames (url);

alter table public.reference_frames enable row level security;

-- ⚠️ NO POLICIES AND NO GRANTS, DELIBERATELY. RLS on with zero policies means
-- anon and authenticated can read nothing at all; only the service role reaches
-- it. Same posture as reference_transcripts (0153), and for the same reason.
revoke all on public.reference_frames from anon, authenticated;

-- The private bucket the paths above point into. Private is the whole point:
-- a public bucket would make the storage_path column a published index of
-- other creators' video frames.
insert into storage.buckets (id, name, public)
values ('reference-frames', 'reference-frames', false)
on conflict (id) do nothing;
