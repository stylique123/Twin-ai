// Supabase Edge Function: referral
// Two endpoints behind one function (action in the body):
//   { action: 'code' }            -> returns the caller's shareable referral code
//   { action: 'redeem', code }    -> redeems a code, granting BOTH sides a bonus
//
// The reward AMOUNT is read from REFERRAL_REWARD_CREDITS (default 20 = 2 remixes)
// so it can be tuned anytime WITHOUT a code change. The DB owns the atomic,
// abuse-safe grant (one redemption per invitee, new-signup window, no self-refer).
//
// Deploy:  supabase functions deploy referral
// Secrets: (optional) supabase secrets set REFERRAL_REWARD_CREDITS=20

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// 20 internal credits = 2 remixes. Tunable via secret, never exposed to users.
const REWARD = Number(Deno.env.get('REFERRAL_REWARD_CREDITS') ?? '20')

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

  let body: { action?: string; code?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  // Get (or lazily allocate) the caller's own shareable code.
  if (body.action === 'code') {
    const { data, error } = await admin.rpc('ensure_referral_code', { p_user: user.id })
    if (error) {
      console.error('referral: ensure_referral_code failed', error)
      return json({ error: 'Could not load your referral code' }, 500)
    }
    return json({ code: data as string })
  }

  // Redeem someone else's code.
  if (body.action === 'redeem') {
    const code = (body.code ?? '').trim()
    if (!code) return json({ error: 'A referral code is required' }, 400)

    // Bound redeem attempts so codes can't be brute-forced.
    const { data: allowed } = await admin.rpc('check_rate_limit', {
      p_user: user.id,
      p_action: 'referral_redeem',
      p_max: 10,
      p_window_secs: 3600,
    })
    if (allowed === false) return json({ ok: false, reason: 'rate_limited' }, 429)

    const { data, error } = await admin.rpc('redeem_referral', {
      p_invitee: user.id,
      p_code: code,
      p_reward: REWARD,
    })
    if (error) {
      console.error('referral: redeem failed', error)
      return json({ ok: false, reason: 'error' }, 500)
    }
    return json(data)
  }

  return json({ error: 'Unknown action' }, 400)
})
