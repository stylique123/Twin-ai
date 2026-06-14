// Supabase Edge Function: billing-webhook
// The ONLY place a paid plan is granted. A processor calls this after payment;
// we verify the signature, log the event idempotently (so a replay can never
// double-grant), then flip the user's subscription to active, set their plan,
// and top up their monthly recreations. Provider-agnostic: each processor has a
// small verify+parse adapter; the activation logic is shared.
//
//   POST /billing-webhook?provider=lemonsqueezy   (or ?provider=stripe, etc.)
//
// Secrets:
//   LEMONSQUEEZY_WEBHOOK_SECRET, STRIPE_WEBHOOK_SECRET
//   PLAN_CREDITS_ASPIRING / _PROFESSIONAL / _AGENCY  (optional overrides)
//   BILLING_ADMIN_SECRET  (lets a trusted caller confirm crypto/manual payments)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Monthly recreations granted per plan, x10 = internal credits (1 recreation = 10).
// Tunable via env without a redeploy.
const PLAN_CREDITS: Record<string, number> = {
  aspiring: Number(Deno.env.get('PLAN_CREDITS_ASPIRING') ?? '150'),
  professional: Number(Deno.env.get('PLAN_CREDITS_PROFESSIONAL') ?? '290'),
  agency: Number(Deno.env.get('PLAN_CREDITS_AGENCY') ?? '990'),
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Constant-time-ish compare (length + char) to avoid trivial timing leaks.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

interface ParsedEvent {
  ok: boolean
  eventId: string
  userId: string | null
  active: boolean // true => grant, false => revoke/cancel
  externalId?: string
  periodEnd?: string | null
}

// Per-provider verify + parse. Returns ok=false if the signature is invalid.
async function verifyAndParse(
  provider: string,
  raw: string,
  headers: Headers,
  env: (k: string) => string | undefined,
): Promise<ParsedEvent> {
  const fail: ParsedEvent = { ok: false, eventId: '', userId: null, active: false }
  if (provider === 'lemonsqueezy') {
    const secret = env('LEMONSQUEEZY_WEBHOOK_SECRET')
    const sig = headers.get('X-Signature') ?? ''
    if (!secret || !safeEqual(await hmacHex(secret, raw), sig)) return fail
    const body = JSON.parse(raw)
    const name = body?.meta?.event_name ?? ''
    const userId = body?.meta?.custom_data?.user_id ?? null
    const status = body?.data?.attributes?.status ?? ''
    return {
      ok: true,
      eventId: String(body?.meta?.webhook_id ?? body?.data?.id ?? crypto.randomUUID()),
      userId,
      active: /created|payment_success|updated/.test(name) && /active|paid|on_trial/.test(status || 'active'),
      externalId: body?.data?.id ? String(body.data.id) : undefined,
      periodEnd: body?.data?.attributes?.renews_at ?? null,
    }
  }
  if (provider === 'stripe') {
    const secret = env('STRIPE_WEBHOOK_SECRET')
    const header = headers.get('Stripe-Signature') ?? ''
    const t = header.match(/t=([0-9]+)/)?.[1]
    const v1 = header.match(/v1=([a-f0-9]+)/)?.[1]
    if (!secret || !t || !v1 || !safeEqual(await hmacHex(secret, `${t}.${raw}`), v1)) return fail
    const body = JSON.parse(raw)
    const obj = body?.data?.object ?? {}
    const userId = obj?.metadata?.user_id ?? obj?.client_reference_id ?? null
    const type = body?.type ?? ''
    return {
      ok: true,
      eventId: String(body?.id ?? crypto.randomUUID()),
      userId,
      active: /checkout\.session\.completed|invoice\.paid|customer\.subscription\.(created|updated)/.test(type),
      externalId: obj?.subscription ? String(obj.subscription) : obj?.id ? String(obj.id) : undefined,
      periodEnd: obj?.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null,
    }
  }
  // Crypto / Fasset / manual: no provider signature. A trusted operator (admin
  // panel, or a chain watcher) confirms the payment with BILLING_ADMIN_SECRET.
  if (provider === 'crypto' || provider === 'fasset' || provider === 'manual') {
    const adminSecret = env('BILLING_ADMIN_SECRET')
    const given = headers.get('X-Admin-Secret') ?? ''
    if (!adminSecret || !safeEqual(adminSecret, given)) return fail
    const body = JSON.parse(raw)
    return {
      ok: true,
      eventId: String(body?.event_id ?? crypto.randomUUID()),
      userId: body?.user_id ?? null,
      active: body?.active !== false,
      externalId: body?.tx ? String(body.tx) : undefined,
      periodEnd: body?.period_end ?? null,
    }
  }
  return fail
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const env = (k: string) => Deno.env.get(k)
  const url = new URL(req.url)
  const provider = (url.searchParams.get('provider') ?? env('BILLING_PROVIDER') ?? 'lemonsqueezy').toLowerCase()

  const raw = await req.text()
  const parsed = await verifyAndParse(provider, raw, req.headers, env)
  if (!parsed.ok) return json({ error: 'Invalid signature' }, 401)

  const admin = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!)

  // Idempotency gate: insert the event first. A duplicate (same provider+id) hits
  // the unique constraint and we no-op, so a replayed webhook never re-grants.
  const { error: dupErr } = await admin
    .from('billing_events')
    .insert({ provider, event_type: 'webhook', external_event_id: parsed.eventId, user_id: parsed.userId, payload: safeJson(raw) })
  if (dupErr) {
    // Unique violation (Postgres 23505) = a replayed event; safely no-op.
    if ((dupErr as { code?: string }).code === '23505') return json({ ok: true, duplicate: true })
    // Any OTHER insert failure: fail CLOSED (5xx so the processor retries) rather
    // than granting credits with no idempotency record, which would allow replay.
    console.error('billing_events insert failed', dupErr)
    return json({ error: 'Could not record billing event' }, 503)
  }

  if (!parsed.userId) {
    await markProcessed(admin, parsed.eventId, 'no user_id on event')
    return json({ ok: true, note: 'no user_id' })
  }

  // Read the pending intent to learn which plan was being purchased.
  const { data: sub } = await admin.from('subscriptions').select('plan').eq('user_id', parsed.userId).maybeSingle()
  const plan = sub?.plan ?? 'aspiring'

  if (parsed.active) {
    await admin.from('subscriptions').upsert(
      {
        user_id: parsed.userId,
        provider,
        plan,
        status: 'active',
        external_id: parsed.externalId ?? null,
        current_period_end: parsed.periodEnd ?? null,
      },
      { onConflict: 'user_id' },
    )
    // Grant the plan + top up credits. account_type flips to agency for the
    // agency plan so multi-brand workspaces unlock.
    const grant = PLAN_CREDITS[plan] ?? 0
    const { data: prof } = await admin.from('profiles').select('credits').eq('id', parsed.userId).maybeSingle()
    await admin
      .from('profiles')
      .update({
        plan,
        credits: (prof?.credits ?? 0) + grant,
        ...(plan === 'agency' ? { account_type: 'agency' } : {}),
      })
      .eq('id', parsed.userId)
  } else {
    // Cancellation / failure: drop to free, keep any remaining credits.
    await admin.from('subscriptions').update({ status: 'canceled' }).eq('user_id', parsed.userId)
    await admin.from('profiles').update({ plan: 'free' }).eq('id', parsed.userId)
  }

  await markProcessed(admin, parsed.eventId, null)
  return json({ ok: true, provider, plan, active: parsed.active })
})

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return { raw: raw.slice(0, 2000) }
  }
}

async function markProcessed(admin: ReturnType<typeof createClient>, eventId: string, error: string | null) {
  await admin.from('billing_events').update({ processed: error === null, error }).eq('external_event_id', eventId)
}
