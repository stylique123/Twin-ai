// Supabase Edge Function: source-asset (editor v2, Phase 1)
//
// Server-authorized source-upload intents + finalization. The durable flow:
//   create   → verify the caller owns the generation, mint ONE media_assets row
//              (status=uploading) with a STABLE object path, return {assetId, path}
//   finalize → verify the caller owns the asset, confirm the object actually
//              exists in storage with a plausible size, flip to validating, and
//              enqueue ONE `validate_source` worker job (ffprobe runs there —
//              edge functions cannot decode media).
//
// The browser never chooses paths, never marks an asset ready, and never inserts
// jobs directly. Both actions are idempotent: repeating them converges on the
// same asset/job instead of duplicating work or storage objects.
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

  if (body.action === 'create') {
    const generationId = (body.generation_id ?? '').trim()
    const contentType = (body.content_type ?? '').trim().toLowerCase()
    const sizeBytes = Number(body.size_bytes ?? 0)
    if (!generationId) return json({ error: 'generation_id is required' }, 400)
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

    // Idempotent-ish create: reuse a still-open (uploading/validating) source
    // asset for this generation rather than minting an orphan per attempt.
    const { data: open } = await admin
      .from('media_assets')
      .select('id, bucket, storage_path, status')
      .eq('generation_id', generationId)
      .eq('owner_id', user.id)
      .eq('kind', 'source')
      .in('status', ['uploading', 'validating'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (open) return json({ assetId: open.id, bucket: open.bucket, path: open.storage_path })

    const assetId = crypto.randomUUID()
    const ext = contentType.includes('mp4') ? 'mp4' : contentType.includes('quicktime') ? 'mp4' : 'webm'
    // Stable path: {owner}/{generation}/{asset}.{ext} — first segment MUST be the
    // owner id (the takes-bucket INSERT policy requires it), and retries re-upload
    // to this same object instead of minting timestamped duplicates.
    const path = `${user.id}/${generationId}/${assetId}.${ext}`
    const { error: insErr } = await admin.from('media_assets').insert({
      id: assetId,
      owner_id: user.id,
      generation_id: generationId,
      kind: 'source',
      bucket: BUCKET,
      storage_path: path,
      mime_type: contentType,
      size_bytes: sizeBytes,
      status: 'uploading',
    })
    if (insErr) return json({ error: 'Could not start the upload — try again.' }, 500)
    return json({ assetId, bucket: BUCKET, path })
  }

  if (body.action === 'finalize') {
    const assetId = (body.asset_id ?? '').trim()
    if (!assetId) return json({ error: 'asset_id is required' }, 400)

    const { data: asset } = await admin
      .from('media_assets')
      .select('id, owner_id, generation_id, bucket, storage_path, status, size_bytes')
      .eq('id', assetId)
      .eq('owner_id', user.id)
      .maybeSingle()
    if (!asset) return json({ error: 'Asset not found' }, 404)
    // Idempotent: already past finalize → report current state, do nothing.
    if (asset.status === 'ready' || asset.status === 'validating') return json({ ok: true, status: asset.status })
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

    // Flip to validating (only from uploading — a concurrent finalize loses
    // cleanly) and enqueue exactly one validation job.
    const { data: flipped } = await admin
      .from('media_assets')
      .update({ status: 'validating', size_bytes: objectBytes })
      .eq('id', assetId)
      .eq('status', 'uploading')
      .select('id')
      .maybeSingle()
    if (flipped) {
      const { error: jobErr } = await admin.from('jobs').insert({
        owner_id: user.id,
        type: 'validate_source',
        status: 'queued',
        payload: { asset_id: assetId, generation_id: asset.generation_id },
      })
      if (jobErr) {
        // Roll back so a retryable finalize can re-enqueue instead of stranding
        // the asset in validating with no job.
        await admin.from('media_assets').update({ status: 'uploading' }).eq('id', assetId)
        return json({ error: 'Could not queue validation — try again.' }, 500)
      }
    }
    return json({ ok: true, status: 'validating' })
  }

  return json({ error: 'Unknown action' }, 400)
})
