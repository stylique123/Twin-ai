-- A BUCKET WITH NO LIMITS ACCEPTS ANYTHING THE KEY REACHES.
--
-- ⚠️ 0160 CREATED reference-frames WITH NEITHER A SIZE LIMIT NOR A MIME LIST,
-- out of step with every other bucket here. It holds frames of thousands of
-- OTHER creators' videos -- the corpus most worth fencing, given the least.
--
-- ⚠️ AND WRITING THE GUARD FOUND A SECOND, OLDER GAP. Production's `takes`
-- bucket carries allowed_mime_types today, but NO MIGRATION EVER SET IT: 0013
-- and 0055 set the list for `edits` only, and 0069 raised the size for both.
-- The same is true of image/webp on `edits`. Those values were applied
-- out-of-band, so they exist in production and NOWHERE in the ledger -- and a
-- database rebuilt from these migrations would come up with `takes` accepting
-- any file type at all, which is where creators' raw recordings land.
--
-- ⚖️ SO THIS MIGRATION WRITES DOWN WHAT PRODUCTION ALREADY HAS. Every value
-- below was read off production first, which makes applying it a no-op there
-- and makes a rebuild correct for the first time. It is not a change of policy;
-- it is the ledger catching up with a policy that was only ever a fact.

-- The two formats sampleFrames can emit, and nothing else. 2 MB is ~25x what a
-- frame actually weighs: FRAME_MAX_EDGE caps the long edge at 512px, so a frame
-- lands in the tens of kilobytes. The ceiling is not a budget, it is the point
-- past which something has gone wrong.
update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/jpeg', 'image/png']
 where id = 'reference-frames';

-- ⚠️ AND IT MUST STILL BE PRIVATE. A public bucket would make storage_path a
-- published index of the corpus -- the property 0160 asserted, which editing the
-- same row must not quietly undo.
update storage.buckets set public = false where id = 'reference-frames';

-- ⚠️ VERBATIM FROM PRODUCTION, not a tidied version of it. Narrowing this list
-- while calling it a reconciliation would break uploads that work today, and the
-- breakage would arrive dressed as bookkeeping.
update storage.buckets
   set allowed_mime_types = array['video/webm', 'video/mp4', 'video/quicktime']
 where id = 'takes';

update storage.buckets
   set allowed_mime_types = array[
     'video/webm', 'video/mp4', 'video/quicktime',
     'image/jpeg', 'image/png', 'image/webp', 'application/json']
 where id = 'edits';
