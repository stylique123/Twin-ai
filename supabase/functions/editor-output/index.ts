// Supabase Edge Function: editor-output (editor v2, Phase 8 Batch 8.6)
//
// THE ONLY WAY A FINISHED EDIT IS FETCHED.
//
// Phase 8 made the renderer real: a completed project now has a validated video
// and cover in the private `edits` bucket. Nothing could reach them. The client
// can already SELECT the rows — `edit_projects`, `edit_outputs` and
// `media_assets` all grant owner reads — and then cannot download a single byte,
// because the bucket's object policies (0006/0057) key on the owner id being the
// FIRST path segment and the server-derived path is
// `edit-outputs/<owner>/<project>/<attempt>/…`.
//
// WHY A SIGNING ENDPOINT AND NOT A STORAGE POLICY
//
// A policy for the `edit-outputs/` prefix would be fewer lines and is the wrong
// shape. Whether a creator may download a finished video is a PRODUCT question —
// entitlement, plan tier, watermarking, revocation — and a storage policy has
// nowhere to put any of that. Signing here keeps one authorization seam that can
// grow a condition later without a migration, which is what `review`, `social`
// and `generate-thumbnail` already do for finished edits.
//
// OWNER-STRICT, DELIBERATELY.
//
// `media_assets` lets workspace peers read the row (0076); `edit_outputs` does
// NOT (0094 — `owner_id = auth.uid()`, no peer clause). The two disagree, and
// this endpoint follows the STRICTER one, because `edit_outputs` is the table
// that actually governs rendered artifacts and was written after they existed.
// Letting peers download is a product decision with a real blast radius; it is
// not something to infer from a policy written before there was anything to
// download. Widening it is one clause here, once someone decides.
//
// WHAT THIS NEVER DOES
//
// It never takes a path, a bucket, or an asset id from the caller. The caller
// names a PROJECT; everything else is read from rows the database already holds.
// A caller-supplied path is a path that can be wrong, and the same rule already
// governs `editor_reserve_output`.
//
// NOT GATED BY `EDITOR_V2_START_ENABLED`
//
// That switch decides whether new edits may BEGIN. Reusing it here would mean
// that turning off new edits also makes every already-finished video
// unplayable — a different and much worse decision than the one the switch was
// created to express.
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
const ALLOWED_KEYS = new Set(['project_id'])

// Long enough to watch a vertical video and to survive a paused tab; short
// enough that a leaked URL is not a permanent grant. Signed URLs cannot be
// revoked, so the TTL is the only revocation there is.
const TTL_SECONDS = 60 * 60

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated' }, 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  // STRICT body shape. A `path`, `bucket` or `asset_id` arriving here is a
  // contract violation worth refusing loudly, not ignoring quietly.
  for (const k of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(k)) return json({ error: `Unexpected field: ${k}` }, 400)
  }
  const projectId = String(body.project_id ?? '').trim()
  if (!UUID_RE.test(projectId)) return json({ error: 'project_id (uuid) is required' }, 400)

  const { data: rateOk } = await admin.rpc('check_rate_limit', {
    p_user: user.id, p_action: 'editor_output', p_max: 30, p_window_secs: 60,
  })
  if (rateOk === false) return json({ error: 'Too many requests — give it a few seconds.' }, 429)

  const { data: proj } = await admin
    .from('edit_projects')
    .select('id, owner_id, status, output_asset_id')
    .eq('id', projectId)
    .maybeSingle()

  // NOT FOUND AND NOT YOURS ARE THE SAME ANSWER. Distinguishing them turns this
  // endpoint into an oracle for which project ids exist.
  if (!proj || proj.owner_id !== user.id) {
    return json({ error: 'No finished edit for that project.', code: 'output_not_found' }, 404)
  }

  // A project that has not completed has nothing to serve, and saying so by
  // status is useful rather than leaky — the caller already owns the row and can
  // read the same status directly.
  if (proj.status !== 'completed') {
    return json({ error: 'That edit has not finished.', code: 'output_not_ready', status: proj.status }, 409)
  }
  // The scaffold state, which production still produces with the render flag
  // unset: `completed` with no output. It is NOT an error condition and must not
  // be reported as a broken edit — there is simply no video, by design.
  if (!proj.output_asset_id) {
    return json({ error: 'That edit produced no video.', code: 'output_absent' }, 409)
  }

  const { data: outputs } = await admin
    .from('edit_outputs')
    .select('kind, state, storage_bucket, storage_path, bytes, sha256, measured_duration_ms')
    .eq('edit_project_id', projectId)

  const rows = (outputs ?? []) as Array<{
    kind: string; state: string; storage_bucket: string; storage_path: string
    bytes: number | null; sha256: string | null; measured_duration_ms: number | null
  }>
  const video = rows.find((o) => o.kind === 'video')
  const cover = rows.find((o) => o.kind === 'cover')

  // READY is what `editor_mark_output_ready` sets only once the file has been
  // probed and its measurements recorded. Signing a reserved-but-not-ready row
  // would hand out a URL for bytes that may not exist.
  if (!video || video.state !== 'ready') {
    return json({ error: 'No finished video for that project.', code: 'output_not_found' }, 404)
  }

  // The asset the project COMPLETED onto must be the video that was rendered.
  // `editor_complete_output` already reconciles bucket, path, owner, digest and
  // kind before it will complete, so this cannot fail through that path — it is
  // here because "cannot" is a claim about today's writers, and the thing being
  // handed out is a URL to a file.
  const { data: asset } = await admin
    .from('media_assets')
    .select('id, owner_id, kind, status, bucket, storage_path, mime_type, duration_ms, width, height')
    .eq('id', proj.output_asset_id)
    .maybeSingle()
  const a = asset as {
    owner_id: string; kind: string; status: string; bucket: string; storage_path: string
    mime_type: string | null; duration_ms: number | null; width: number | null; height: number | null
  } | null
  if (!a || a.owner_id !== user.id || a.kind !== 'output' || a.status !== 'ready'
    || a.bucket !== video.storage_bucket || a.storage_path !== video.storage_path) {
    return json({ error: 'No finished edit for that project.', code: 'output_not_found' }, 404)
  }

  const sign = async (bucket: string, path: string): Promise<string | null> => {
    const { data } = await admin.storage.from(bucket).createSignedUrl(path, TTL_SECONDS)
    return data?.signedUrl ?? null
  }
  const videoUrl = await sign(video.storage_bucket, video.storage_path)
  // A signing failure is a SERVER fault, not "no output". Reporting it as 404
  // would tell the creator their finished video does not exist.
  if (!videoUrl) return json({ error: 'Could not prepare the video for playback.', code: 'sign_failed' }, 502)

  // The cover is best-effort ON PURPOSE: it is a poster frame, and a video that
  // plays without one is a far better outcome than refusing the video because
  // its thumbnail could not be signed.
  const coverUrl = cover && cover.state === 'ready'
    ? await sign(cover.storage_bucket, cover.storage_path)
    : null

  return json({
    projectId,
    outputAssetId: proj.output_asset_id,
    videoUrl,
    coverUrl,
    expiresInSeconds: TTL_SECONDS,
    // The MEASURED duration, which is what `editor_create_output_asset` records
    // off the probed file — never the plan's promised length. A player that
    // seeks against a promise seeks past the end.
    durationMs: a.duration_ms,
    width: a.width,
    height: a.height,
    mimeType: a.mime_type,
    bytes: video.bytes,
    sha256: video.sha256,
  })
})
