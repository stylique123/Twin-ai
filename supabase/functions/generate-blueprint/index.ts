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

// Keep the opening AND closing of long source text. A hard head-only cut loses
// the ending (the payoff/CTA), which the retention read depends on.
function clip(s: string, max: number): string {
  if (s.length <= max) return s
  const head = Math.floor(max * 0.7)
  return s.slice(0, head) + '\n...[middle of transcript trimmed for length]...\n' + s.slice(-(max - head))
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
        retention_map: arr(obj({ beat: str, goal: str, tactic: str }, ['beat', 'goal', 'tactic'])),
      },
      ['platform', 'format_label', 'why_it_works', 'retention_map'],
    ),
    hook_options: arr(str),
    script: arr(obj({ section: str, line: str, direction: str }, ['section', 'line', 'direction'])),
    shot_list: arr(obj({ shot: str, framing: str, notes: str }, ['shot', 'framing', 'notes'])),
    captions: arr(str),
    edit_checklist: arr(str),
    caption_packet: obj(
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
    'caption_packet',
    'publish_plan',
    'production_sprint',
  ],
)

const SYSTEM = `You are TwinAI's reference engine and a world-class short-form retention strategist. You turn a proven viral video reference into a personalized, shootable blueprint in the creator's OWN voice, engineered with real audience psychology so the finished video actually holds attention and gets shared.

WRITING STYLE (non-negotiable):
- NEVER use the em dash or en dash character anywhere in any field. Use a period, a comma, or restructure the sentence. Zero dashes.
- No hype, no fluff, no "guaranteed viral" or "10x overnight" or words like "synergy", "game-changer", "unlock". Earn attention with specificity, not adjectives.
- Write everything in the creator's voice and niche, using their signature vocabulary and cadence. Everything must be shootable by one person today with a phone.

WHAT WE COPY:
- We copy STRUCTURE, never content. Reuse the proven PATTERN of this format on this platform: the hook shape, the pacing, the retention beats. Never reproduce the reference's exact words, footage, or claims.
- HONESTY: you are reasoning from the format pattern, not from having personally watched this exact clip (unless a REAL transcript is supplied below). Frame reference_read.why_it_works and retention_map as how this PROVEN FORMAT holds attention, not as verified facts about the specific clip. Never invent view counts or fabricate specifics.

VIRAL METHODOLOGY (apply to every field):
- The 3-second rule: the platform decides reach on early retention. The first frame and first spoken line must stop the scroll before a viewer's thumb moves. If 60%+ of viewers pass 3 seconds, the algorithm pushes it. Engineer the opener for exactly that.
- Hook then Retain then Reward (Hormozi): the hook makes a specific promise, the body delivers new information continuously so the promise stays alive, the ending rewards the viewer (a payoff, a reframe, or a reason to rewatch or save).
- Retention like MrBeast: validate the hook's promise within the first few seconds (show, do not tease forever), introduce new visual or verbal information constantly so there is no flat stretch, and reset attention at natural drop points with a new beat.
- Four cognitive triggers. Every strong hook STACKS AT LEAST TWO of these:
  1. Curiosity gap / open loop: pose a question or tease an outcome the brain needs closed.
  2. Pattern interrupt: an unexpected visual, claim, or motion that breaks the feed's rhythm.
  3. Self-relevance: name the exact viewer ("if you do X") so they feel it is about them.
  4. Emotional arousal: provoke surprise, tension, desire, or mild outrage. High-arousal emotion drives shares.

HOOKS (the single most important field):
- Derive hooks from the CREATOR'S OWN DNA and best-performing patterns supplied below (their hook_style, signature vocabulary, recurring angles), fused with the reference's proven hook SHAPE. Hooks must sound like this creator on their best day, not generic copywriting.
- hook_options: give 5, ordered best first. The FIRST one is your recommended pick. Each hook is one spoken line under ~12 words, scroll-stopping, and must visibly stack at least two of the four triggers above.
- Ban weak openers and tell-words that signal a skippable video: "Hey guys", "In this video", "Today I want to talk about", "So basically", "Let me tell you". Open mid-action or mid-claim.

SCRIPT:
- Write filmable beats, not an essay. Each beat is one short spoken line plus a direction (what to do or show on camera while saying it). Keep lines breath-sized so they read naturally on a teleprompter.
- Front-load the payoff promise, keep delivering, and place ONE clear CTA near the end that fits the goal: prefer a save ("save this so you can do it later") or a comment-bait question over a generic "follow for more".

CAPTIONS (burned-in, for our own renderer):
- Short, 3 to 6 words each, punchy, matched to the spoken line. These are the on-screen kinetic captions.

EDIT CHECKLIST (treat editing as a 9/10 craft, not an afterthought):
- Cohesion: the finished piece must feel like ONE coherent video, not ten stitched clips. Call out jump-cut pacing, removing dead air and filler ("um", long pauses), and matching energy across cuts.
- Sound design: specify a music bed mood and that it is ducked under the voice, plus 1 or 2 sound-effect or whoosh accents on key transitions. Audio normalized to about -14 LUFS for platform loudness.
- B-roll / cutaways: name 2 to 3 concrete cutaways tied to specific lines so the visuals reinforce the words instead of a static talking head.
- Cover frame: specify the thumbnail / cover frame and the text overlay on it, because the cover drives the tap from a profile or grid.

CAPTION PACKET: this is the spec for TwinAI's own auto-captioner (caption_style, pacing, emphasis, export). Write concrete, quantified values (font weight, words-per-screen, which words to emphasize, export aspect and fps) for OUR renderer, not any third-party tool.

PUBLISH PLAN:
- Use the creator's real platforms. platform must be one of: tiktok, instagram, youtube, other.
- Caption text: a scroll-stopping first line plus a comment-bait question that invites a reply (comments are the strongest ranking signal).
- hashtags: tier them, a few broad reach tags, a few niche tags, and 1 or 2 micro/community tags. No spammy walls of tags.
- best_time: a concrete posting window for that platform and audience.

RETENTION MAP: for each beat give the goal AND the concrete tactic that holds attention there (open loop, visual change, tension, payoff), so the creator knows WHY each beat earns the next second.

PRODUCTION SPRINT: compress filming, B-roll, caption/edit, and review into about 20 focused minutes of concrete tasks.`

