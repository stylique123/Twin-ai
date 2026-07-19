// Supabase Edge Function: start-editor-v2 (editor v2, Phase 2)
//
// The ONLY way an edit begins. The browser sends exactly:
//   { generation_id, source_asset_id, idempotency_key }
// — never storage paths, URLs, transcripts, cuts, captions, prompts, model
// settings, or FFmpeg options. The server derives everything else.
//
// Checks, in order: auth → strict body shape → rate limit → generation
// ownership → source eligibility (owner-strict, kind=source, status=ready,
// has_audio, editor_eligible, generation match) → active-project quota →
// atomic editor_start_project() (one project + one queued editor_v2 job).
//
// Phase-2 boundary: the job stays queued — no worker handler exists yet
// (Phase 3), no AI provider or renderer is called, no credit is charged.
//
// Product rule (documented): only the OWNER starts an edit on their
// generation. Workspace peers can VIEW projects/events via RLS but cannot
// start, exactly like recording.
//
// Deploy:  supabase functions deploy start-editor-v2

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_KEYS = new Set(['generation_id', 'source_asset_id', 'idempotency_key'])
// Active projects per owner (across sources). Modest: a creator edits one or
// two videos at a time; a queue of dozens is not a person.
const MAX_ACTIVE_PROJECTS = Number(Deno.env.get('EDITOR_MAX_ACTIVE_PROJECTS') ?? '3')

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // FAIL-CLOSED launch gate. Production has no editor_v2 worker handler until
  // Phase 3 — an authenticated caller must not be able to park jobs in a queue
  // nothing drains. The switch is SERVER environment only (missing/anything
  // but 'true' = disabled); no request field can influence it. Staging sets it
  // to true for the gate matrices; production stays disabled until Phase 3's
  // controlled rollout.
  if ((Deno.env.get('EDITOR_V2_START_ENABLED') ?? '').trim().toLowerCase() !== 'true') {
    return json({ error: 'AI editing is not available yet.', code: 'editor_not_available' }, 503)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const admin = createClient(supabaseUrl, serviceKey)

  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated' }, 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  // STRICT body shape: any extra field (a path, a prompt, an option) is a
  // contract violation, not something to silently ignore.
  for (const k of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(k)) return json({ error: `Unexpected field: ${k}` }, 400)
  }
  const generationId = String(body.generation_id ?? '').trim()
  const sourceAssetId = String(body.source_asset_id ?? '').trim()
  const idempotencyKey = String(body.idempotency_key ?? '').trim().toLowerCase()
  if (!UUID_RE.test(generationId)) return json({ error: 'generation_id (uuid) is required' }, 400)
  if (!UUID_RE.test(sourceAssetId)) return json({ error: 'source_asset_id (uuid) is required' }, 400)
  if (!UUID_RE.test(idempotencyKey)) return json({ error: 'idempotency_key (uuid) is required' }, 400)

  const { data: rateOk } = await admin.rpc('check_rate_limit', {
    p_user: user.id, p_action: 'start_editor', p_max: 10, p_window_secs: 60,
  })
  if (rateOk === false) return json({ error: 'Too many edit requests — give it a few seconds.' }, 429)

  // An idempotency key binds to ONE set of inputs, forever. Reuse with a
  // different generation/source is a conflict — never silently answered with
  // an unrelated project. (The RPC re-checks this atomically under a row lock;
  // this early check just gives the clean 409 in the common case.)
  const { data: keyed } = await admin
    .from('edit_projects')
    .select('id, generation_id, source_asset_id')
    .eq('owner_id', user.id)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()
  if (keyed && (keyed.generation_id !== generationId || keyed.source_asset_id !== sourceAssetId)) {
    return json({ error: 'That request key was already used for a different edit.', code: 'idempotency_key_conflict' }, 409)
  }

  // Generation: must exist and belong to the caller (owner-strict).
  const { data: gen } = await admin
    .from('generations')
    .select('id, user_id')
    .eq('id', generationId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!gen) return json({ error: 'Generation not found' }, 404)

  // Source eligibility — every rejection happens BEFORE any project or job
  // exists, with a stable code the UI can translate.
  const { data: asset } = await admin
    .from('media_assets')
    .select('id, owner_id, generation_id, kind, status, has_audio, metadata')
    .eq('id', sourceAssetId)
    .maybeSingle()
  if (!asset || asset.owner_id !== user.id) {
    return json({ error: 'Source recording not found', code: 'source_not_found' }, 404)
  }
  if (asset.kind !== 'source') {
    return json({ error: 'That asset is not a source recording.', code: 'not_a_source' }, 409)
  }
  if (asset.generation_id !== generationId) {
    return json({ error: 'That recording belongs to a different video.', code: 'generation_mismatch' }, 409)
  }
  if (asset.status === 'rejected') {
    return json({ error: 'That recording failed validation — please re-record.', code: 'source_rejected' }, 409)
  }
  if (asset.status === 'deleted') {
    return json({ error: 'That recording was deleted.', code: 'source_deleted' }, 409)
  }
  if (asset.status !== 'ready') {
    return json({ error: 'Your recording is still being checked — try again in a moment.', code: 'source_not_ready' }, 409)
  }
  if (asset.has_audio === false || (asset.metadata as { editor_eligible?: boolean } | null)?.editor_eligible === false) {
    return json({
      error: 'This recording has no speech to edit — AI editing needs audio.',
      code: 'source_not_editor_eligible',
    }, 409)
  }

  // Active-project quota (across sources). The per-source active-uniqueness is
  // enforced inside editor_start_project by the database itself.
  const { count: active } = await admin
    .from('edit_projects')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
    .not('status', 'in', '("completed","failed","cancelled")')
  if ((active ?? 0) >= MAX_ACTIVE_PROJECTS) {
    return json({ error: 'You already have edits in progress — let them finish first.', code: 'too_many_active_projects' }, 429)
  }

  // Atomic: one project + one queued editor_v2 job. Idempotent and race-safe
  // at the database (unique keys + dedup-keyed job insert).
  const { data: proj, error: startErr } = await admin.rpc('editor_start_project', {
    p_owner: user.id, p_generation: generationId, p_source: sourceAssetId, p_idempotency: idempotencyKey,
  })
  if (startErr?.message?.includes('idempotency_conflict')) {
    return json({ error: 'That request key was already used for a different edit.', code: 'idempotency_key_conflict' }, 409)
  }
  if (startErr || !proj) return json({ error: 'Could not start the edit — try again.' }, 500)

  return json({
    projectId: (proj as { id: string }).id,
    status: (proj as { status: string }).status,
  })
})
