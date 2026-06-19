// Supabase Edge Function: enqueue-autoedit
// Enqueues an auto-edit job for a recorded take. The FIRST edit of a blueprint
// is free (bundled with the blueprint the user already paid for); each REMAKE
// costs one recreation and is charged atomically here, server-side, before the
// job is queued. A `variation` index lets remakes look different.

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

  let body: { generation_id?: string; take_path?: string; remake?: boolean; variation?: number }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const generationId = (body.generation_id ?? '').trim()
  const takePath = (body.take_path ?? '').trim()
  const variation = Number.isFinite(body.variation) ? Number(body.variation) : 0
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

  // Decide free-vs-paid SERVER-SIDE — never trust a client 'remake' flag for
  // billing. The FIRST auto-edit of a blueprint is free (it's bundled with the
  // recreation the user already paid for when generating it); EVERY edit after
  // that (another take, a remake, a different look) costs one recreation. We
  // determine "first" by counting the blueprint's existing auto-edit jobs, so a
  // user can't get unlimited free videos from one recreation.
  let charge = true
  if (generationId) {
    const { count } = await admin
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .eq('type', 'autoedit')
      .eq('payload->>generation_id', generationId)
      .in('status', ['queued', 'running', 'done'])
    charge = (count ?? 0) > 0
  }
  // No blueprint to anchor a freebie to (e.g. a bare upload) → always charge.

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
      payload: { generation_id: generationId || null, take_path: takePath, variation },
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
