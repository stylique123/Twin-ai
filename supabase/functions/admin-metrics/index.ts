// Supabase Edge Function: admin-metrics
// Returns the metrics_overview KPI rollup for the data room / live dashboard.
// Admin-gated: only platform admins (platform_admins table) can read it; the view
// itself is revoked from authenticated, so this service-role path is the only way in.
//
// Deploy: supabase functions deploy admin-metrics

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

  const { data: isAdmin } = await admin.rpc('is_platform_admin', { p_user: user.id })
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  // Case-study lookup: { email } -> one creator's rollup for an investor one-pager.
  let body: { email?: string } = {}
  try { body = await req.json() } catch { /* no body = overview */ }
  const email = (body.email ?? '').trim().toLowerCase()
  if (email) {
    const { data: prof } = await admin
      .from('profiles')
      .select('id, email, display_name, plan, created_at')
      .ilike('email', email)
      .maybeSingle()
    if (!prof) return json({ error: 'No user with that email' }, 404)
    const { data: cs } = await admin.rpc('user_case_study', { p_user: prof.id })
    return json({ case_study: { ...(cs ?? {}), email: prof.email, name: prof.display_name, plan: prof.plan, joined: prof.created_at } })
  }

  const [{ data, error }, { data: funnel }, { data: retention }] = await Promise.all([
    admin.from('metrics_overview').select('*').single(),
    admin.rpc('activation_funnel'),
    admin.rpc('retention_curve'),
  ])
  if (error) {
    console.error('admin-metrics: query failed', error)
    return json({ error: 'Could not load metrics' }, 500)
  }
  return json({ ...(data ?? {}), funnel: funnel ?? null, retention: retention ?? null })
})
