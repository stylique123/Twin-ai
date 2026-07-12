// Supabase Edge Function: enqueue-autoedit
// Enqueues an auto-edit job for a recorded take. Every edit MUST anchor to a
// blueprint (generation) the caller owns — that generation already paid the one
// recreation, so recording + editing (record, re-record, edit, restyle, refine)
// is FREE, and no orphan edit jobs can exist to drift the stats. A `variation`
// index lets remakes look different.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })

  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated' }, 401)

  // Abuse cap: each enqueue runs worker compute and editing is free, so bound
  // enqueues per user per minute.
  const { data: allowed } = await admin.rpc('check_rate_limit', {
    p_user: user.id,
    p_action: 'autoedit',
    p_max: 20,
    p_window_secs: 60,
  })
  if (allowed === false) {
    return json({ error: 'Easy there — too many edits in a row. Give it a few seconds.' }, 429)
  }

  let body: { generation_id?: string; take_path?: string; remake?: boolean; variation?: number; edl?: unknown; shots?: { bounds?: unknown; total?: unknown; lines?: unknown; segments?: unknown } }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const generationId = (body.generation_id ?? '').trim()
  const takePath = (body.take_path ?? '').trim()
  const variation = Number.isFinite(body.variation) ? Number(body.variation) : 0
  // Per-shot capture metadata (optional) — cut points + the script line per shot, so the
  // worker captions each segment from the script. Validated + clamped; ignored if malformed.
  const sb = body.shots
  // Optional per-scene keep-windows [{start,end,line}] — enables per-scene Retake by
  // dropping flubbed footage between windows. Validated + clamped; ignored if malformed.
  const rawSeg = sb && Array.isArray((sb as { segments?: unknown }).segments) ? ((sb as { segments: unknown[] }).segments) : []
  const segments = rawSeg
    .slice(0, 60)
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .filter((s) => typeof s.start === 'number' && typeof s.end === 'number' && Number.isFinite(s.start as number) && Number.isFinite(s.end as number) && (s.end as number) > (s.start as number))
    .map((s) => ({ start: s.start as number, end: s.end as number, line: String((s as { line?: unknown }).line ?? '').slice(0, 400) }))
  const baseValid = !!(sb && Array.isArray(sb.bounds) && Array.isArray(sb.lines) && typeof sb.total === 'number' && sb.total > 1
    && (sb.bounds as unknown[]).every((n) => typeof n === 'number' && Number.isFinite(n)))
  const shots = baseValid
    ? { bounds: (sb!.bounds as number[]).slice(0, 50), total: sb!.total as number, lines: (sb!.lines as unknown[]).slice(0, 60).map((s) => String(s).slice(0, 400)), ...(segments.length > 1 ? { segments } : {}) }
    : (segments.length > 1 ? { bounds: [], total: segments.length, lines: segments.map((s) => s.line), segments } : null)
  // A REFINE carries the creator's edited EDL — a correction to a video they
  // already made (free, rate-limited above, not billed).
  const refineEdl = body.edl && typeof body.edl === 'object' ? body.edl : null
  if (!takePath) return json({ error: 'take_path is required' }, 400)
  // The take must live in the caller's own storage folder.
  if (!takePath.startsWith(`${user.id}/`)) return json({ error: 'take_path outside your folder' }, 403)

  // Every edit MUST anchor to a blueprint the caller owns. This keeps the jobs
  // table in lockstep with generations — no orphan edit jobs, so the Dashboard
  // (which counts finished remixes) can never drift from the Library again. The
  // DB constraint `autoedit_requires_generation` enforces the same rule as a
  // backstop, so an ownerless edit job is impossible at every layer.
  if (!generationId) return json({ error: 'generation_id is required' }, 400)
  const { data: gen } = await admin
    .from('generations')
    .select('id')
    .eq('id', generationId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!gen) return json({ error: 'Blueprint not found' }, 404)

  // BILLING: one recreation = one FULL loop, charged once at blueprint generation
  // (generate-blueprint). Recording and editing that blueprint — re-records,
  // restyles, refines, as many attempts as it takes — is FREE, because every edit
  // is anchored to a generation that already paid for it (required above). Nothing
  // is charged here.

  const { data: job, error } = await admin
    .from('jobs')
    .insert({
      owner_id: user.id,
      type: 'autoedit',
      status: 'queued',
      payload: { generation_id: generationId, take_path: takePath, variation, charged: false, cost: 0, ...(refineEdl ? { edl: refineEdl } : {}), ...(shots ? { shots } : {}) },
    })
    .select('id')
    .single()
  if (error) return json({ error: 'Could not queue the edit' }, 500)

  return json({ job_id: job.id, charged: false })
})
