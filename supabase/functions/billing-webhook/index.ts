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
// MUST match src/lib/brand.ts grant() so the credits granted == the advertised
// allowance (Starter 8→100, Pro 20→240, Agency 75→830, incl. the hidden buffer).
const PLAN_CREDITS: Record<string, number> = {
  aspiring: Number(Deno.env.get('PLAN_CREDITS_ASPIRING') ?? '80'),
  professional: Number(Deno.env.get('PLAN_CREDITS_PROFESSIONAL') ?? '180'),
  studio: Number(Deno.env.get('PLAN_CREDITS_STUDIO') ?? '400'),
  agency: Number(Deno.env.get('PLAN_CREDITS_AGENCY') ?? '880'),
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
  variantId?: string // the variant/price the user ACTUALLY paid for (anti-spoof)
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
    // M10: require a stable provider id (webhook_id or data.id); never invent one.
    const lsEventId = body?.meta?.webhook_id ?? body?.data?.id
    if (!lsEventId) return fail
    return {
      ok: true,
      eventId: String(lsEventId),
      userId,
      active: /created|payment_success|updated/.test(name) && /active|paid|on_trial/.test(status || 'active'),
      externalId: body?.data?.id ? String(body.data.id) : undefined,
      periodEnd: body?.data?.attributes?.renews_at ?? null,
      variantId: body?.data?.attributes?.variant_id != null ? String(body.data.attributes.variant_id) : undefined,
    }
  }
  if (provider === 'stripe') {
    const secret = env('STRIPE_WEBHOOK_SECRET')
    const header = headers.get('Stripe-Signature') ?? ''
    const t = header.match(/t=([0-9]+)/)?.[1]
    const v1 = header.match(/v1=([a-f0-9]+)/)?.[1]
    if (!secret || !t || !v1 || !safeEqual(await hmacHex(secret, `${t}.${raw}`), v1)) return fail
    // H8: reject a valid-but-stale/replayed signature outside a 5-minute tolerance
    // (Stripe's standard). Without this a captured payload could be replayed forever.
    const skew = Math.abs(Date.now() / 1000 - Number(t))
    if (!Number.isFinite(skew) || skew > 300) return fail
    const body = JSON.parse(raw)
    // M10: a signed payment event MUST carry Stripe's stable event id; never invent one
    // (a random UUID would let a replayed malformed payload bypass idempotency).
    if (!body?.id) return fail
    const obj = body?.data?.object ?? {}
    const userId = obj?.metadata?.user_id ?? obj?.client_reference_id ?? null
    const type = body?.type ?? ''
    return {
      ok: true,
      eventId: String(body.id),
      userId,
      active: /checkout\.session\.completed|invoice\.paid|customer\.subscription\.(created|updated)/.test(type),
      externalId: obj?.subscription ? String(obj.subscription) : obj?.id ? String(obj.id) : undefined,
      periodEnd: obj?.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null,
      variantId: obj?.items?.data?.[0]?.price?.id ?? obj?.plan?.id ?? undefined,
    }
  }
  // Crypto / Fasset / manual: no provider signature. A trusted operator (admin
  // panel, or a chain watcher) confirms the payment with BILLING_ADMIN_SECRET.
  if (provider === 'crypto' || provider === 'fasset' || provider === 'manual') {
    const adminSecret = env('BILLING_ADMIN_SECRET')
    const given = headers.get('X-Admin-Secret') ?? ''
    if (!adminSecret || !safeEqual(adminSecret, given)) return fail
    const body = JSON.parse(raw)
    // M10: a manual/crypto confirmation must supply a stable event_id so a resend is
    // idempotent (a random UUID would re-grant credits on every retry).
    if (!body?.event_id) return fail
    return {
      ok: true,
      eventId: String(body.event_id),
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

  // ANTI-SPOOF: derive the plan from the variant the user ACTUALLY paid for (in the
  // verified payload), NOT the client-seeded subscriptions row — otherwise a user
  // could seed plan='agency' then pay for the cheaper variant and still get agency.
  // Fall back to the seeded plan only when no variant ids are configured (and warn).
  const env2 = (k: string) => Deno.env.get(k)
  const planFromVariant = (v: string | undefined): string | null => {
    if (!v) return null
    for (const p of ['aspiring', 'professional', 'studio', 'agency']) {
      if (env2(`LS_VARIANT_${p.toUpperCase()}`) === v || env2(`STRIPE_PRICE_${p.toUpperCase()}`) === v) return p
    }
    return null
  }
  const { data: sub } = await admin.from('subscriptions').select('plan').eq('user_id', parsed.userId).maybeSingle()
  const verifiedPlan = planFromVariant(parsed.variantId)
  // Enforce what the comment above promises: the seeded-plan fallback is ONLY for
  // deployments with no variant→plan mapping configured at all. If a mapping IS
  // configured and this paid variant matches none of it, granting the seeded plan
  // would let a user seed 'agency', pay any cheap/foreign variant, and get agency —
  // so refuse the grant and page ops instead.
  const variantMapConfigured = ['aspiring', 'professional', 'studio', 'agency'].some(
    (p) => env2(`LS_VARIANT_${p.toUpperCase()}`) || env2(`STRIPE_PRICE_${p.toUpperCase()}`),
  )
  if (!verifiedPlan && variantMapConfigured) {
    await admin.from('ops_events').insert({ kind: 'billing_plan_unverified', severity: 'critical', user_id: parsed.userId, detail: { variant: parsed.variantId ?? null, seeded: sub?.plan ?? null, reason: 'variant map configured but event variant matched no plan; grant REFUSED' } }).then(() => {}, () => {})
    await markProcessed(admin, parsed.eventId, 'unmatched variant — grant refused')
    return json({ ok: true, note: 'unmatched variant — no grant' })
  }
  const plan = verifiedPlan ?? sub?.plan ?? 'aspiring'
  if (!verifiedPlan) {
    await admin.from('ops_events').insert({ kind: 'billing_plan_unverified', severity: 'warn', user_id: parsed.userId, detail: { granted: plan, variant: parsed.variantId ?? null, reason: 'no variant map configured; granted from seeded intent' } }).then(() => {}, () => {})
  }

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
    // Set the balance to the monthly allowance (with modest carryover), NOT add it
    // every event — otherwise renewals + subscription.updated stack credits unbounded.
    // max() guarantees they always have at least the full month, never less.
    await admin
      .from('profiles')
      .update({
        plan,
        credits: Math.max(prof?.credits ?? 0, grant),
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