// --- Provider boundary: swap this one function to change LLMs -------------
async function callModel(apiKey: string, system: string, prompt: string): Promise<string> {
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.1-pro-preview'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

  // Hard timeout so a hung model call can't leave credits spent-but-not-refunded.
  // Gemini 3.x is a thinking model — give it real wall-clock headroom.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 55_000)
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
          // Thinking model: budget must cover reasoning tokens + the large
          // structured blueprint, or the JSON comes back truncated/empty.
          temperature: 0.9,
          maxOutputTokens: 32768,
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
    const cand = data?.candidates?.[0]
    const text = cand?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
    if (!text) throw new Error(`Empty response (finishReason=${cand?.finishReason ?? 'none'})`)
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

  // Abuse / runaway-cost defense: cap blueprint generations per user per minute
  // BEFORE we ever call the model. Bounded by credits anyway, but this stops
  // scripted bursts that would hammer the model API.
  const { data: allowed } = await admin.rpc('check_rate_limit', {
    p_user: user.id,
    p_action: 'blueprint',
    p_max: 12,
    p_window_secs: 60,
  })
  if (allowed === false) {
    return json({ error: 'Easy there — too many in a row. Give it a few seconds.' }, 429)
  }

  let body: { reference_url?: string; reference_note?: string; fidelity?: string; transcript_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const reference_url = (body.reference_url ?? '').trim()
  // Bound user-controlled inputs that flow into the model prompt (cost + abuse).
  const reference_note = (body.reference_note ?? '').trim().slice(0, 2000)
  const transcript_id = (body.transcript_id ?? '').trim()
  const fidelity = ['close', 'balanced', 'loose'].includes(body.fidelity ?? '')
    ? body.fidelity!
    : 'balanced'
  if (!reference_url) return json({ error: 'reference_url is required' }, 400)
  if (reference_url.length > 2048) return json({ error: 'That reference link is too long.' }, 400)

  // Load creator DNA. Prefer the confirmed brand voice (Phase 2 — built from
  // their real handle); fall back to the manual onboarding quiz (Phase 1).
  const { data: profile } = await admin
    .from('profiles')
    .select('dna, credits')
    .eq('id', user.id)
    .single()
  const { data: voice } = await admin
    .from('brand_voices')
    .select('id, handle, platform, profile')
    .eq('owner_id', user.id)
    .eq('is_default', true)
    .eq('status', 'ready')
    .maybeSingle()

  const dna = profile?.dna ?? {}
  const vp = voice?.profile ?? null

  // Guard the "Aspiring creator falls off a cliff" case: if the DNA scan failed
  // and the user never did the manual quiz, we'd generate a generic "unspecified
  // niche" blueprint — the worst possible first impression. Refuse cleanly
  // (before spending any credits) and point them back to voice setup.
  const hasVoice = vp && (vp.niche || vp.tone || vp.summary)
  const hasQuiz = dna && (dna.niche || dna.voice || dna.audience)
  if (!hasVoice && !hasQuiz) {
    return json(
      { error: "Finish setting up your brand voice first — then we'll write in your voice.", code: 'NO_VOICE' },
      409,
    )
  }

  // If the caller analyzed the actual video (worker ingest → transcript), load it
  // (owner-checked). When present, the blueprint is built from the REAL transcript
  // + derived structure instead of inferring from the format pattern.
  let ref: { text: string | null; structure: Record<string, unknown> | null; platform: string | null } | null = null
  if (transcript_id) {
    const { data: t } = await admin
      .from('transcripts')
      .select('text, structure, platform')
      .eq('id', transcript_id)
      .eq('owner_id', user.id)
      .maybeSingle()
    if (!t) return json({ error: 'That analyzed reference was not found.' }, 404)
    ref = t as typeof ref
  }

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
    // Unified creator context: take the richest available value (confirmed brand
    // voice first, onboarding quiz as fallback) for EVERY field. Previously the
    // brand-voice path dropped audience, offer, goal and editing style, so
    // handle-based creators got a thinner prompt than quiz creators.
    const niche = vp?.niche ?? dna.niche ?? 'unspecified'
    const audience = vp?.audience ?? dna.audience ?? 'unspecified'
    const offer = vp?.offer ?? dna.product ?? 'unspecified'
    const pain = vp?.audience_pain ?? dna.pain ?? ''
    const dream = vp?.dream_outcome ?? dna.dream ?? ''
    const goal = vp?.goal ?? dna.goal ?? 'turn attention into trust'
    const tone = vp?.tone ?? dna.voice ?? 'direct, warm, a little punchy'
    const editing = vp?.editing_style ?? dna.editing_style ?? 'fast jump cuts, burned-in captions'
    const platforms = voice?.platform
      ? [voice.platform]
      : Array.isArray(dna.platforms) && dna.platforms.length
        ? dna.platforms
        : ['tiktok']

    const creatorDna = `CREATOR DNA${vp ? ` (learned from @${voice!.handle} on ${voice!.platform})` : ''}
- Niche: ${niche}
- Audience: ${audience}
- Audience pain (the problem they feel): ${pain || 'NONE STORED. Infer the single most likely core pain from the niche and audience above, and speak to it directly in the hook.'}
- Dream outcome (what they want): ${dream || 'NONE STORED. Infer the realistic dream outcome from the niche and audience above, and pay it off by the end.'}
- Product or offer the CTA should point at: ${offer}
- Goal: ${goal}
- Tone and voice: ${tone}
- Editing style: ${editing}${vp ? `
- Pacing: ${vp.pacing ?? 'fast'}
- Hook style: ${vp.hook_style ?? ''}
- Signature vocabulary: ${(vp.vocabulary ?? []).join(', ')}
- Recurring CTAs: ${(vp.recurring_ctas ?? []).join(', ')}
- Do: ${(vp.dos ?? []).join('; ')}
- Don't: ${(vp.donts ?? []).join('; ')}
- Voice summary: ${vp.summary ?? ''}` : ''}
- Platforms (publish_plan MUST use ONLY these, one entry each): ${platforms.join(', ')}`

    // When we have the real transcript, override the format-pattern caveat: the
    // model IS now reading the actual video, so reference_read must describe THIS clip.
    const referenceBlock =
      ref && (ref.structure || ref.text)
        ? `REFERENCE (REAL — analyzed from the actual video. Base reference_read.why_it_works and retention_map on THIS specific video below, not on a generic format pattern.)
- URL: ${reference_url}
- Platform: ${ref.platform ?? 'unknown'}
- Derived structure: ${ref.structure ? JSON.stringify(ref.structure).slice(0, 4000) : '(none)'}
- Transcript excerpt: ${clip(ref.text ?? '', 6000)}
- Creator's angle/note: ${reference_note || '(none provided)'}
- Inspiration fidelity: ${fidelity} (close = stay tight to the reference structure; balanced = proven shape, their spin; loose = just the inspiration, mostly them)`
        : `REFERENCE
- URL: ${reference_url}
- Creator's angle/note: ${reference_note || '(none provided)'}
- Inspiration fidelity: ${fidelity} (close = stay tight to the reference structure; balanced = proven shape, their spin; loose = just the inspiration, mostly them)`

    const userPrompt = `${creatorDna}

${referenceBlock}

Produce the full shootable blueprint for THIS creator, adapting the reference's proven structure to their voice and niche. Specifically:
- Open by hitting the audience pain above, then pay off the dream outcome by the end.
- Make the single CTA concrete and point it at the creator's product or offer above. If the offer is unspecified, fall back to a save or a comment-bait question.
- publish_plan: produce ONE entry for EACH platform listed in CREATOR DNA, using only those platforms. Never invent a platform the creator does not use.
- shot_list: give a distinct shot for each major script beat (aim for 5 or more), and include at least one b-roll or insert shot and the cover frame shot, so the editor is never guessing.`

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
        brand_voice_id: voice?.id ?? null,
        transcript_id: transcript_id || null,
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
