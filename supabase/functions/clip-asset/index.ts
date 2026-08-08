// Supabase Edge Function: clip-asset (Phase 12 item 13)
//
// Server-authorized SCREEN-CAPTURE uploads. The shape mirrors `source-asset`:
//   create   → verify the caller owns the generation, converge on ONE
//              media_assets row per recording_attempt_id, and mint a SIGNED
//              upload token bound to that asset's exact stable object path.
//   finalize → verify the caller owns the asset, confirm the object really
//              exists with a plausible size, then call editor_finalize_clip(),
//              which flips uploading→validating and enqueues the one probe job.
//
// ── WHY A SECOND FUNCTION AND NOT A THIRD ACTION ON source-asset ─────────
//
// `source-asset`'s handler body is INLINED VERBATIM from
// packages/shared/src/editor/sourceCreate.ts, with a parity test asserting the
// two never drift — that duplication is deliberate (Deno cannot import the
// shared package at deploy time) and it is what makes the trust boundary
// reviewable. Adding a clip branch would mean growing that frozen body with
// cases that share none of its guarantees: no capture intent, no script
// snapshot, no dialogue SHAs. A clip has its own RPCs (0107) for the same
// reason, and this is the door to them.
//
// The browser never chooses paths, never marks an asset ready, and never
// inserts jobs. Measurement runs on the worker (validate_clip).
//
// Deploy:  supabase functions deploy clip-asset

import { createClient } from 'jsr:@supabase/supabase-js@2.112.2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const BUCKET = 'takes'
const MAX_BYTES = 600 * 1024 * 1024
const MIN_BYTES = 2048
const MAX_LABEL_CHARS = 200

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Unknown keys FAIL rather than being ignored, the same posture the source
// create takes: a request is either exactly the shape we accept or it is
// refused, never sanitized into one.
const CREATE_BODY_KEYS = new Set(['action', 'generation_id', 'recording_attempt_id', 'content_type', 'size_bytes', 'clip_label', 'scene_number'])
const FINALIZE_BODY_KEYS = new Set(['action', 'asset_id'])

function normalizeMime(contentType: string | null | undefined): { baseMime: string } | null {
  const base = (contentType ?? '').split(';')[0].trim().toLowerCase()
  if (base === 'video/webm') return { baseMime: 'video/webm' }
  if (base === 'video/mp4') return { baseMime: 'video/mp4' }
  if (base === 'video/quicktime') return { baseMime: 'video/quicktime' }
  return null
}

function safeSizeBytes(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : (typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN)
  if (!Number.isFinite(n) || !Number.isSafeInteger(n) || n < 0) return null
  return n
}

interface PlanError { status: number; message: string }
interface CreateRpcArgs {
  p_generation: string
  p_attempt: string
  p_label: string | null
  p_bucket: string
  p_mime: string
  p_size_bytes: number
  /** The scene the declared slot sits on. Null for a clip with no slot — see
   *  0108. It is what lets the compiler find the window the clip plays over. */
  p_scene_number: number | null
}

