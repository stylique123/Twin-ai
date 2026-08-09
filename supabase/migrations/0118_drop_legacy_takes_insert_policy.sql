-- CLOSE THE SECOND DOOR INTO THE `takes` BUCKET.
--
-- 0006 created `twinai takes insert`, which let ANY authenticated user PUT
-- bytes straight into `takes/<their-uid>/…`:
--
--   with check (bucket_id = 'takes' and (storage.foldername(name))[1] = auth.uid()::text)
--
-- Editor v2 routes every upload through a contract instead — `source-asset`
-- edge function → signed upload token → finalize RPC (which records
-- `finalized_etag`, `finalized_bytes` and the capture intent) → `validate_source`.
-- The policy above is that same bucket with none of it: no capture intent, no
-- finalize record, no etag to bind the bytes to.
--
-- WHY THAT IS A SECURITY PROBLEM AND NOT JUST DEAD WEIGHT. Every guard 0091
-- added assumes the contract path is the only way in:
--
--   * `bytes_changed_after_finalize` compares against an etag recorded AT
--     finalize. No finalize, nothing to compare, and the check passes vacuously.
--   * the capture-manifest requirement and the ready-flip guard both key off the
--     capture intent, which a direct PUT never creates.
--   * the source-provenance chain in 0090–0093 rests entirely on that intent
--     existing.
--
-- So the door does not merely bypass one check — it produces a source asset
-- with no provenance at all, which is the exact class of defect the Phase-7 exit
-- correction was written to close.
--
-- THE STATED CLOSURE CONDITION CANNOT ACTUALLY BE CHECKED, AND SAYING SO IS THE
-- POINT. `uploadTakeToBucket` promised removal "once telemetry shows zero
-- legacy_take_upload events across supported clients". That counter reads zero.
-- It is also worthless as evidence:
--
--   legacy_take_upload telemetry added ... 2026-07-28
--   newest object in the takes bucket .... 2026-07-15
--
-- The instrument was installed THIRTEEN DAYS AFTER the last byte arrived, and
-- after the callers had already been deleted (#178/#182, mid-July). A counter
-- that starts after the traffic stops will always read zero. Quoting it as proof
-- would be the same defect this repository keeps finding: a true statement whose
-- truth has nothing to do with what it appears to certify.
--
-- WHAT ACTUALLY SUPPORTS THE REMOVAL, measured against production:
--
--   callers of uploadTakeToBucket, anywhere ..... 0 (removed mid-July)
--   objects in takes ............................ 17, newest 2026-07-15
--   objects since the callers were removed ...... 0
--   rows in public.media_assets ................. 0
--
-- The last object predates the caller removal and nothing has landed in the 24
-- days since. The object names also match the legacy path format exactly
-- (`<uid>/<generationId>-<epoch>.mp4`), so those 17 are that function's output,
-- from before it was orphaned.
--
-- `media_assets` being EMPTY is why the doc's other closure condition — "zero
-- unmatched new objects", i.e. objects with no media_assets row — cannot be met
-- today and is not evidence of a bypass: all 17 are unmatched because the v2
-- contract flow has never run in production at all. The editor is off. That
-- condition only becomes meaningful once it has.
--
-- READ IS DELIBERATELY LEFT ALONE. 17 objects already live in this bucket and
-- creators can still play them back; `twinai takes read` stays exactly as it is.
-- This drops the ability to put NEW bytes in without provenance. Revoking read
-- would break existing recordings to fix a write path, which is not the trade
-- this migration is making.
--
-- Idempotent, and it does not assume the policy is present: an environment
-- provisioned after this lands never had it.
do $$ begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'twinai takes insert'
  ) then
    drop policy "twinai takes insert" on storage.objects;
  end if;
end $$;

-- Prove the door is shut, in the migration itself rather than in a comment
-- claiming it is. A surviving INSERT policy on `takes` fails the deploy.
do $$
declare
  remaining int;
begin
  select count(*) into remaining
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and cmd = 'INSERT'
    and coalesce(with_check, '') like '%''takes''%';

  if remaining > 0 then
    raise exception
      'A storage INSERT policy still admits bytes to the takes bucket (% found). Editor v2 uploads must go through source-asset → signed token → finalize.',
      remaining;
  end if;
end $$;
