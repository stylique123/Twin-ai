// Supabase Edge Function: clip-asset
//
// create → PUT the bytes → finalize, for a SCREEN RECORDING (Phase 12 item 13).
// The same two-step the source flow uses, against 0107's clip RPCs.
//
// ── WHY THIS IS NOT A MODE ON `source-asset` ─────────────────────────────
//
// That function has a parity-tested core (`edge-source-parity.test.ts`) whose
// whole value is that the edge and the DB agree about the CAPTURE CONTRACT —
// the recording-script snapshot, its SHA, the intent row. A clip has none of
// that, so a clip mode inside it would be a second code path threaded through
// assertions written about a different thing, and the first confusing change
// would weaken a guarantee about takes to make one about clips.
//
// ── THE EDGE PERFORMS ZERO DIRECT TABLE WRITES ───────────────────────────
//
// Same posture as `source-asset`: `authenticated` cannot write `media_assets`
// (0076), and this function does not write it either. It calls
// `editor_create_clip_asset` / `editor_finalize_clip`, which are service-role
// only and hold every policy decision in one transaction.
//
// The PATH IS NEVER TAKEN FROM THE CLIENT. The RPC derives it from the owner
// and generation, and the signed upload URL is minted for exactly that path.
//
// Deploy: automatic, via .github/workflows/deploy-edge.yml on push to main.
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Closed keysets. An unexpected field is refused rather than ignored: a client
// sending `storage_path` is a client that believes it chooses one, and silently
// dropping it would leave that belief intact until it mattered.
const CREATE_KEYS = new Set(['action', 'generation_id', 'recording_attempt_id', 'content_type', 'size_bytes', 'label'])
const FINALIZE_KEYS = new Set(['action', 'asset_id', 'size_bytes'])

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

  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return json({ error: 'Invalid JSON body' }, 400) }
  if (b === null || typeof b !== 'object') return json({ error: 'Invalid body' }, 400)

  if (b.action === 'create') {
    for (const k of Object.keys(b)) {
      if (!CREATE_KEYS.has(k)) return json({ error: `Unexpected field: ${k}` }, 400)
    }
    const generationId = String(b.generation_id ?? '').trim()
    const attemptId = String(b.recording_attempt_id ?? '').trim()
    if (!UUID_RE.test(generationId)) return json({ error: 'generation_id (uuid) is required' }, 400)
    if (!UUID_RE.test(attemptId)) return json({ error: 'recording_attempt_id (uuid) is required' }, 400)
    const contentType = String(b.content_type ?? '').trim()
    const sizeBytes = typeof b.size_bytes === 'number' && Number.isInteger(b.size_bytes) ? b.size_bytes : null
    if (sizeBytes === null) return json({ error: 'size_bytes (integer) is required' }, 400)
    const label = b.label === undefined || b.label === null ? null : String(b.label).slice(0, 200)

    // Bound the storage a stuck retry loop can consume. The RPC enforces the
    // real caps; this stops a runaway client reaching it hundreds of times.
    const { data: rateOk } = await admin.rpc('check_rate_limit', {
      p_user: user.id, p_action: 'clip_asset', p_max: 20, p_window_secs: 60,
    })
    if (rateOk === false) return json({ error: 'Too many clips at once — give it a few seconds.' }, 429)

    const { data, error } = await admin.rpc('editor_create_clip_asset', {
      p_owner: user.id,
      p_generation: generationId,
      p_attempt: attemptId,
      p_bucket: BUCKET,
      p_mime: contentType,
      p_size_bytes: sizeBytes,
      p_label: label,
    })
    if (error) {
      // The RPC's codes are the product's vocabulary. Passed through rather than
      // flattened, so the client can say "you have 12 clips already" instead of
      // "something went wrong".
      const msg = error.message ?? 'Could not start that clip.'
      const status = msg.includes('clip_forbidden') ? 403
        : msg.includes('clip_limit_reached') || msg.includes('clip_quota_exceeded') ? 409
        : msg.includes('clip_attempt_conflict') ? 409
        : 400
      return json({ error: msg }, status)
    }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return json({ error: 'Could not start that clip.' }, 500)

    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET).createSignedUploadUrl(row.storage_path, { upsert: true })
    if (signErr || !signed) return json({ error: 'Could not authorize the upload.' }, 500)

    return json({
      asset_id: row.asset_id,
      bucket: BUCKET,
      path: row.storage_path,
      token: signed.token,
      signed_url: signed.signedUrl,
      content_type: contentType,
      created: row.created,
    })
  }

  if (b.action === 'finalize') {
    for (const k of Object.keys(b)) {
      if (!FINALIZE_KEYS.has(k)) return json({ error: `Unexpected field: ${k}` }, 400)
    }
    const assetId = String(b.asset_id ?? '').trim()
    if (!UUID_RE.test(assetId)) return json({ error: 'asset_id (uuid) is required' }, 400)
    const sizeBytes = typeof b.size_bytes === 'number' && Number.isInteger(b.size_bytes) ? b.size_bytes : null
    if (sizeBytes === null) return json({ error: 'size_bytes (integer) is required' }, 400)

    // THE OBJECT MUST ACTUALLY BE THERE. Marking a row ready on the client's say
    // so would put a clip in the creator's list that plays nothing — the same
    // check `source-asset` makes, for the same reason.
    const { data: asset } = await admin
      .from('media_assets').select('id, owner_id, storage_path, status, kind')
      .eq('id', assetId).eq('owner_id', user.id).maybeSingle()
    if (!asset) return json({ error: 'Clip not found' }, 404)
    if (asset.kind !== 'clip') return json({ error: 'That asset is not a clip' }, 400)
    if (asset.status === 'ready') return json({ ok: true, status: 'ready' })

    const head = await fetch(
      `${supabaseUrl}/storage/v1/object/${BUCKET}/${asset.storage_path.split('/').map(encodeURIComponent).join('/')}`,
      { method: 'HEAD', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    )
    if (!head.ok) return json({ error: 'The upload has not arrived yet — retry in a moment.' }, 409)

    const { data: fin, error: finErr } = await admin.rpc('editor_finalize_clip', {
      p_owner: user.id, p_asset: assetId, p_size_bytes: sizeBytes,
    })
    if (finErr) return json({ error: finErr.message ?? 'Could not finish that clip.' }, 400)
    return json({ ok: true, status: (fin as { status?: string } | null)?.status ?? 'ready' })
  }

  return json({ error: 'Unknown action' }, 400)
})
