// Supabase Edge Function: source-asset (editor v2, Phase 1)
//
// Server-authorized source-upload intents + finalization. The durable flow:
//   create   → verify the caller owns the generation, converge on ONE
//              media_assets row per recording_attempt_id (DB-unique across
//              refreshes/tabs/devices), and mint a SIGNED upload token bound to
//              that asset's exact stable object path. The token — not the
//              bucket's INSERT policy — is what authorizes the byte upload, so
//              every new-flow object provably has a corresponding intent row.
//   finalize → verify the caller owns the asset, confirm the object actually
//              exists in storage with a plausible size, then call the atomic
//              editor_finalize_source() DB function: uploading→validating and
//              exactly-one validation job (dedup-keyed) in ONE transaction.
//              Repeats reconcile — a flip that lost its job gets the job
//              inserted on the next call; valid user media is never deleted or
//              reset to a misleading state.
//
// The browser never chooses paths, never marks an asset ready, and never inserts
// jobs directly. ffprobe validation runs on the worker (validate_source).
//
// Deploy:  supabase functions deploy source-asset

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const BUCKET = 'takes'
const MAX_BYTES = 600 * 1024 * 1024 // matches the takes bucket cap
const MIN_BYTES = 2048 // a real few-second take is tens of KB minimum
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// Source Capture (Constitution §5.1 / §10D). The edge PARSES, AUTHENTICATES and
// NORMALIZES, then calls ONE atomic RPC (editor_create_source_asset). That RPC
// is the sole authority for provenance, canonicalization/hashing, the new-era
// marker, and open/quota/descriptor policy — the edge builds no intent, computes
// no hash, and enforces no cost policy. There is NO second create path.
// ---------------------------------------------------------------------------
interface CaptureSegmentIn { scene_number?: unknown; start_ms?: unknown; end_ms?: unknown; intended_dialogue_sha256?: unknown }

// The ONE MIME boundary: strip a MediaRecorder codec suffix
// (video/webm;codecs=vp9,opus) to the frozen base MIME the RPC accepts. Mirrors
// shared normalizeSourceMime (packages/shared/src/editor/capture.ts, tested).
function normalizeSourceMime(contentType: unknown): { baseMime: string; ext: string } | null {
  const base = (typeof contentType === 'string' ? contentType : '').split(';')[0].trim().toLowerCase()
  if (base === 'video/webm') return { baseMime: 'video/webm', ext: 'webm' }
  if (base === 'video/mp4') return { baseMime: 'video/mp4', ext: 'mp4' }
  if (base === 'video/quicktime') return { baseMime: 'video/quicktime', ext: 'mp4' }
  return null
}

