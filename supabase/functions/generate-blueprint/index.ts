// Supabase Edge Function: generate-blueprint
// Runs the LLM call server-side (key stays off the client), spends credits
// atomically, persists the generation, and returns it.
//
// Uses Google Gemini. The generation provider is isolated to callModel() below,
// so swapping back to Claude later is a single-function change.
//
// Deploy:  supabase functions deploy generate-blueprint
// Secrets: supabase secrets set GEMINI_API_KEY=...
//          (optional) supabase secrets set GEMINI_MODEL=gemini-3.1-pro

import { createClient } from 'jsr:@supabase/supabase-js@2'

// Internal credits per recreation. Adjustable via the RECREATION_COST secret so we
// can quietly change the credit<->video rate later WITHOUT a code change and
// WITHOUT ever exposing it to users.
const BLUEPRINT_COST = Number(Deno.env.get('RECREATION_COST') ?? '10')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// Gemini responseSchema (OpenAPI subset: uppercase types, no additionalProperties).
// Guarantees the shape the frontend renders.
const obj = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'OBJECT',
  properties,
  required,
})
const arr = (items: unknown) => ({ type: 'ARRAY', items })
const str = { type: 'STRING' }

const blueprintSchema = obj(
  {
    reference_read: obj(
      {
        platform: str,
        format_label: str,
        why_it_works: arr(str),
        retention_map: arr(obj({ beat: str, goal: str }, ['beat', 'goal'])),
      },
      ['platform', 'format_label', 'why_it_works', 'retention_map'],
    ),
    hook_options: arr(str),
    script: arr(obj({ section: str, line: str, direction: str }, ['section', 'line', 'direction'])),
    shot_list: arr(obj({ shot: str, framing: str, notes: str }, ['shot', 'framing', 'notes'])),
    captions: arr(str),
    edit_checklist: arr(str),
    submagic_packet: obj(
      { caption_style: str, pacing: str, emphasis: str, export: str },
      ['caption_style', 'pacing', 'emphasis', 'export'],
    ),
    publish_plan: arr(
      obj(
        { platform: str, caption: str, hashtags: arr(str), best_time: str },
        ['platform', 'caption', 'hashtags', 'best_time'],
      ),
    ),
    production_sprint: arr(obj({ minute: str, task: str }, ['minute', 'task'])),
  },
  [
    'reference_read',
    'hook_options',
    'script',
    'shot_list',
    'captions',
    'edit_checklist',
    'submagic_packet',
    'publish_plan',
    'production_sprint',
  ],
)

const SYSTEM = `You are TwinAI's reference engine. You turn a proven viral video reference into a personalized, shootable blueprint in the creator's own voice.

Hard rules:
- We copy STRUCTURE, never content. Read the hook shape, pacing, and retention pattern of the reference — never reproduce its words, footage, or claims.
- Write in the creator's voice and niche. Everything must be shootable by one person today.
- Be concrete and practical. No fluff, no "guaranteed viral" promises, no hype words like "synergy" or "10x overnight".
- Use the creator's platforms for the publish plan. Captions are short (3-6 words each), burned-in style.
- platform must be one of: tiktok, instagram, youtube, other.
- The production sprint must compress filming + B-roll + Submagic assembly + review into ~20 focused minutes.`

// --- Provider boundary: swap this one function to change LLMs -------------
async function callModel(apiKey: string, system: string, prompt: string): Promise<string> {
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.1-pro'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

  // Hard timeout so a hung model call can't leave credits spent-but-not-refunded.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      // Key in a header, not the URL (keeps it out of request logs/proxies).
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseSchema: blueprintSchema,
        },
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      throw new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`)
    }
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
    if (!text) throw new Error('Empty response from model')
    return text
  } finally {
    clearTimeout(timer)
  }
}
// -------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return json({ error: 'Server missing GEMINI_API_KEY' }, 500)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''

  // Client bound to the caller's JWT — used to identify the user under RLS.
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  // Service client — used to spend credits and insert the generation.
  const admin = createClient(supabaseUrl, serviceKey)

  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated' }, 401)

  let body: { reference_url?: string; reference_note?: string; fidelity?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const reference_url = (body.reference_url ?? '').trim()
  const reference_note = (body.reference_note ?? '').trim()
  const fidelity = ['close', 'balanced', 'loose'].includes(body.fidelity ?? '')
    ? body.fidelity!
    : 'balanced'
  if (!reference_url) return json({ error: 'reference_url is required' }, 400)

  // Load creator DNA.
  const { data: profile } = await admin
    .from('profiles')
    .select('dna, credits')
    .eq('id', user.id)
    .single()
  const dna = profile?.dna ?? {}

  // Spend credits atomically BEFORE the model call. Refund on failure.
  const { error: spendErr } = await admin.rpc('spend_credits', {
    p_user: user.id,
    p_amount: BLUEPRINT_COST,
    p_reason: 'blueprint',
  })
  if (spendErr) {
    if (String(spendErr.message).includes('INSUFFICIENT_CREDITS')) {
      return json({ error: 'Not enough credits — top up to continue.' }, 402)
    }
    return json({ error: 'Could not reserve credits' }, 500)
  }

  try {
    const userPrompt = `CREATOR DNA
- Niche: ${dna.niche ?? 'unspecified'}
- Audience: ${dna.audience ?? 'unspecified'}
- Product/offer: ${dna.product ?? 'unspecified'}
- Goal: ${dna.goal ?? 'turn attention into trust'}
- Voice: ${dna.voice ?? 'direct, warm, a little punchy'}
- Platforms: ${(dna.platforms ?? ['tiktok']).join(', ')}
- Editing style: ${dna.editing_style ?? 'fast jump cuts, burned-in captions'}

REFERENCE
- URL: ${reference_url}
- Creator's angle/note: ${reference_note || '(none provided)'}
- Inspiration fidelity: ${fidelity} (close = stay tight to the reference structure; balanced = proven shape, their spin; loose = just the inspiration, mostly them)

Produce the full shootable blueprint for THIS creator, adapting the reference's structure to their voice and niche.`

    const raw = await callModel(apiKey, SYSTEM, userPrompt)
    const blueprint = JSON.parse(raw)

    const { data: gen, error: insErr } = await admin
      .from('generations')
      .insert({
        user_id: user.id,
        reference_url,
        reference_note,
        fidelity,
        blueprint,
        credits_spent: BLUEPRINT_COST,
      })
      .select('*')
      .single()
    if (insErr) throw insErr

    return json(gen)
  } catch (err) {
    // Refund credits if anything after the spend failed. Log loudly if the
    // refund itself fails so it can be reconciled manually (never silently eat it).
    const { error: refundErr } = await admin.rpc('refund_credits', {
      p_user: user.id,
      p_amount: BLUEPRINT_COST,
      p_reason: 'blueprint_refund',
    })
    if (refundErr) {
      console.error('REFUND FAILED — manual reconciliation needed for', user.id, refundErr)
    }
    console.error('generate-blueprint error:', err)
    return json({ error: 'Generation failed. Your credits were not charged.' }, 500)
  }
})