export function buildClipCreatePlan(raw: unknown): { error: PlanError } | { rpcArgs: CreateRpcArgs } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: { status: 400, message: 'Invalid request body' } }
  }
  const body = raw as Record<string, unknown>
  for (const k of Object.keys(body)) {
    if (!CREATE_BODY_KEYS.has(k)) return { error: { status: 400, message: `Unexpected field: ${k}` } }
  }
  const generationId = String(body.generation_id ?? '').trim()
  const attemptId = String(body.recording_attempt_id ?? '').trim().toLowerCase()
  if (!UUID_RE.test(generationId)) return { error: { status: 400, message: 'generation_id (uuid) is required' } }
  if (!UUID_RE.test(attemptId)) return { error: { status: 400, message: 'recording_attempt_id (uuid) is required' } }

  const sizeBytes = safeSizeBytes(body.size_bytes)
  if (sizeBytes === null) return { error: { status: 400, message: 'That capture is empty or too large — try recording it again.' } }

  const norm = normalizeMime(body.content_type as string | null | undefined)
  if (!norm) return { error: { status: 400, message: 'Unsupported video type for a screen capture.' } }

  // NULL IS A REAL VALUE, not a missing one: an unattached clip is legitimate
  // (0106), so an absent label is passed through as null rather than refused or
  // replaced with an empty string, which the CHECK would reject anyway.
  let label: string | null = null
  if (body.clip_label !== undefined && body.clip_label !== null) {
    if (typeof body.clip_label !== 'string') return { error: { status: 400, message: 'clip_label must be text' } }
    const trimmed = body.clip_label.trim()
    if (trimmed.length > MAX_LABEL_CHARS) return { error: { status: 400, message: 'That slot name is too long.' } }
    label = trimmed === '' ? null : trimmed
  }

  // THE SCENE, alongside the label rather than instead of it. The label is what
  // the creator reads and what the capture surface matches on; the number is the
  // only thing the compiler can place a clip with. Sending one without the other
  // is refused by the RPC, so both travel together or neither does.
  let sceneNumber: number | null = null
  if (body.scene_number !== undefined && body.scene_number !== null) {
    const n = body.scene_number
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0) {
      return { error: { status: 400, message: 'scene_number must be a positive integer' } }
    }
    if (label === null) {
      return { error: { status: 400, message: 'scene_number needs the slot it belongs to' } }
    }
    sceneNumber = n
  }

  return {
    rpcArgs: {
      p_generation: generationId,
      p_attempt: attemptId,
      p_label: label,
      p_bucket: BUCKET,
      p_mime: norm.baseMime,
      p_size_bytes: sizeBytes,
      p_scene_number: sceneNumber,
    },
  }
}

export function clipErrorStatus(msg: string): number {
  if (msg.includes('clip_generation_not_owned')) return 404
  if (msg.includes('clip_too_many_open')) return 429
  if (msg.includes('clip_quota_exceeded')) return 413
  if (msg.includes('clip_limit_reached')) return 409
  if (msg.includes('clip_asset_rejected') || msg.includes('clip_attempt_conflict')) return 409
  if (msg.includes('clip_policy_')) return 400
  return 500
}
export function mapClipError(msg: string): string {
  if (msg.includes('clip_generation_not_owned')) return 'Video not found'
  if (msg.includes('clip_too_many_open')) return 'Too many recordings are still processing — give them a moment.'
  if (msg.includes('clip_limit_reached')) return 'That is as many clips as one video can hold.'
  if (msg.includes('clip_quota_exceeded')) return 'Your storage is full — delete some older videos first.'
  if (msg.includes('clip_asset_rejected')) return 'That capture was rejected — record it again.'
  if (msg.includes('clip_attempt_conflict')) return 'This capture attempt already exists with different details.'
  if (msg.includes('clip_policy_mime')) return 'Unsupported video type for a screen capture.'
  if (msg.includes('clip_policy_size')) return 'That capture is empty or too large — try recording it again.'
  if (msg.includes('clip_policy_label')) return 'That slot name is too long.'
  if (msg.includes('clip_policy_scene')) return 'That capture is not attached to a line of the script.'
  if (msg.includes('clip_policy_bucket')) return 'Upload target not allowed.'
  return 'Could not start the upload — try again.'
}

export interface ClipDeps {
  getUser(): Promise<{ id: string } | null>
  checkRateLimit(ownerId: string): Promise<boolean>
  createClipAsset(args: CreateRpcArgs & { p_owner: string }): Promise<{ data: unknown; error: { message: string } | null }>
  signUpload(path: string): Promise<{ token: string; signedUrl: string } | null>
  finalize(ownerId: string, assetId: string): Promise<{ status: number; body: Record<string, unknown> }>
}
export interface ClipResult { status: number; body: Record<string, unknown> }

export async function executeClipCreate(
  rpcArgs: CreateRpcArgs, ownerId: string, deps: ClipDeps,
): Promise<ClipResult> {
  const { data, error } = await deps.createClipAsset({ p_owner: ownerId, ...rpcArgs })
  if (error) return { status: clipErrorStatus(error.message), body: { error: mapClipError(error.message) } }
  const row = (Array.isArray(data) ? data[0] : data) as { asset_id?: string; storage_path?: string; status?: string } | null
  if (!row || !row.asset_id || !row.storage_path || !row.status) {
    return { status: 500, body: { error: 'Could not start the upload — try again.' } }
  }
  const base = { assetId: row.asset_id, bucket: BUCKET, path: row.storage_path, status: row.status }
  // An already-settled attempt gets no token: re-uploading over a clip that has
  // been measured would leave the row describing bytes that are gone.
  if (row.status !== 'uploading') return { status: 200, body: { ...base, token: null, signedUrl: null } }
  const sign = await deps.signUpload(row.storage_path)
  if (!sign) return { status: 500, body: { error: 'Could not authorize the upload — try again.' } }
  return { status: 200, body: { ...base, token: sign.token, signedUrl: sign.signedUrl } }
}