// Map the RPC's stable exception codes to an HTTP status + user-safe message.
function createErrorStatus(msg: string): number {
  if (msg.includes('source_generation_not_owned')) return 404
  if (msg.includes('source_too_many_open')) return 429
  if (msg.includes('source_quota_exceeded')) return 413
  if (msg.includes('source_attempt_conflict') || msg.includes('capture_intent_conflict')) return 409
  if (msg.includes('source_policy_') || msg.includes('capture_intent_')) return 400
  return 500
}
function mapCreateError(msg: string): string {
  if (msg.includes('source_generation_not_owned')) return 'Generation not found'
  if (msg.includes('source_too_many_open')) return 'Too many recordings are still processing — give them a moment to finish.'
  if (msg.includes('source_quota_exceeded')) return 'Your storage is full — delete some older videos first.'
  if (msg.includes('source_attempt_conflict')) return 'This recording attempt already exists with different details.'
  if (msg.includes('capture_intent_conflict')) return 'A different capture already exists for this recording.'
  if (msg.includes('source_policy_mime')) return 'Unsupported video type — record or pick an MP4/MOV/WebM.'
  if (msg.includes('source_policy_size')) return 'That recording is empty or too large — please re-record.'
  if (msg.includes('source_policy_bucket')) return 'Upload target not allowed.'
  if (msg.includes('capture_intent_')) return 'The capture data was invalid — please re-record.'
  return 'Could not start the upload — try again.'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const admin = createClient(supabaseUrl, serviceKey)

  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated' }, 401)

  let body: {
    action?: string
    generation_id?: string
    recording_attempt_id?: string
    content_type?: string
    size_bytes?: number
    asset_id?: string
    capture?: Record<string, unknown>
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  // Bound intent churn (each create is a row + a future validation job).
  const { data: rateOk } = await admin.rpc('check_rate_limit', {
    p_user: user.id, p_action: 'source_asset', p_max: 30, p_window_secs: 60,
  })
  if (rateOk === false) return json({ error: 'Too many uploads at once — give it a few seconds.' }, 429)

  // Sign an upload token for the asset's exact object. upsert:true so a retry
  // of the SAME attempt re-uploads the SAME object instead of erroring.
  async function signUpload(path: string): Promise<{ token: string; signedUrl: string } | null> {
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true })
    if (error || !data) return null
    return { token: data.token, signedUrl: data.signedUrl }
  }

  function intentResponse(asset: { id: string; storage_path: string; status: string }, sign: { token: string; signedUrl: string } | null) {
    return json({
      assetId: asset.id,
      bucket: BUCKET,
      path: asset.storage_path,
      status: asset.status,
      token: sign?.token ?? null,
      signedUrl: sign?.signedUrl ?? null,
    })
  }

  if (body.action === 'create') {
    const generationId = (body.generation_id ?? '').trim()
    const attemptId = (body.recording_attempt_id ?? '').trim().toLowerCase()
    const sizeBytes = Number(body.size_bytes ?? 0)
    if (!generationId) return json({ error: 'generation_id is required' }, 400)
    if (!UUID_RE.test(attemptId)) return json({ error: 'recording_attempt_id (uuid) is required' }, 400)

    // The ONE MIME boundary (Constitution §10D): MediaRecorder reports a
    // codec-suffixed type (video/webm;codecs=vp9,opus); normalize to the frozen
    // base MIME the create RPC accepts. Mirrors shared normalizeSourceMime
    // (packages/shared/src/editor/capture.ts, tested there). Fail closed on
    // anything outside the allowed set.
    const norm = normalizeSourceMime(body.content_type)
    if (!norm) return json({ error: 'Unsupported video type — record or pick an MP4/MOV/WebM.' }, 400)

    // Capture provenance is MANDATORY for every new source (record OR upload).
    if (!body.capture || typeof body.capture !== 'object') {
      return json({ error: 'capture provenance is required' }, 400)
    }
    const cap = body.capture

    // Map the client's snake_case capture payload to the camelCase
    // SourceCaptureIntentInputV1 the RPC validates. The edge does NOT build,
    // hash, or persist the intent, and does NOT enforce open/quota/descriptor
    // policy — the single atomic RPC owns all of that. No alternate create path.
    const rawSegs = (cap as { accepted_segments?: unknown }).accepted_segments
    const input = {
      schemaVersion: 1,
      origin: (cap as { origin?: unknown }).origin,
      generationId,
      recordingScriptSha256: (cap as { recording_script_sha256?: unknown }).recording_script_sha256 ?? null,
      clientAttemptId: attemptId,
      recorderClock: (cap as { recorder_clock?: unknown }).recorder_clock,
      acceptedSegments: Array.isArray(rawSegs)
        ? rawSegs.map((s) => ({
            sceneNumber: (s as CaptureSegmentIn).scene_number,
            startMs: (s as CaptureSegmentIn).start_ms,
            endMs: (s as CaptureSegmentIn).end_ms,
            intendedDialogueSha256: (s as CaptureSegmentIn).intended_dialogue_sha256,
          }))
        : rawSegs,
    }

    const { data, error } = await admin.rpc('editor_create_source_asset', {
      p_owner: user.id,
      p_generation: generationId,
      p_attempt: attemptId,
      p_input: input,
      p_bucket: BUCKET,
      p_mime: norm.baseMime,
      p_size_bytes: sizeBytes,
    })
    if (error) return json({ error: mapCreateError(error.message) }, createErrorStatus(error.message))
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return json({ error: 'Could not start the upload — try again.' }, 500)

    if (row.status === 'ready') {
      return intentResponse({ id: row.asset_id, storage_path: row.storage_path, status: row.status }, null)
    }
    const sign = await signUpload(row.storage_path)
    if (!sign) return json({ error: 'Could not authorize the upload — try again.' }, 500)
    return intentResponse({ id: row.asset_id, storage_path: row.storage_path, status: row.status }, sign)
  }

  if (body.action === 'finalize') {
    const assetId = (body.asset_id ?? '').trim()
    if (!assetId) return json({ error: 'asset_id is required' }, 400)

    const { data: asset } = await admin
      .from('media_assets')
      .select('id, owner_id, generation_id, bucket, storage_path, status')
      .eq('id', assetId)
      .eq('owner_id', user.id)
      .maybeSingle()
    if (!asset) return json({ error: 'Asset not found' }, 404)
    // Idempotent: settled assets just report their state.
    if (asset.status === 'ready') return json({ ok: true, status: 'ready' })
    if (asset.status === 'rejected' || asset.status === 'deleted') {
      return json({ error: 'This upload was rejected — please re-record.' }, 409)
    }

    // The object must really exist before we claim anything about it. HEAD via
    // the authenticated storage endpoint (service role).
    const head = await fetch(
      `${supabaseUrl}/storage/v1/object/${BUCKET}/${asset.storage_path.split('/').map(encodeURIComponent).join('/')}`,
      { method: 'HEAD', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    )
    if (!head.ok) return json({ error: "The upload didn't complete — try again." }, 409)
    const objectBytes = Number(head.headers.get('content-length') ?? '0')
    const objectEtag = head.headers.get('etag')
    if (objectBytes < MIN_BYTES) return json({ error: 'The uploaded file is empty — please re-record.' }, 409)
    if (objectBytes > MAX_BYTES) return json({ error: 'The uploaded file is too large.' }, 409)

    // Atomic in the DB: uploading→validating + exactly-one dedup-keyed
    // validation job, in one transaction. Safe to repeat. The size + etag pin
    // WHICH bytes were finalized — the validator refuses different bytes.
    const { data: status, error: finErr } = await admin.rpc('editor_finalize_source', {
      p_asset_id: assetId, p_object_bytes: objectBytes, p_object_etag: objectEtag,
    })
    if (finErr) return json({ error: 'Could not queue validation — try again.' }, 500)
    return json({ ok: true, status: status ?? 'validating' })
  }

  return json({ error: 'Unknown action' }, 400)
})
