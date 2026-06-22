// Supabase Edge Function: billing
// Provider-agnostic checkout. TwinAI never hardcodes one processor: the active
// "bank" is chosen by the BILLING_PROVIDER secret, and the USER simply pays with
// any card (Visa/Mastercard/Amex) or wallet through whatever processor we run.
// Adding a processor is one adapter below, never an app rewrite.
//
//   POST { action: "checkout", plan }  -> { url } | { kind:"crypto", ... } | { kind:"manual", ... }
//   POST { action: "status" }          -> the caller's subscription row
//
// Secrets (only the active provider's are needed):
//   BILLING_PROVIDER          stripe|paddle|lemonsqueezy|payoneer|fasset|crypto|manual  (default lemonsqueezy)
//   APP_URL                   https://app.twinai...   (success/cancel redirect base)
//   LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID, LS_VARIANT_<PLAN>
//   STRIPE_SECRET_KEY, STRIPE_PRICE_<PLAN>
//   CRYPTO_WALLET, CRYPTO_ASSET  (e.g. a USDT/USDC address)  — also used by fasset

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Internal plan catalog. amount is monthly USD cents; the processor charges it in
// whatever card/currency the user has. Free needs no checkout.
const PLANS: Record<string, { amount: number; label: string }> = {
  aspiring: { amount: 900, label: 'Starter' },
  professional: { amount: 2400, label: 'Pro' },
  agency: { amount: 7900, label: 'Agency' },
}

interface CheckoutArgs {
  plan: string
  amount: number
  userId: string
  email: string
  appUrl: string
  env: (k: string) => string | undefined
  admin: ReturnType<typeof createClient>
}
type CheckoutResult =
  | { kind: 'redirect'; url: string }
  | { kind: 'crypto'; asset: string; address: string; amount_usd: number }
  | { kind: 'manual'; message: string }
  | { kind: 'unconfigured'; provider: string; needs: string[] }

// --- Provider registry. Each adapter turns a plan into a next step. ----------
const PROVIDERS: Record<
  string,
  { label: string; kind: 'card' | 'crypto' | 'manual'; checkout: (a: CheckoutArgs) => Promise<CheckoutResult> }
