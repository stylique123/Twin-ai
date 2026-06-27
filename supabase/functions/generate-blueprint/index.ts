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

// Deterministic backstop for the no-dash writing rule: thinking models emit em/en
// dashes anyway, so strip them from every string in the parsed blueprint rather
// than trusting model compliance. A dash used as a separator becomes a comma.
function stripDashes<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/\s*[—–]\s*/g, ', ') as unknown as T
  }
  if (Array.isArray(value)) return value.map(stripDashes) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = stripDashes(v)
    return out as T
  }
  return value
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
    script: arr(
      obj(
        {
          section: str,
          line: str,
          direction: str,
          background: str,
          cuts_info: str,
          action_posing: str,
        },
        ['section', 'line', 'direction', 'background', 'cuts_info', 'action_posing'],
      ),
    ),
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
- AT LEAST TWO of the five hooks must reuse the creator's signature vocabulary or their exact hook FORMULA from CREATOR DNA. A hook that could belong to any creator in this niche is a failure. Rewrite until it is unmistakably THEIRS.
- The five hooks must be genuinely DIFFERENT angles (e.g. a contrarian claim, a specific number, a callout to the exact viewer, a mistake/confession), not five rewordings of one idea. Where CREATOR DNA lists hook_patterns, draw each hook from a DIFFERENT one of THEIR patterns so the variety is in their own voice, not generic. Variety is how the creator can reshoot without repeating themselves.
- If CREATOR DNA gives a point of view or an enemy, let at least one hook take their actual STANCE (assert the belief or name the bad advice they push against). Their opinion is what makes the hook theirs, not a generic fact.
- Ban weak openers and tell-words that signal a skippable video: "Hey guys", "In this video", "Today I want to talk about", "So basically", "Let me tell you". Open mid-action or mid-claim.
- THE FIRST FRAME decides the scroll-stop as much as the first words. In the script's Hook beat direction, name the literal first half-second on screen: the exact shot size, the facial expression, and any on-screen text, so the very first frame already stops the thumb.

SCRIPT & HOOK INTEGRATION:
- Script beats must be realistic, full spoken paragraphs (typically 2 to 4 sentences per beat, not just single short lines), telling the full story for each section (Hook, Setup, Re-hook, CTA). Keep them highly conversational, engaging, and ready for teleprompter reading.
- Make the script beats modular and cohesive. Ensure the transition between the Hook options and Scene 2 (Setup) is grammatically correct and logically seamless for ANY of the 5 hook options. Scene 2 must not repeat or assume specific words from Hook Option 1, but rather flow naturally from any selected hook.
- background: specify the background setup, props, lighting, or visual context for this specific beat. Avoid generic descriptors (e.g. "sitting at desk"). Provide specific, creative visual setups matching the brand DNA.
- cuts_info: specify camera angles, zooms, pacing, and cut locations. Give professional instructions (e.g., "Cut on action to a tight zoom", "Slide-in transition from right to keep pacing", "Fast cut to clean product shot").
- action_posing: specify the creator's physical actions, hand gestures, body language, facial expressions, and positioning (e.g., "Hold product at eye level, point finger, maintain intense eye contact with lens", "Lean forward slightly with a knowing smile, hands open to suggest accessibility").
- KILL THE BORING MIDDLE. Short-form retention dies in the 40-60% stretch, not at the start. Place an explicit RE-HOOK beat around the 40% mark: a second open loop or escalation ("but here is the part nobody tells you", "and this is where it gets weird") that re-promises something new BEFORE the natural drop-off, so the middle never sags. Mark that beat's section as "Re-hook".
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

RETENTION MAP: for each beat give the goal AND the concrete tactic that holds attention there (open loop, visual change, tension, payoff), so the creator knows WHY each beat earns the next second. One beat in the middle MUST be the re-hook that resets attention at the predictable drop-off point.

PRODUCTION SPRINT: compress filming, B-roll, caption/edit, and review into about 20 focused minutes of concrete tasks.

FINAL CHECK (do this before returning): reread every hook and every script line against the CREATOR DNA — their vocabulary, hook patterns, point of view and enemy. If any line could belong to a generic creator in this niche, rewrite it until it is unmistakably this creator's. Confirm there are zero em or en dashes anywhere.`

