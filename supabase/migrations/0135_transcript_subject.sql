-- WHOSE VOICE IS THIS? — the question `transcripts` could not answer.
--
-- ⚠️ THIS COLUMN EXISTS BECAUSE OF WHAT WAS ABOUT TO BE BUILT ON TOP OF IT. The
-- writer prompt carries a block labelled "HOW THEY ACTUALLY WRITE (verbatim
-- samples — match this EXACT cadence... weight this above every other signal)".
-- It reads `voice_samples`, a field a creator fills by hand in Settings, and
-- production has 0 of 38 profiles and 0 of 37 voices with anything in it. The
-- strongest declared signal in the entire prompt has never once been populated.
--
-- ⚖️ THE OBVIOUS FIX WAS TO FILL IT FROM `transcripts`, AND IT WOULD HAVE BEEN A
-- DISASTER. Measured first: of 58 transcripts, 50 have a `source_url` that
-- matches a `generations.reference_url` — they are OTHER PEOPLE'S VIDEOS, pasted
-- as references. Compiling those into a creator's voice block would have told the
-- writer that a stranger's cadence was this creator's own, under a label
-- instructing it to weight that above everything else. Reference leak, promoted
-- from a line in a script to the creator's identity.
--
-- ⚠️ AND THE PROVENANCE EXISTED AT INSERT TIME AND WAS THROWN AWAY. `transcribe.ts`
-- handles two job types: `ingest` is a reference being analysed, `transcribe` is
-- one of the creator's own posts selected by the DNA scan. Both write the same
-- row shape. One line later, nothing can tell them apart — the same shape as the
-- script path before 0129 and the director path before 0132.
alter table public.transcripts
  add column if not exists subject text;

alter table public.transcripts
  drop constraint if exists transcripts_subject_known;
alter table public.transcripts
  add constraint transcripts_subject_known
  check (subject is null or subject in ('own', 'reference'));

-- ⚖️ BACKFILL ONLY THE DECIDABLE DIRECTION. A transcript whose URL is some
-- generation's reference URL is a reference — that is a fact, not an inference.
-- The remaining 8 rows are NOT thereby the creator's own: they may be references
-- for generations that were deleted, or ingests that never produced a script.
-- They stay NULL, and NULL means "we did not record it", never "own".
--
-- ⚠️ THIS IS THE WHOLE REASON THE COLUMN IS NULLABLE. A default of 'own' would
-- hand the voice compiler 8 rows of unknown provenance and a straight face.
update public.transcripts t
   set subject = 'reference'
 where t.subject is null
   and exists (
     select 1 from public.generations g
      where g.reference_url is not null
        and g.reference_url = t.source_url
   );

create index if not exists transcripts_owner_subject
  on public.transcripts (owner_id, subject)
  where subject = 'own';

comment on column public.transcripts.subject is
  'Whose video this is: ''own'' = one of the creator''s own posts, selected by the '
  'DNA scan (job type `transcribe`); ''reference'' = a video pasted as inspiration '
  '(job type `ingest`). NULL means the row predates 0135 and could not be resolved '
  'by URL — never "own". Only ''own'' may be read as evidence of a creator''s voice.';
