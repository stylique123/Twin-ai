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
//              editor_finalize_source() DB function.
//
// The browser never chooses paths, never marks an asset ready, and never inserts
// jobs directly. ffprobe validation runs on the worker (validate_source).
//
// TRUST BOUNDARY (Constitution §10D): create runs through the shared, injectable
// authority runSourceCreate — it REJECTS unknown request/capture/segment keys
// BEFORE mapping (never sanitizes hostile keys into a valid request), parses only a
// safe size + allowed MIME, then calls EXACTLY ONE atomic RPC
// (editor_create_source_asset). The edge performs ZERO direct table writes.
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

// ---------------------------------------------------------------------------
// Source Capture (Constitution §5.1 / §10D). The edge PARSES, AUTHENTICATES and
// NORMALIZES, then calls ONE atomic RPC (editor_create_source_asset). That RPC
// is the sole authority for provenance, canonicalization/hashing, the new-era
// marker, open/quota/descriptor policy, and the source-bound script binding — the
// edge builds no intent, computes no hash, and enforces no cost policy.
// ---------------------------------------------------------------------------
// ---- edge-core (INLINED verbatim from packages/shared/src/editor/sourceCreate.ts
// + capture.ts; Deno cannot import shared at deploy time). Shared is the single
// source of truth; edge-source-parity.test.ts asserts these bodies never drift.
// >>> EDGE-CORE-BEGIN
const SOURCE_BUCKET = 'takes'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CREATE_BODY_KEYS = new Set(['action', 'generation_id', 'recording_attempt_id', 'content_type', 'size_bytes', 'capture'])
const CAPTURE_SNAKE_KEYS = new Set(['origin', 'recording_script_sha256', 'recorder_clock', 'accepted_segments'])
const SEGMENT_SNAKE_KEYS = new Set(['scene_number', 'start_ms', 'end_ms', 'intended_dialogue_sha256'])

export function normalizeSourceMime(contentType: string | null | undefined): { baseMime: string; ext: 'webm' | 'mp4' } | null {
  const base = (contentType ?? '').split(';')[0].trim().toLowerCase()
  if (base === 'video/webm') return { baseMime: 'video/webm', ext: 'webm' }
  if (base === 'video/mp4') return { baseMime: 'video/mp4', ext: 'mp4' }
  if (base === 'video/quicktime') return { baseMime: 'video/quicktime', ext: 'mp4' }
  return null
}

export function safeSizeBytes(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : (typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN)
  if (!Number.isFinite(n) || !Number.isSafeInteger(n) || n < 0) return null
  return n
}

export function buildCreateInput(
  capture: Record<string, unknown>,
  ctx: { generationId: string; clientAttemptId: string },
): Record<string, unknown> {
  const rawSegs = capture.accepted_segments
  const input: Record<string, unknown> = {
    schemaVersion: 1,
    origin: capture.origin,
    generationId: ctx.generationId,
    clientAttemptId: ctx.clientAttemptId,
    recorderClock: capture.recorder_clock,
    acceptedSegments: Array.isArray(rawSegs)
      ? rawSegs.map((s) => {
          const seg = s as Record<string, unknown>
          return {
            sceneNumber: seg.scene_number,
            startMs: seg.start_ms,
            endMs: seg.end_ms,
            intendedDialogueSha256: seg.intended_dialogue_sha256,
          }
        })
      : rawSegs,
  }
  if (Object.prototype.hasOwnProperty.call(capture, 'recording_script_sha256')) {
    input.recordingScriptSha256 = capture.recording_script_sha256
  }
  return input
}

export interface PlanError { status: number; message: string }
export interface CreateRpcArgs {
  p_generation: string
  p_attempt: string
  p_input: Record<string, unknown>
  p_bucket: string
  p_mime: string
  p_size_bytes: number
}

export function buildCreatePlan(
  body: Record<string, unknown>,
): { error: PlanError } | { rpcArgs: CreateRpcArgs } {
  for (const k of Object.keys(body)) {
    if (!CREATE_BODY_KEYS.has(k)) return { error: { status: 400, message: `Unexpected field: ${k}` } }
  }
  const generationId = String(body.generation_id ?? '').trim()
  const attemptId = String(body.recording_attempt_id ?? '').trim().toLowerCase()
  if (!UUID_RE.test(generationId)) return { error: { status: 400, message: 'generation_id (uuid) is required' } }
  if (!UUID_RE.test(attemptId)) return { error: { status: 400, message: 'recording_attempt_id (uuid) is required' } }

  const sizeBytes = safeSizeBytes(body.size_bytes)
  if (sizeBytes === null) return { error: { status: 400, message: 'That recording is empty or too large — please re-record.' } }

  const norm = normalizeSourceMime(body.content_type as string | null | undefined)
  if (!norm) return { error: { status: 400, message: 'Unsupported video type — record or pick an MP4/MOV/WebM.' } }

  const capture = body.capture
  if (!capture || typeof capture !== 'object' || Array.isArray(capture)) {
    return { error: { status: 400, message: 'capture provenance is required' } }
  }
  const cap = capture as Record<string, unknown>
  for (const k of Object.keys(cap)) {
    if (!CAPTURE_SNAKE_KEYS.has(k)) return { error: { status: 400, message: `Unexpected capture field: ${k}` } }
  }
  const segs = cap.accepted_segments
  if (Array.isArray(segs)) {
    for (const s of segs) {
      if (!s || typeof s !== 'object' || Array.isArray(s)) return { error: { status: 400, message: 'Invalid capture segment' } }
      for (const k of Object.keys(s as Record<string, unknown>)) {
        if (!SEGMENT_SNAKE_KEYS.has(k)) return { error: { status: 400, message: `Unexpected segment field: ${k}` } }
      }
    }
  }

  return {
    rpcArgs: {
      p_generation: generationId,
      p_attempt: attemptId,
      p_input: buildCreateInput(cap, { generationId, clientAttemptId: attemptId }),
      p_bucket: SOURCE_BUCKET,
      p_mime: norm.baseMime,
      p_size_bytes: sizeBytes,
    },
  }
}