// --- Provider boundary: swap this one function to change LLMs -------------
async function callModel(apiKey: string, system: string, prompt: string): Promise<string> {
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.1-pro-preview'
  // Bounded thinking by default: unbounded dynamic thinking was the single biggest
  // cost driver of this call (~70%). 8192 is ample for a structured blueprint and
  // keeps COGS predictable. Override via GEMINI_THINKING_BUDGET (0 = unbounded).
  const thinkBudget = Number(Deno.env.get('GEMINI_THINKING_BUDGET') ?? '8192')
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
          // 0.8 (not 0.9): the #1 requirement is voice fidelity across every
          // field; hook VARIETY now comes from the explicit "different angle per
          // hook_pattern" instruction, not raw randomness that drifts off-voice.
          temperature: 0.8,
          maxOutputTokens: 32768,
          responseMimeType: 'application/json',
          responseSchema: blueprintSchema,
          // Speed lever: cap reasoning tokens so the thinking model doesn't
          // over-deliberate. Off (dynamic thinking) unless GEMINI_THINKING_BUDGET
          // is set, so this is a zero-risk default we can tune via a secret.
          ...(thinkBudget > 0 ? { thinkingConfig: { thinkingBudget: thinkBudget } } : {}),
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

  // Team seats: if this user is a member of a workspace, they create IN that
  // workspace — writing in the OWNER's brand voice and spending the OWNER's
  // remixes. Solo users resolve to themselves (no membership row).
  const { data: mem } = await admin
    .from('workspace_members')
    .select('owner_id')
    .eq('member_id', user.id)
    .maybeSingle()
  const ownerId = mem?.owner_id ?? user.id

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
  // Daily cap: a hard backstop on per-user LLM token spend (a bug-loop or abuse
  // can't run thousands of thinking-model calls). Generous vs any real workflow.
  const { data: dailyOk } = await admin.rpc('check_rate_limit', {
    p_user: user.id,
    p_action: 'blueprint_daily',
    p_max: Number(Deno.env.get('BLUEPRINT_DAILY_CAP') ?? '40'),
    p_window_secs: 86400,
  })
  if (dailyOk === false) {
    return json({ error: "You've hit today's generation limit. It resets in a few hours." }, 429)
  }

  let body: { reference_url?: string; reference_note?: string; fidelity?: string; tone?: string; delivery?: string; transcript_id?: string }
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
  // Make fidelity actually change the output, not just be a label. Each level is a
  // hard directive the model must obey when shaping the script + structure.
  const FIDELITY_RULE: Record<string, string> = {
    close:
      'FIDELITY = CLOSE. Mirror the reference almost beat-for-beat: same hook TYPE, the same number and order of retention beats, the same pacing and shot rhythm. Keep the structure tight to the reference; only swap in THIS creator\'s voice, topic and examples. Do not invent new sections the reference does not have.',
    balanced:
      'FIDELITY = BALANCED. Keep the reference\'s proven skeleton (its hook type and the core retention beats) but rewrite it fully in the creator\'s angle, offer and vocabulary. You may merge or reorder minor beats, but the winning structure must remain recognizable.',
    loose:
      'FIDELITY = LOOSE. Use the reference only as light inspiration for the energy and topic. Prioritize the creator\'s OWN angle, offer, hooks and DNA. The structure should follow what is best for the creator, and may diverge substantially from the reference\'s beats.',
  }
  const fidelityRule = FIDELITY_RULE[fidelity]
  // TONE controls delivery energy (independent of fidelity). The panel's founder/B2B
  // persona scored lowest specifically over fear of a "try-hard TikTok" voice in front
  // of buyers — 'understated' is the no-hype mode that converts that segment.
  const tone = ['understated', 'balanced', 'punchy'].includes(body.tone ?? '')
    ? body.tone!
    : 'balanced'
  const TONE_RULE: Record<string, string> = {
    understated:
      'TONE = UNDERSTATED. Write like a credible operator/expert, not a hype creator. No clickbait, no "🤯", no "you won\'t believe", no manufactured urgency, no hashtags in the script. Hooks state a sharp, specific point of view plainly. Confident and calm — the kind of thing a founder could say to a buyer without cringing.',
    balanced:
      'TONE = BALANCED. Natural short-form energy: engaging and lively but not over-the-top. Strong hooks without resorting to bait. This is the default creator voice.',
    punchy:
      'TONE = PUNCHY. High-energy, bold, pattern-interrupting hooks and fast, emphatic delivery. Lean into momentum and big stakes — while staying within the creator\'s DNA and avoiding outright false claims.',
  }
  const toneRule = TONE_RULE[tone]
  // DELIVERY decides whether the creator has to be ON CAMERA. The panel's founder
  // persona wanted a "no-face / voiceover" mode — a script shot entirely as
  // voiceover over screen-recordings, demos and b-roll, so camera-shy founders can
  // still ship. Independent of tone/fidelity.
  const delivery = ['on_camera', 'voiceover'].includes(body.delivery ?? '')
    ? body.delivery!
    : 'on_camera'
  const DELIVERY_RULE: Record<string, string> = {
    on_camera:
      'DELIVERY = ON CAMERA. The creator appears on camera delivering the lines; talking-head framing is fine alongside b-roll.',
    voiceover:
      'DELIVERY = VOICEOVER / NO FACE. The creator does NOT appear on camera. Write every line as voiceover narration, and write each shot DIRECTION as something to SHOW, never a person talking to camera: screen recordings, product/app demos, b-roll, hands / over-the-shoulder, and on-screen text. The hook must land as on-screen text + voiceover. Forbid "talk to camera", "talking head" and "look at lens" directions. Built for founders/B2B who will not film their face.',
  }
  const deliveryRule = DELIVERY_RULE[delivery]
  if (!reference_url) return json({ error: 'reference_url is required' }, 400)
  if (reference_url.length > 2048) return json({ error: 'That reference link is too long.' }, 400)

  // Load creator DNA. Prefer the confirmed brand voice (Phase 2 — built from
  // their real handle); fall back to the manual onboarding quiz (Phase 1).
  const { data: profile } = await admin
    .from('profiles')
    .select('dna, credits')
    .eq('id', ownerId)
    .single()
  const { data: voice } = await admin
    .from('brand_voices')
    .select('id, handle, platform, profile')
    .eq('owner_id', ownerId)
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
    p_user: ownerId,
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

    const subNiche = vp?.sub_niche ?? dna.sub_niche ?? ''
    // Founder/B2B fix (panel): a founder's real voice lives in their TEXT (LinkedIn
    // posts, blog) more than a sparse video scan. If they pasted writing samples,
    // they're the single strongest voice signal — feed them verbatim (bounded).
    const voiceSamples = String((vp as { voice_samples?: string } | null)?.voice_samples ?? dna.voice_samples ?? '').trim().slice(0, 3000)
    const creatorDna = `CREATOR DNA${vp ? ` (learned from @${voice!.handle} on ${voice!.platform})` : ''}
- Niche: ${niche}${subNiche ? `
- Specific angle (what their audience searches for): ${subNiche}` : ''}
- Audience: ${audience}
- Audience pain (the problem they feel): ${pain || 'NONE STORED. Infer the single most likely core pain from the niche and audience above, and speak to it directly in the hook.'}
- Dream outcome (what they want): ${dream || 'NONE STORED. Infer the realistic dream outcome from the niche and audience above, and pay it off by the end.'}
- Product or offer the CTA should point at: ${offer}
- Goal: ${goal}
- Tone and voice: ${tone}
- Editing style: ${editing}${vp ? `
- Pacing: ${vp.pacing ?? 'fast'}
- Hook formula: ${vp.hook_style ?? ''}
- Hook patterns (distinct opener moves — use a DIFFERENT one per hook): ${(vp.hook_patterns ?? []).join(' | ') || '(none captured)'}
- Hooks they ACTUALLY wrote (real winners — study the phrasing, do not copy verbatim): ${(vp.sample_hooks ?? []).join(' / ') || '(none captured)'}
- Signature vocabulary: ${(vp.vocabulary ?? []).join(', ')}
- Recurring CTAs: ${(vp.recurring_ctas ?? []).join(', ')}
- Point of view (beliefs they repeat — the script should carry their stance): ${(vp.pov ?? []).join(' | ') || '(none captured)'}
- Enemy (the bad advice / villain they push against): ${vp.enemy ?? '(none captured)'}
- Do: ${(vp.dos ?? []).join('; ')}
- Don't: ${(vp.donts ?? []).join('; ')}
- Voice summary: ${vp.summary ?? ''}` : ''}${voiceSamples ? `
- HOW THEY ACTUALLY WRITE (verbatim samples — match this EXACT cadence, diction, sentence length and rhythm; weight this above every other signal, it is the most reliable evidence of their true voice): ${voiceSamples}` : ''}
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
- ${fidelityRule}
- ${toneRule}
- ${deliveryRule}
- Open by hitting the audience pain above, then pay off the dream outcome by the end. Carry the creator's point of view through the script, and include the mid-video re-hook beat so the middle never sags.
- Make the single CTA concrete and point it at the creator's product or offer above. If the offer is unspecified, fall back to a save or a comment-bait question.
- publish_plan: produce ONE entry for EACH platform listed in CREATOR DNA, using only those platforms. Never invent a platform the creator does not use.
- shot_list: give a distinct shot for each major script beat (aim for 5 or more), and include at least one b-roll or insert shot and the cover frame shot, so the editor is never guessing.`

    const raw = await callModel(apiKey, SYSTEM, userPrompt)
    const blueprint = stripDashes(JSON.parse(raw))

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

    // Data layer: record the blueprint + the time it saved (≈30 min scripting) for
    // product metrics / the data room. Best-effort — never fail the response on it.
    await admin
      .from('analytics_events')
      .insert({ user_id: user.id, event: 'blueprint_generated', time_saved_minutes: 30, props: { generation_id: gen.id, brand_voice_id: voice?.id ?? null, fidelity, real_video: !!transcript_id } })
      .then(() => {}, () => {})

    return json(gen)
  } catch (err) {
    // Refund credits if anything after the spend failed. Log loudly if the
    // refund itself fails so it can be reconciled manually (never silently eat it).
    const { error: refundErr } = await admin.rpc('refund_credits', {
      p_user: ownerId,
      p_amount: BLUEPRINT_COST,
      p_reason: 'blueprint_refund',
    })
    if (refundErr) {
      console.error('REFUND FAILED — manual reconciliation needed for', user.id, refundErr)
      // Surface it where an operator can SEE it (ops_events → /metrics health).
      await admin
        .from('ops_events')
        .insert({ kind: 'refund_failed', severity: 'critical', user_id: user.id, detail: { fn: 'generate-blueprint', amount: BLUEPRINT_COST, error: String((refundErr as { message?: string }).message ?? refundErr) } })
        .then(() => {}, () => {})
    }
    console.error('generate-blueprint error:', err)
    return json({ error: 'Generation failed. Your credits were not charged.' }, 500)
  }
})
