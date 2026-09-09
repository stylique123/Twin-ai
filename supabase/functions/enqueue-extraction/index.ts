// Supabase Edge Function: enqueue-extraction
//
// ⚠️ THIS EXISTS BECAUSE THE BROWSER'S INSERT WAS DENIED FOR FOUR WEEKS AND
// NOBODY SAW IT. `requestProductExtraction` inserted straight into `jobs` from
// the page. Migration 0030 dropped the "user enqueue autoedit" policy —
// deliberately, to close a credit leak — and `jobs` has carried only SELECT
// policies since. Every "Read the page" tap has been refused by RLS ever
// since: 12 products in production, 5 with URLs, 0 with knowledge, and the
// last `extract_product` job of any kind was 2026-08-12.
//
// ⚖️ SO THE FIX IS A CREDENTIALED ENQUEUER, NOT A NEW INSERT POLICY. Re-adding
// a browser INSERT on `jobs` would reopen exactly the leak 0030 closed — a
// page that can write `jobs` can write any job type, any payload, any count.
// This verifies the caller owns the entity and enqueues with the service role,
// the same shape as ingest-reference.
//
// Deploy: supabase functions deploy enqueue-extraction

import { createClient } from 'jsr:@supabase/supabase-js@2.112.2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })

  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated' }, 401)

  let body: { entity_id?: string; url?: string; image_paths?: unknown }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

  const entityId = String(body.entity_id ?? '').trim()
  const url = String(body.url ?? '').trim()
  const imagePaths = Array.isArray(body.image_paths)
    ? body.image_paths.filter((p): p is string => typeof p === 'string' && p.trim() !== '')
    : []

  if (entityId === '') return json({ error: 'Which product? entity_id is required.' }, 400)
  // ⚖️ THE SAME TWO REFUSALS THE PAGE MAKES, MADE AGAIN HERE. The page's copy of
  // them exists so a creator is told immediately; this copy is the one that
  // protects a credentialed process, and it cannot rely on the first having run.
  if (url === '' && imagePaths.length === 0) {
    return json({ error: 'Add a link or at least one photo so Twin has something to read.' }, 400)
  }
  if (url !== '' && !/^https:\/\//i.test(url)) return json({ error: 'Please paste a full https:// link.' }, 400)
  if (url.length > 2048) return json({ error: 'That link is too long to read.' }, 400)

  // ⚠️ OWNERSHIP IS CHECKED AGAINST THE ROW, NOT AGAINST A CLAIM IN THE BODY.
  // The old signature took an `ownerId` argument, which under the service role
  // would be an instruction rather than a fact: any signed-in caller could have
  // enqueued a read against anyone's entity. The caller's token decides.
  const { data: entity, error: readErr } = await admin
    .from('product_entities').select('id, owner_id').eq('id', entityId).maybeSingle()
  if (readErr) {
    console.error('enqueue-extraction: entity read failed', readErr)
    return json({ error: 'Could not start reading that product. Please try again.' }, 500)
  }
  // ⚖️ A MISSING ROW AND SOMEONE ELSE'S ROW GET THE SAME ANSWER. Distinguishing
  // them would turn this into an oracle for which entity ids exist.
  if (!entity || (entity as { owner_id?: string }).owner_id !== user.id) {
    return json({ error: 'That product could not be found.' }, 404)
  }

  // Fetching and reading pages is real compute — rate-limit per user, the same
  // mechanism ingest uses.
  const { data: allowed } = await admin.rpc('check_rate_limit', {
    p_user: user.id, p_action: 'extract_product', p_max: 40, p_window_secs: 3600,
  })
  if (allowed === false) {
    return json({ error: "You've added a lot of products recently — give it a few minutes." }, 429)
  }

  // ⚠️ ONLY REAL PATHS, AND NEVER AN EMPTY ARRAY — an absent key and `[]` mean
  // the same thing to the worker, and storing the second creates a fourth state
  // that reads as "images were supplied" to anyone counting.
  const payload: Record<string, unknown> = imagePaths.length > 0
    ? { entity_id: entityId, url, image_paths: imagePaths }
    : { entity_id: entityId, url }

  const { data: job, error } = await admin
    .from('jobs')
    .insert({ owner_id: user.id, type: 'extract_product', status: 'queued', max_attempts: 3, payload })
    .select('id')
    .single()
  if (error || !job) {
    console.error('enqueue-extraction: enqueue failed', error)
    return json({ error: 'Could not start reading that product. Please try again.' }, 500)
  }

  return json({ job_id: job.id, status: 'queued' })
})