export async function handleClipAssetRequest(body: unknown, deps: ClipDeps): Promise<ClipResult> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, body: { error: 'Invalid request body' } }
  }
  const b = body as Record<string, unknown>
  const user = await deps.getUser()
  if (!user) return { status: 401, body: { error: 'Not authenticated' } }

  if (b.action === 'create') {
    // Plan FIRST, so a malformed or unknown-keyed request never reaches the rate
    // limiter or the RPC, then rate-check once and execute the SAME plan.
    const plan = buildClipCreatePlan(b)
    if ('error' in plan) return { status: plan.error.status, body: { error: plan.error.message } }
    if (!(await deps.checkRateLimit(user.id))) {
      return { status: 429, body: { error: 'Too many uploads at once — give it a few seconds.' } }
    }
    return executeClipCreate(plan.rpcArgs, user.id, deps)
  }

  if (b.action === 'finalize') {
    for (const k of Object.keys(b)) {
      if (!FINALIZE_BODY_KEYS.has(k)) return { status: 400, body: { error: `Unexpected field: ${k}` } }
    }
    const assetId = String(b.asset_id ?? '').trim()
    if (!UUID_RE.test(assetId)) return { status: 400, body: { error: 'asset_id (uuid) is required' } }
    return deps.finalize(user.id, assetId)
  }

  return { status: 400, body: { error: 'Unknown action' } }
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

  let body: unknown
  try { body = await req.json() } catch { body = null }

  const result = await handleClipAssetRequest(body, {
    getUser: async () => {
      const { data: { user } } = await userClient.auth.getUser()
      return user ? { id: user.id } : null
    },
    checkRateLimit: async (ownerId) => {
      const { data } = await admin.rpc('check_rate_limit', { p_user: ownerId, p_action: 'clip_asset', p_max: 30, p_window_secs: 60 })
      return data !== false
    },
    createClipAsset: (args) => admin.rpc('editor_create_clip_asset', args),
    signUpload: async (path: string) => {
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true })
      if (error || !data) return null
      return { token: data.token, signedUrl: data.signedUrl }
    },
    finalize: async (ownerId: string, assetId: string) => {
      // Ownership AND kind are re-checked here, not only in the RPC: this is
      // where the storage object is fetched, and fetching one for an asset the
      // caller does not own would leak its size before the RPC ever refused.
      const { data: asset } = await admin
        .from('media_assets').select('id, owner_id, kind, bucket, storage_path, status')
        .eq('id', assetId).eq('owner_id', ownerId).maybeSingle()
      if (!asset || asset.kind !== 'clip') return { status: 404, body: { error: 'Capture not found' } }
      if (asset.status === 'ready') return { status: 200, body: { ok: true, status: 'ready' } }
      if (asset.status === 'rejected' || asset.status === 'deleted') {
        return { status: 409, body: { error: 'That capture was rejected — record it again.' } }
      }
      const head = await fetch(
        `${supabaseUrl}/storage/v1/object/${BUCKET}/${asset.storage_path.split('/').map(encodeURIComponent).join('/')}`,
        { method: 'HEAD', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      )
      if (!head.ok) return { status: 409, body: { error: "The upload didn't complete — try again." } }
      const objectBytes = Number(head.headers.get('content-length') ?? '0')
      const objectEtag = head.headers.get('etag')
      if (objectBytes < MIN_BYTES) return { status: 409, body: { error: 'The uploaded capture is empty — record it again.' } }
      if (objectBytes > MAX_BYTES) return { status: 409, body: { error: 'The uploaded capture is too large.' } }
      const { data: status, error: finErr } = await admin.rpc('editor_finalize_clip', {
        p_asset_id: assetId, p_object_bytes: objectBytes, p_object_etag: objectEtag,
      })
      if (finErr) return { status: 500, body: { error: 'Could not queue the capture — try again.' } }
      return { status: 200, body: { ok: true, status: status ?? 'validating' } }
    },
  })
  return json(result.body, result.status)
})
