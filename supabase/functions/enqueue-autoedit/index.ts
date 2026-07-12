// Supabase Edge Function: enqueue-autoedit
// Enqueues an auto-edit job for a recorded take. Recording + editing a blueprint
// is FREE — the one recreation was charged at blueprint generation, and that one
// credit covers the whole loop (record, re-record, edit, restyle, refine). The
// only paid path is a bare upload with no blueprint anchor (guarded below).
// A `variation` index lets remakes look different.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const REMAKE_COST = Number(Deno.env.get('EDIT_REMAKE_COST') ?? '10') // 1 recreation

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

  // Abuse cap: each enqueue runs worker compute, and the first edit per take is
  // free, so bound enqueues per user per minute (the remake path is also credit
  // gated below).
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
  // A REFINE carries the creator's edited EDL — they're correcting a video they
  // already paid to make, so it re-renders FREE (rate-limited above, not billed).
  const refineEdl = body.edl && typeof body.edl === 'object' ? body.edl : null
  const isRefine = refineEdl !== null
  if (!takePath) return json({ error: 'take_path is required' }, 400)
  // The take must live in the caller's own storage folder.
  if (!takePath.startsWith(`${user.id}/`)) return json({ error: 'take_path outside your folder' }, 403)

  // If a generation is referenced, it must belong to the caller.
  if (generationId) {
    const { data: gen } = await admin
      .from('generations')
      .select('id')
      .eq('id', generationId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!gen) return json({ error: 'Blueprint not found' }, 404)
  }

  // BILLING MODEL: one recreation = one FULL loop. The credit is charged exactly
  // once, at blueprint generation (generate-blueprint). Recording and editing that
  // blueprint — re-records, restyles, refines, as many attempts as it takes — are
  // FREE, so a creator can perfect their video without burning another recreation.
  // (This is the "1 remix = 1 complete script→video loop" model.)
  //
  // The ONLY paid path here is a bare upload with NO blueprint to anchor it (a raw
  // clip that never cost a recreation). The product flow always sends a
  // generation_id, so real users never hit this — it only stops the raw-upload API
  // from being used to mint unlimited free videos without ever paying for a script.
  const charge = !generationId && !isRefine

  if (charge) {
    const { error: spendErr } = await admin.rpc('spend_credits', {
      p_user: user.id,
      p_amount: REMAKE_COST,
      p_reason: 'edit_extra',
    })
    if (spendErr) {
      if (String(spendErr.message).includes('INSUFFICIENT_CREDITS')) {
        return json({ error: 'You are out of recreations — top up for another edit.' }, 402)
      }
      return json({ error: 'Could not reserve a recreation' }, 500)
    }
  }

  const { data: job, error } = await admin
    .from('jobs')
    .insert({
      owner_id: user.id,
      type: 'autoedit',
      status: 'queued',
      // Stamp the billing outcome so a dead-lettered job refunds the exact charged
      // amount, exactly once, via the trg_refund_failed_autoedit trigger (#4).
      payload: { generation_id: generationId || null, take_path: takePath, variation, charged: charge, cost: REMAKE_COST, ...(refineEdl ? { edl: refineEdl } : {}), ...(shots ? { shots } : {}) },
    })
    .select('id')
    .single()
  if (error) {
    // Best-effort refund if the enqueue failed after charging.
    if (charge) {
      await admin.rpc('refund_credits', { p_user: user.id, p_amount: REMAKE_COST, p_reason: 'edit_extra_refund' }).then(
        () => {},
        () => {},
      )
    }
    return json({ error: 'Could not queue the edit' }, 500)
  }

  return json({ job_id: job.id, charged: charge })
})
