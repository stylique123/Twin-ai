// Supabase Edge Function: admin
// Super-admin API. Every call is gated on membership in platform_admins (checked
// server-side with the service role), so being an admin is never something a
// client can claim. Read actions return platform health; write actions mutate a
// user and are recorded in admin_audit_log. This is the backend for /admin.
//
//   POST { action: "overview" }                         -> platform stats
//   POST { action: "users", q?, limit?, offset? }       -> user list
//   POST { action: "grant_plan", user_id, plan, credits? }
//   POST { action: "adjust_credits", user_id, delta, reason? }
//   POST { action: "set_admin", user_id, on }            -> add/remove an admin

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const PLANS = ['free', 'aspiring', 'professional', 'studio', 'agency']

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const env = (k: string) => Deno.env.get(k)
  const supabaseUrl = env('SUPABASE_URL')!
  const admin = createClient(supabaseUrl, env('SUPABASE_SERVICE_ROLE_KEY')!)
  const userClient = createClient(supabaseUrl, env('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })

  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated' }, 401)

  // Gate: must be a platform admin. Checked with the service role so RLS can't be
  // tricked, and it can never be self-granted from the client.
  const { data: adminRow } = await admin.from('platform_admins').select('role').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return json({ error: 'Forbidden' }, 403)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const action = String(body.action ?? 'overview')

  // Privilege gate: read actions (overview/users) are fine for any admin role,
  // but credit/plan grants and roster changes are superadmin-only (matches the
  // SQL design intent that only superadmins manage entitlements and the roster).
  const role = (adminRow as { role?: string }).role
  if (['grant_plan', 'adjust_credits', 'set_admin'].includes(action) && role !== 'superadmin') {
    return json({ error: 'Forbidden: superadmin required for this action' }, 403)
  }

  const count = async (table: string, build?: (q: any) => any): Promise<number> => {
    let q = admin.from(table).select('*', { count: 'exact', head: true })
    if (build) q = build(q)
    const { count: c } = await q
    return c ?? 0
  }
  const audit = (a: string, target: string | null, detail: unknown) =>
    admin.from('admin_audit_log').insert({ admin_id: user.id, action: a, target_user: target, detail })

  try {
    if (action === 'overview') {
      const since7 = new Date(Date.now() - 7 * 864e5).toISOString()
      const since24 = new Date(Date.now() - 864e5).toISOString()
      const [users, new7, gens, gens24, qd, failed, takes, posts] = await Promise.all([
        count('profiles'),
        count('profiles', (q) => q.gte('created_at', since7)),
        count('generations'),
        count('generations', (q) => q.gte('created_at', since24)),
        count('jobs', (q) => q.eq('status', 'queued')),
        count('jobs', (q) => q.eq('status', 'failed')),
        count('jobs', (q) => q.eq('type', 'autoedit')),
        count('posts', (q) => q.eq('status', 'posted')),
      ])
      // MRR + paying customers from active subscriptions.
      const { data: subs } = await admin.from('subscriptions').select('amount_cents,plan').eq('status', 'active')
      const mrrCents = (subs ?? []).reduce((s, r: { amount_cents: number | null }) => s + (r.amount_cents ?? 0), 0)
      const byPlan: Record<string, number> = {}
      for (const r of subs ?? []) byPlan[(r as { plan: string }).plan] = (byPlan[(r as { plan: string }).plan] ?? 0) + 1
      // Abuse signal: rate-limit hits in the last 24h.
      const rate24 = await count('rate_events', (q) => q.gte('created_at', since24))
      return json({
        users,
        new_users_7d: new7,
        generations: gens,
        generations_24h: gens24,
        jobs_queued: qd,
        jobs_failed: failed,
        edits: takes,
        posts,
        paying_customers: (subs ?? []).length,
        mrr_usd: mrrCents / 100,
        subscriptions_by_plan: byPlan,
        rate_hits_24h: rate24,
      })
    }

    if (action === 'users') {
      const q = String(body.q ?? '').trim()
      const limit = Math.min(100, Number(body.limit ?? 50))
      const offset = Math.max(0, Number(body.offset ?? 0))
      let sel = admin
        .from('profiles')
        .select('id,email,display_name,plan,credits,account_type,onboarded,created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
      if (q) sel = sel.ilike('email', `%${q}%`)
      const { data, error } = await sel
      if (error) throw error
      return json({ users: data ?? [] })
    }

    if (action === 'grant_plan') {
      const userId = String(body.user_id ?? '')
      const plan = String(body.plan ?? '')
      if (!userId || !PLANS.includes(plan)) return json({ error: 'user_id and a valid plan are required' }, 400)
      const credits = Number.isFinite(Number(body.credits)) ? Number(body.credits) : null
      const patch: Record<string, unknown> = { plan, ...(plan === 'agency' ? { account_type: 'agency' } : {}) }
      // Clamp to non-negative — a negative balance would make every spend fail
      // permanently (matches the guard in adjust_credits).
      if (credits !== null) patch.credits = Math.max(0, credits)
      const { error } = await admin.from('profiles').update(patch).eq('id', userId)
      if (error) throw error
      await admin.from('subscriptions').upsert(
        { user_id: userId, provider: 'manual', plan, status: plan === 'free' ? 'inactive' : 'active' },
        { onConflict: 'user_id' },
      )
      await audit('grant_plan', userId, { plan, credits })
      return json({ ok: true })
    }

    if (action === 'adjust_credits') {
      const userId = String(body.user_id ?? '')
      const delta = Number(body.delta ?? 0)
      if (!userId || !Number.isFinite(delta) || delta === 0) return json({ error: 'user_id and non-zero delta required' }, 400)
      const { data: prof } = await admin.from('profiles').select('credits').eq('id', userId).maybeSingle()
      const next = Math.max(0, (prof?.credits ?? 0) + delta)
      const { error } = await admin.from('profiles').update({ credits: next }).eq('id', userId)
      if (error) throw error
      await admin.from('credit_events').insert({ user_id: userId, delta, reason: String(body.reason ?? 'admin_adjust') })
      await audit('adjust_credits', userId, { delta, next })
      return json({ ok: true, credits: next })
    }

    if (action === 'set_admin') {
      const userId = String(body.user_id ?? '')
      const on = body.on !== false
      if (!userId) return json({ error: 'user_id required' }, 400)
      if (on) await admin.from('platform_admins').upsert({ user_id: userId, role: 'admin', granted_by: user.id }, { onConflict: 'user_id' })
      else await admin.from('platform_admins').delete().eq('user_id', userId)
      await audit('set_admin', userId, { on })
      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    console.error('admin error:', err)
    return json({ error: 'Admin action failed' }, 500)
  }
})
