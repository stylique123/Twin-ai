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
const ALLOWED_TYPES = ['video/webm', 'video/mp4', 'video/quicktime']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Abuse/cost caps (env-overridable). Modest defaults: a creator records one
// take at a time; a fleet of parallel never-finalized uploads is not a person.
const MAX_OPEN_SOURCE_ASSETS = Number(Deno.env.get('SOURCE_MAX_OPEN_ASSETS') ?? '5')
const USER_QUOTA_BYTES = Number(Deno.env.get('SOURCE_USER_QUOTA_BYTES') ?? String(20 * 1024 * 1024 * 1024)) // 20 GB

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
    const contentType = (body.content_type ?? '').trim().toLowerCase()
    const sizeBytes = Number(body.size_bytes ?? 0)
    if (!generationId) return json({ error: 'generation_id is required' }, 400)
    if (!UUID_RE.test(attemptId)) return json({ error: 'recording_attempt_id (uuid) is required' }, 400)
    if (!ALLOWED_TYPES.some((t) => contentType.startsWith(t))) {
      return json({ error: 'Unsupported video type — record or pick an MP4/MOV/WebM.' }, 400)
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes < MIN_BYTES) {
      return json({ error: 'That recording came through empty — please re-record.' }, 400)
    }
    if (sizeBytes > MAX_BYTES) return json({ error: 'That video is too large (600MB max).' }, 400)

    // Ownership: the generation must belong to the caller (owner-strict; peers
    // can view a workspace's generations but only the owner records onto them).
    const { data: gen } = await admin
      .from('generations')
      .select('id, user_id')
      .eq('id', generationId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!gen) return json({ error: 'Generation not found' }, 404)

    // Idempotent create: the DB unique index on (owner, generation, attempt)
    // means every repeat of this call — refresh, second tab, second device,
    // timeout retry — converges on the SAME asset row and stable path.
    const findExisting = () => admin
      .from('media_assets')
      .select('id, storage_path, status')
      .eq('owner_id', user.id)
      .eq('generation_id', generationId)
      .eq('recording_attempt_id', attemptId)
      .maybeSingle()

    const { data: existing } = await findExisting()
    if (existing) {
      if (existing.status === 'ready') return intentResponse(existing, null) // nothing left to upload
      if (existing.status === 'rejected' || existing.status === 'deleted') {
        return json({ error: 'This recording was rejected — please record a new take.' }, 409)
      }
      const sign = await signUpload(existing.storage_path)
      if (!sign) return json({ error: 'Could not authorize the upload — try again.' }, 500)
      return intentResponse(existing, sign)
    }

    // Abuse/cost caps, checked only when actually minting a NEW asset.
    const { count: openCount } = await admin
      .from('media_assets')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .eq('kind', 'source')
      .in('status', ['uploading', 'validating'])
    if ((openCount ?? 0) >= MAX_OPEN_SOURCE_ASSETS) {
      return json({ error: 'Too many recordings are still processing — give them a moment to finish.' }, 429)
    }
    const { data: usage } = await admin
      .from('media_assets')
      .select('size_bytes')
      .eq('owner_id', user.id)
      .neq('status', 'deleted')
    const usedBytes = (usage ?? []).reduce((acc, r) => acc + Number(r.size_bytes ?? 0), 0)
    if (usedBytes + sizeBytes > USER_QUOTA_BYTES) {
      return json({ error: 'Your storage is full — delete some older videos first.' }, 413)
    }

    const assetId = crypto.randomUUID()
    const ext = contentType.includes('mp4') ? 'mp4' : contentType.includes('quicktime') ? 'mp4' : 'webm'
    // Stable path: {owner}/{generation}/{asset}.{ext} — owner-prefixed to match
    // the bucket's layout conventions; retries re-upload this same object.
    const path = `${user.id}/${generationId}/${assetId}.${ext}`
    const { error: insErr } = await admin.from('media_assets').insert({
      id: assetId,
      owner_id: user.id,
      generation_id: generationId,
      recording_attempt_id: attemptId,
      kind: 'source',
      bucket: BUCKET,
      storage_path: path,
      mime_type: contentType,
      size_bytes: sizeBytes,
      status: 'uploading',
    })
    if (insErr) {
      // Unique-index race: another tab/device created this attempt first.
      // Converge on that row instead of failing.
      const { data: raced } = await findExisting()
      if (raced && raced.status !== 'rejected' && raced.status !== 'deleted') {
        const sign = raced.status === 'ready' ? null : await signUpload(raced.storage_path)
        if (raced.status !== 'ready' && !sign) return json({ error: 'Could not authorize the upload — try again.' }, 500)
        return intentResponse(raced, sign)
      }
      return json({ error: 'Could not start the upload — try again.' }, 500)
    }
    const sign = await signUpload(path)
    if (!sign) return json({ error: 'Could not authorize the upload — try again.' }, 500)
    return json({ assetId, bucket: BUCKET, path, status: 'uploading', token: sign.token, signedUrl: sign.signedUrl })
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
    if (objectBytes < MIN_BYTES) return json({ error: 'The uploaded file is empty — please re-record.' }, 409)
    if (objectBytes > MAX_BYTES) return json({ error: 'The uploaded file is too large.' }, 409)

    // Atomic in the DB: uploading→validating + exactly-one dedup-keyed
    // validation job, in one transaction. Safe to repeat.
    const { data: status, error: finErr } = await admin.rpc('editor_finalize_source', {
      p_asset_id: assetId, p_object_bytes: objectBytes,
    })
    if (finErr) return json({ error: 'Could not queue validation — try again.' }, 500)
    return json({ ok: true, status: status ?? 'validating' })
  }

  return json({ error: 'Unknown action' }, 400)
})