> = {
  // Merchant-of-record: best default before an LLC exists. Real checkout when keys present.
  lemonsqueezy: {
    label: 'LemonSqueezy',
    kind: 'card',
    checkout: async ({ plan, userId, email, appUrl, env }) => {
      const key = env('LEMONSQUEEZY_API_KEY')
      const store = env('LEMONSQUEEZY_STORE_ID')
      const variant = env(`LS_VARIANT_${plan.toUpperCase()}`)
      if (!key || !store || !variant)
        return { kind: 'unconfigured', provider: 'lemonsqueezy', needs: ['LEMONSQUEEZY_API_KEY', 'LEMONSQUEEZY_STORE_ID', `LS_VARIANT_${plan.toUpperCase()}`] }
      const res = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/vnd.api+json', Accept: 'application/vnd.api+json' },
        body: JSON.stringify({
          data: {
            type: 'checkouts',
            attributes: {
              checkout_data: { email, custom: { user_id: userId } },
              product_options: { redirect_url: `${appUrl}/billing?ok=1` },
            },
            relationships: {
              store: { data: { type: 'stores', id: String(store) } },
              variant: { data: { type: 'variants', id: String(variant) } },
            },
          },
        }),
      })
      if (!res.ok) throw new Error(`LemonSqueezy ${res.status}: ${(await res.text()).slice(0, 200)}`)
      const data = await res.json()
      const url = data?.data?.attributes?.url
      if (!url) throw new Error('LemonSqueezy returned no checkout url')
      return { kind: 'redirect', url }
    },
  },
  // Stripe: lowest fees / most control, once you are the merchant of record.
  stripe: {
    label: 'Stripe',
    kind: 'card',
    checkout: async ({ plan, userId, email, appUrl, env }) => {
      const key = env('STRIPE_SECRET_KEY')
      const price = env(`STRIPE_PRICE_${plan.toUpperCase()}`)
      if (!key || !price)
        return { kind: 'unconfigured', provider: 'stripe', needs: ['STRIPE_SECRET_KEY', `STRIPE_PRICE_${plan.toUpperCase()}`] }
      const form = new URLSearchParams()
      form.set('mode', 'subscription')
      form.set('line_items[0][price]', price)
      form.set('line_items[0][quantity]', '1')
      form.set('success_url', `${appUrl}/billing?ok=1`)
      form.set('cancel_url', `${appUrl}/billing?canceled=1`)
      form.set('customer_email', email)
      form.set('client_reference_id', userId)
      form.set('metadata[user_id]', userId)
      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      })
      if (!res.ok) throw new Error(`Stripe ${res.status}: ${(await res.text()).slice(0, 200)}`)
      const data = await res.json()
      if (!data?.url) throw new Error('Stripe returned no checkout url')
      return { kind: 'redirect', url: data.url }
    },
  },
  // Paddle: merchant-of-record alternative (hosted checkout link from a price).
  paddle: {
    label: 'Paddle',
    kind: 'card',
    checkout: async ({ plan, env }) => {
      const token = env('PADDLE_API_KEY')
      const price = env(`PADDLE_PRICE_${plan.toUpperCase()}`)
      if (!token || !price)
        return { kind: 'unconfigured', provider: 'paddle', needs: ['PADDLE_API_KEY', `PADDLE_PRICE_${plan.toUpperCase()}`] }
      // Paddle checkout is opened client-side with Paddle.js using this price id.
      return { kind: 'manual', message: `Open Paddle checkout for price ${price} via Paddle.js.` }
    },
  },
  // Payoneer: global cards/bank, common in emerging markets. Hosted request link.
  payoneer: {
    label: 'Payoneer',
    kind: 'card',
    checkout: async ({ env }) => {
      const link = env('PAYONEER_CHECKOUT_URL')
      if (!link) return { kind: 'unconfigured', provider: 'payoneer', needs: ['PAYONEER_CHECKOUT_URL'] }
      return { kind: 'redirect', url: link }
    },
  },
  // Fasset: crypto / digital-asset rail. Pay to a configured wallet, confirmed by webhook.
  fasset: {
    label: 'Fasset',
    kind: 'crypto',
    checkout: async ({ amount, env }) => {
      const addr = env('FASSET_WALLET') ?? env('CRYPTO_WALLET')
      const asset = env('FASSET_ASSET') ?? env('CRYPTO_ASSET') ?? 'USDT'
      if (!addr) return { kind: 'unconfigured', provider: 'fasset', needs: ['FASSET_WALLET (or CRYPTO_WALLET)'] }
      return { kind: 'crypto', asset, address: addr, amount_usd: amount / 100 }
    },
  },
  // Generic on-chain wallet: USDT/USDC/BTC/ETH to a configured address.
  crypto: {
    label: 'Crypto wallet',
    kind: 'crypto',
    checkout: async ({ amount, env }) => {
      const addr = env('CRYPTO_WALLET')
      const asset = env('CRYPTO_ASSET') ?? 'USDT'
      if (!addr) return { kind: 'unconfigured', provider: 'crypto', needs: ['CRYPTO_WALLET'] }
      return { kind: 'crypto', asset, address: addr, amount_usd: amount / 100 }
    },
  },
  // Manual: admin grants the plan (invoice / wire). No online checkout.
  manual: {
    label: 'Manual',
    kind: 'manual',
    checkout: async () => ({ kind: 'manual', message: 'Contact us to activate this plan; an admin will enable it.' }),
  },
}

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

  let body: { action?: string; plan?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const action = (body.action ?? 'checkout').trim()

  // Return the caller's current subscription (owner-read RLS also enforces this).
  if (action === 'status') {
    const { data: sub } = await admin.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle()
    return json({ subscription: sub ?? null })
  }

  if (action !== 'checkout') return json({ error: 'Unknown action' }, 400)

  const plan = (body.plan ?? '').trim().toLowerCase()
  const planCfg = PLANS[plan]
  if (!planCfg) return json({ error: 'Unknown plan' }, 400)

  const providerName = (env('BILLING_PROVIDER') ?? 'lemonsqueezy').trim().toLowerCase()
  const provider = PROVIDERS[providerName]
  if (!provider) return json({ error: `Unsupported BILLING_PROVIDER: ${providerName}` }, 500)

  try {
    const result = await provider.checkout({
      plan,
      amount: planCfg.amount,
      userId: user.id,
      email: user.email ?? '',
      appUrl: (env('APP_URL') ?? '').replace(/\/+$/, ''),
      env,
      admin,
    })

    // Record a pending intent so the webhook (or admin) can reconcile it. Never
    // grants the plan here — only a verified webhook flips status to active.
    if (result.kind === 'redirect' || result.kind === 'crypto') {
      await admin.from('subscriptions').upsert(
        {
          user_id: user.id,
          provider: providerName,
          plan,
          status: 'inactive',
          amount_cents: planCfg.amount,
          ...(result.kind === 'crypto' ? { pay_asset: result.asset, pay_address: result.address } : {}),
        },
        { onConflict: 'user_id' },
      )
    }

    return json({ provider: providerName, provider_label: provider.label, plan, ...result })
  } catch (err) {
    console.error('billing checkout error:', err)
    return json({ error: 'Could not start checkout. Please try again.' }, 502)
  }
})