export function createErrorStatus(msg: string): number {
  if (msg.includes('source_generation_not_owned')) return 404
  if (msg.includes('source_too_many_open')) return 429
  if (msg.includes('source_quota_exceeded')) return 413
  if (msg.includes('script_snapshot_too_large')) return 413
  if (msg.includes('source_asset_rejected')
    || msg.includes('source_attempt_conflict')
    || msg.includes('capture_intent_conflict')
    || msg.includes('capture_script_sha_mismatch')
    || msg.includes('capture_dialogue_sha_mismatch')
    || msg.includes('capture_script_ambiguous_scene')
    || msg.includes('capture_segment_not_teleprompter')
    || msg.includes('capture_segment_order')) return 409
  if (msg.includes('source_policy_') || msg.includes('capture_')) return 400
  return 500
}
export function mapCreateError(msg: string): string {
  if (msg.includes('source_generation_not_owned')) return 'Generation not found'
  if (msg.includes('source_too_many_open')) return 'Too many recordings are still processing — give them a moment to finish.'
  if (msg.includes('source_quota_exceeded')) return 'Your storage is full — delete some older videos first.'
  if (msg.includes('script_snapshot_too_large')) return 'Your script is too long to record against — shorten it and try again.'
  if (msg.includes('source_asset_rejected')) return 'This recording was rejected — please record a new take.'
  if (msg.includes('source_attempt_conflict')) return 'This recording attempt already exists with different details.'
  if (msg.includes('capture_intent_conflict')) return 'A different capture already exists for this recording.'
  if (msg.includes('capture_script_sha_mismatch')) return "This take doesn't match the current script — please re-record."
  if (msg.includes('capture_dialogue_sha_mismatch')) return "A scene's words don't match the script — please re-record."
  if (msg.includes('capture_script_ambiguous_scene')) return 'This script has duplicate scenes — regenerate it and try again.'
  if (msg.includes('capture_segment_not_teleprompter')) return 'A recorded scene is not part of the teleprompter script — please re-record.'
  if (msg.includes('capture_segment_order')) return 'The recorded scenes are out of order — please re-record.'
  if (msg.includes('source_policy_mime')) return 'Unsupported video type — record or pick an MP4/MOV/WebM.'
  if (msg.includes('source_policy_size')) return 'That recording is empty or too large — please re-record.'
  if (msg.includes('source_policy_bucket')) return 'Upload target not allowed.'
  if (msg.includes('capture_')) return 'The capture data was invalid — please re-record.'
  return 'Could not start the upload — try again.'
}

export interface CreateDeps {
  createSourceAsset(args: CreateRpcArgs & { p_owner: string }): Promise<{ data: unknown; error: { message: string } | null }>
  signUpload(path: string): Promise<{ token: string; signedUrl: string } | null>
}
export interface CreateResult { status: number; body: Record<string, unknown> }

export async function runSourceCreate(
  body: Record<string, unknown>, ownerId: string, deps: CreateDeps,
): Promise<CreateResult> {
  const plan = buildCreatePlan(body)
  if ('error' in plan) return { status: plan.error.status, body: { error: plan.error.message } }

  const { data, error } = await deps.createSourceAsset({ p_owner: ownerId, ...plan.rpcArgs })
  if (error) return { status: createErrorStatus(error.message), body: { error: mapCreateError(error.message) } }
  const row = (Array.isArray(data) ? data[0] : data) as { asset_id?: string; storage_path?: string; status?: string } | null
  if (!row || !row.asset_id || !row.storage_path || !row.status) {
    return { status: 500, body: { error: 'Could not start the upload — try again.' } }
  }

  const base = { assetId: row.asset_id, bucket: SOURCE_BUCKET, path: row.storage_path, status: row.status }
  if (row.status === 'ready') return { status: 200, body: { ...base, token: null, signedUrl: null } }

  const sign = await deps.signUpload(row.storage_path)
  if (!sign) return { status: 500, body: { error: 'Could not authorize the upload — try again.' } }
  return { status: 200, body: { ...base, token: sign.token, signedUrl: sign.signedUrl } }
}
// <<< EDGE-CORE-END

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

  if (body.action === 'create') {
    // The ENTIRE create path is the shared injectable authority: it validates the
    // full keyset (rejecting unknown request/capture/segment keys with a stable 400
    // BEFORE mapping), calls editor_create_source_asset EXACTLY once, and performs no
    // direct table writes. Behavior is pinned by sourceCreate handler tests + parity.
    const result = await runSourceCreate(body as Record<string, unknown>, user.id, {
      createSourceAsset: (args) => admin.rpc('editor_create_source_asset', args),
      signUpload,
    })
    return json(result.body, result.status)
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
    // validation job, in one transaction. Safe to repeat.
    const { data: status, error: finErr } = await admin.rpc('editor_finalize_source', {
      p_asset_id: assetId, p_object_bytes: objectBytes, p_object_etag: objectEtag,
    })
    if (finErr) return json({ error: 'Could not queue validation — try again.' }, 500)
    return json({ ok: true, status: status ?? 'validating' })
  }

  return json({ error: 'Unknown action' }, 400)
})
