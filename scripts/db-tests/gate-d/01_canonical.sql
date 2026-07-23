-- Candidate: deterministic canonical serializer for the STORED capture intent.
-- Emits byte-identical output to shared canonicalJson(SourceCaptureIntentV1):
-- sorted top-level keys, sorted segment keys, array order preserved, no spaces.
-- String fields are ASCII (uuids/hex/enums/ISO), so to_jsonb(text)::text escaping
-- matches JSON.stringify; a Unicode fixture proves it anyway.
create or replace function public.editor_capture_intent_canonical(p jsonb)
returns text language sql immutable as $$
  select '{'
    || '"acceptedSegments":[' || coalesce((
         select string_agg(
           '{"endMs":' || (seg->>'endMs')
           || ',"intendedDialogueSha256":' || to_jsonb(seg->>'intendedDialogueSha256')::text
           || ',"sceneNumber":' || (seg->>'sceneNumber')
           || ',"startMs":' || (seg->>'startMs')
           || '}', ',' order by ord)
         from jsonb_array_elements(p->'acceptedSegments') with ordinality as t(seg, ord)
       ), '') || '],'
    || '"clientAttemptId":' || to_jsonb(p->>'clientAttemptId')::text || ','
    || '"generationId":' || to_jsonb(p->>'generationId')::text || ','
    || '"origin":' || to_jsonb(p->>'origin')::text || ','
    || '"recordedAt":' || to_jsonb(p->>'recordedAt')::text || ','
    || '"recorderClock":' || to_jsonb(p->>'recorderClock')::text || ','
    || '"recordingScriptSha256":' || (case when p->'recordingScriptSha256' is null or jsonb_typeof(p->'recordingScriptSha256')='null'
                                          then 'null' else to_jsonb(p->>'recordingScriptSha256')::text end) || ','
    || '"schemaVersion":1,'
    || '"sourceAssetId":' || to_jsonb(p->>'sourceAssetId')::text
    || '}'
$$;

create or replace function public.editor_capture_intent_sha256(p jsonb)
returns text language sql immutable as $$
  select encode(digest(convert_to(public.editor_capture_intent_canonical(p), 'UTF8'), 'sha256'), 'hex')
$$;
