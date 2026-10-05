// GENERATED FROM packages/shared/src/script/questionSpecs.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// QUESTION SPECS — what each option's script needs, and the one or two
// questions to ask for what is still missing (owner, 2026-10-04).
//
// ⚠️ A FIXED LIST REPEATS THE MOMENT SHE USES AN OPTION TWICE, and "Launch it"
// and "back in stock" asked the same thing because they were one option. Each
// option now has a SPEC: the job of the video, the SLOTS the script needs (in
// the order to ask), and what may never be asked. Slots are filled from what
// Twin already has first, with no model call; only what is still missing is
// asked, at most two, and never the same wording twice.
//
// ⚖️ ROTATION NEVER MAKES A QUESTION WORSE. An unfilled slot that was never
// skipped is asked again (new wording only). A different angle is for a slot
// she skipped; a slot skipped twice rests. Zero questions is a correct result.

export type SlotType = 'moment' | 'fact' | 'number' | 'quote'

export interface Slot {
  id: string
  /** What the script needs here, in plain words (the wording model reads this). */
  need: string
  type: SlotType
  /** Time-bound: a launch date, a batch size. Expires after EXPIRY_DAYS. */
  expires?: boolean
  /** Only the first `required` slots must be filled before writing without asking. */
  required?: boolean
  /** Words that, in a saved fact, show the fact fills this slot (rules, no model). */
  cues: readonly string[]
}

export interface Spec {
  id: string
  surface: 'product' | 'business' | 'idea' | 'reference'
  label: string
  /** The job of the video, and how it differs from its neighbours. */
  job: string
  /** The VideoGoal the option rides on downstream. */
  goal: string
  slots: readonly Slot[]
}

export const EXPIRY_DAYS = 30
export const REST_RUNS = 10
export const MAX_QUESTION_WORDS = 25

const s = (id: string, need: string, type: SlotType, cues: string[], extra: Partial<Slot> = {}): Slot =>
  ({ id, need, type, cues, required: true, ...extra })

/** Never asked, whatever the option: private matters, and what is already on file. */
export const BANNED_ASKS: readonly RegExp[] = [
  /\b(bank|debt|salary|income|divorce|health|diagnos|medical|therapy|pregnan|religio|politic|address|password)\b/i,
  /\b(price|cost|how much (?:is|does) it)\b/i, // the price lives on the product
  /\b(sizes?|variants?|colou?rs? (?:does|do) it come)\b/i,
  /\b(call to action|cta|link in (?:your )?bio)\b/i,
]

export const SPECS: readonly Spec[] = [
  // ── PRODUCT ────────────────────────────────────────────────────────────
  { id: 'product:launch', surface: 'product', goal: 'sell', label: 'Launch it',
    job: 'It is new to the world: what it is, why now, who it is for. Not a restock.',
    slots: [
      s('whats_new', 'what is new about it, that did not exist before', 'fact', ['new', 'first', 'never', 'launch', 'introduc']),
      s('why_now', 'why it is coming out now', 'moment', ['now', 'because', 'finally', 'ready']),
      s('who_for', 'who it is for', 'fact', ['for anyone', 'for people', 'for those', 'beginners', 'if you']),
      s('limits', 'how many there are or until when', 'number', ['only', 'limited', 'until', 'batch of', 'left'], { expires: true, required: false }),
    ] },
  { id: 'product:restock', surface: 'product', goal: 'sell', label: 'New or back in stock',
    job: 'It existed before and is back: what stayed the same or changed since the last batch, what people said while it was gone. Not a launch.',
    slots: [
      s('same_or_changed', 'what is the same or what changed since the last batch', 'fact', ['same', 'changed', 'this batch', 'this time', 'tweaked']),
      s('said_while_gone', 'what people said or asked while it was gone', 'quote', ['asked', 'messaged', 'dm', 'waiting', 'when is it back', 'sold out']),
      s('how_much', 'how much there is this time', 'number', ['bags', 'units', 'only', 'batch of'], { expires: true, required: false }),
    ] },
  { id: 'product:explain', surface: 'product', goal: 'educate', label: 'Explain what it does',
    job: 'Make the product clear: what someone notices first, how it is made or used, what is included.',
    slots: [
      s('first_notice', 'the first thing someone notices when they try it', 'moment', ['first', 'notice', 'smell', 'taste', 'feel', 'open']),
      s('how_made_used', 'how it is made or used', 'fact', ['made', 'roast', 'brew', 'use', 'pour', 'step']),
      s('included', 'what is included', 'fact', ['includes', 'comes with', 'inside', 'pages', 'bag'], { required: false }),
    ] },
  { id: 'product:wrong', surface: 'product', goal: 'educate', label: 'The part people get wrong',
    job: 'Correct one belief about the product: the assumption, the truth, a moment someone said it.',
    slots: [
      s('assumption', 'what people assume about it', 'fact', ['assume', 'think', 'believe', 'everyone says', 'myth']),
      s('truth', 'what is actually true', 'fact', ['actually', 'truth', 'really', 'opposite']),
      s('moment_said', 'a moment someone said the wrong thing to her', 'quote', ['told me', 'said', 'asked me'], { required: false }),
    ] },
  { id: 'product:try', surface: 'product', goal: 'leads', label: 'Get people to try it',
    job: 'Lower the barrier to a first try: the smallest first step, the hesitation, what the first week is like.',
    slots: [
      s('first_step', 'the smallest first step someone can take', 'fact', ['start', 'first', 'try', 'sample', 'small']),
      s('hesitation', 'what makes people hesitate', 'fact', ['worried', 'afraid', 'hesitat', 'not sure', 'expensive']),
      s('first_week', 'what the first week is like', 'moment', ['first week', 'first time', 'day one'], { required: false }),
    ] },
  { id: 'product:later', surface: 'product', goal: 'leads', label: 'Interest now, buying later',
    job: 'Keep warm leads: who is not ready yet, what to do now, when to come back.',
    slots: [
      s('not_ready', 'who is not ready to buy yet', 'fact', ['not ready', 'later', 'someday', 'one day']),
      s('do_now', 'what they can do now', 'fact', ['now', 'start', 'save', 'join', 'follow']),
      s('come_back', 'when they should come back', 'fact', ['when', 'once', 'after'], { expires: true, required: false }),
    ] },
  { id: 'product:asked', surface: 'product', goal: 'conversations', label: 'Answer what people keep asking',
    job: 'Answer one real question people keep asking: the question, her answer, where it came from.',
    slots: [
      s('question', 'the question people keep asking', 'quote', ['asked', 'ask', 'question', '?']),
      s('answer', 'her answer to it', 'fact', ['i tell', 'answer', 'my answer']),
      s('where_from', 'where the question came from (comments, DMs, in person)', 'fact', ['comment', 'dm', 'message', 'in person'], { required: false }),
    ] },
  { id: 'product:dm', surface: 'product', goal: 'conversations', label: 'Turn a DM into a video',
    job: 'Use one real message: the DM as written, and her reply.',
    slots: [
      s('dm_text', 'the message as it was written', 'quote', ['dm', 'message', 'wrote']),
      s('reply', 'what she replied', 'fact', ['replied', 'told them', 'my answer']),
    ] },
  { id: 'product:why_made', surface: 'product', goal: 'personal_brand', label: 'Say why I made it',
    job: 'The origin of the product: what was missing, the moment she decided, what she did before.',
    slots: [
      s('missing', 'what was missing that made her make it', 'fact', ['missing', 'couldn\'t find', 'no one', 'wanted']),
      s('decision', 'the moment she decided to make it', 'moment', ['decided', 'that day', 'moment', 'finally']),
      s('before', 'what she did before', 'fact', ['before', 'used to'], { required: false }),
    ] },
  { id: 'product:story', surface: 'product', goal: 'personal_brand', label: 'The story behind it',
    job: 'One moment behind the product: what happened, what went wrong or right, what it taught her.',
    slots: [
      s('moment', 'one specific moment behind it', 'moment', ['day', 'time', 'once', 'remember', 'batch']),
      s('turn', 'what went wrong or right', 'fact', ['wrong', 'ruined', 'worked', 'failed', 'tossed']),
      s('lesson', 'what it taught her', 'fact', ['learned', 'taught', 'realized', 'now i'], { required: false }),
    ] },
  // ── BUSINESS ───────────────────────────────────────────────────────────
  { id: 'business:why_started', surface: 'business', goal: 'personal_brand', label: 'Say why I started it',
    job: 'Founder origin: what life was like before, and the moment she decided.',
    slots: [
      s('before', 'what she was doing before she started', 'fact', ['before', 'used to', 'worked']),
      s('decision', 'the moment she decided to start', 'moment', ['decided', 'moment', 'that day', 'started']),
    ] },
  { id: 'business:wrong', surface: 'business', goal: 'educate', label: 'The part people get wrong',
    job: 'Correct one belief about what she does.',
    slots: [
      s('assumption', 'what people assume about what she does', 'fact', ['assume', 'think', 'believe', 'myth']),
      s('truth', 'what is actually true', 'fact', ['actually', 'truth', 'really']),
    ] },
  { id: 'business:announce', surface: 'business', goal: 'sell', label: 'Announce something',
    job: 'News: what is happening, when and where.',
    slots: [
      s('what', 'what she is announcing', 'fact', ['announc', 'new', 'launch', 'opening']),
      s('when_where', 'when and where', 'fact', ['on', 'at', 'from', 'until', 'date'], { expires: true }),
    ] },
  // ── IDEA ───────────────────────────────────────────────────────────────
  { id: 'idea:story', surface: 'idea', goal: 'personal_brand', label: 'Your story',
    job: 'One moment from her life on this idea, and what changed after it.',
    slots: [
      s('moment', 'one specific moment about this idea', 'moment', ['day', 'time', 'once', 'remember']),
      s('changed', 'what changed after it', 'fact', ['changed', 'now', 'since', 'learned']),
    ] },
  { id: 'idea:teach', surface: 'idea', goal: 'educate', label: 'Teaching something',
    job: 'Teach one thing: the misconception, the truth, one step to do.',
    slots: [
      s('misconception', 'what people get wrong about it', 'fact', ['wrong', 'assume', 'think', 'myth']),
      s('truth', 'what is actually true', 'fact', ['actually', 'truth', 'really']),
      s('step', 'one step a viewer can take', 'fact', ['step', 'try', 'start', 'do this'], { required: false }),
    ] },
  { id: 'idea:answer', surface: 'idea', goal: 'conversations', label: 'Answering a question',
    job: 'Answer one real question: the question and her answer.',
    slots: [
      s('question', 'the question', 'quote', ['ask', 'question', '?']),
      s('answer', 'her answer', 'fact', ['answer', 'i tell', 'i say']),
    ] },
  { id: 'idea:process', surface: 'idea', goal: 'authority', label: 'Showing how you do it',
    job: 'Show her process: one step people never see, and what she does there.',
    slots: [
      s('hidden_step', 'one step people never see', 'fact', ['step', 'behind', 'never see', 'before']),
      s('what_she_does', 'what she does at that step', 'moment', ['i', 'check', 'weigh', 'test', 'watch']),
    ] },
  { id: 'idea:fun', surface: 'idea', goal: 'entertain', label: 'Something fun to watch',
    job: 'A real funny or chaotic moment.',
    slots: [s('moment', 'one real funny or chaotic moment', 'moment', ['funny', 'chaos', 'mess', 'oops', 'day'])] },
  { id: 'idea:sell', surface: 'idea', goal: 'sell', label: 'Promoting something you sell',
    job: 'Sell one thing: who it is for and what to try first.',
    slots: [
      s('who_for', 'who it is for', 'fact', ['for anyone', 'for people', 'if you']),
      s('try_first', 'what to try first', 'fact', ['try', 'start', 'first']),
    ] },
  // ── REFERENCE ──────────────────────────────────────────────────────────
  { id: 'reference:opening', surface: 'reference', goal: 'educate', label: 'Match its opening and hook',
    job: 'Her version of the reference opening.',
    slots: [s('her_opening', 'her own opening moment for this', 'moment', ['day', 'time', 'once'])] },
  { id: 'reference:pacing', surface: 'reference', goal: 'educate', label: 'Match its pacing only',
    job: 'Her version of the flow, start to end.',
    slots: [s('her_flow', 'what happens in her version, start to end', 'fact', ['first', 'then', 'end'])] },
  { id: 'reference:close', surface: 'reference', goal: 'educate', label: 'Stay close throughout',
    job: 'Honest overlap with the reference: which parts she can truly say.',
    slots: [s('true_parts', 'which parts of it she can honestly say', 'fact', ['true', 'me too', 'same'])] },
]

export function specById(id: string): Spec | undefined {
  return SPECS.find((x) => x.id === id)
}

export interface Material {
  facts: ReadonlyArray<{ text: string; option?: string | null; slot?: string | null; at?: string | null; sensitive?: boolean | null }>
  paragraph?: string | null
}

export interface Fill { slot: string; value: string; source: 'labelled' | 'cue' | 'paragraph'; expired: boolean }

const norm = (t: string) => t.toLowerCase()
const ageDays = (at: string | null | undefined, now: number) => (at ? (now - Date.parse(at)) / 86_400_000 : 0)

/** Step 1: fill slots from what Twin already has. Rules only, no model call. */
export function fillSlots(spec: Spec, m: Material, now = Date.now()): Record<string, Fill> {
  const out: Record<string, Fill> = {}
  const usable = m.facts.filter((f) => !f.sensitive && f.text && f.text.trim().length > 8)
  for (const slot of spec.slots) {
    const expired = (at?: string | null) => !!slot.expires && ageDays(at, now) > EXPIRY_DAYS
    const labelled = usable.find((f) => f.option === spec.id && f.slot === slot.id)
    if (labelled) { out[slot.id] = { slot: slot.id, value: labelled.text, source: 'labelled', expired: expired(labelled.at) }; continue }
    // A cue match counts only from facts already scoped to this option, or unscoped ones.
    // ⚠️ PROBE 2026-10-04: one cue word ("new", "first") made almost any fact
    // "fill" Launch's what's-new slot, so it was never asked. A saved fact
    // fits a slot only when two distinct cues of that slot appear in it.
    const hits = (t: string) => slot.cues.filter((c) => norm(t).includes(c)).length
    const cued = usable.find((f) => (!f.option || f.option === spec.id) && hits(f.text) >= 2)
    if (cued && slot.type !== 'quote') { out[slot.id] = { slot: slot.id, value: cued.text, source: 'cue', expired: expired(cued.at) }; continue }
    const p = String(m.paragraph ?? '')
    if (p.length > 40 && slot.cues.filter((c) => norm(p).includes(c)).length >= 2 && slot.type !== 'number') {
      out[slot.id] = { slot: slot.id, value: p, source: 'paragraph', expired: false }
    }
  }
  return out
}

export interface Asked { slot: string; wording: string; outcome: 'shown' | 'answered' | 'skipped' | 'filler' | 'nothing'; run: number }

export interface Plan {
  /** Slots filled from facts labelled for this option: one "Using: …" line with a Change link. */
  using: Fill[]
  /** Saved stories that fit an empty slot: one-tap "Use the … story? Yes / Change", never a typed question. */
  confirm: Fill[]
  /** Fresh questions: ONE normally, a second only when the script would otherwise be thin. */
  ask: Array<{ slot: Slot; angle: 'first' | 'different'; offerBack?: string; sameOrNew?: boolean }>
  /** Slots resting after two skips. */
  resting: string[]
  /** Required slots nothing fills — the script will say these were left out. */
  thin: boolean
}

/**
 * Steps 2, 3 and 5 (owner rules, 2026-10-04, second pass):
 * - zero questions when every required slot is filled;
 * - a saved story that fits is offered as a one-tap choice before any question;
 * - ONE question normally; a second only when, even with the first answered,
 *   fewer than half the required slots would be filled ("thin");
 * - an optional slot is never asked;
 * - skipped once → a different angle; skipped twice → rests REST_RUNS runs.
 */
export function planQuestions(spec: Spec, filled: Record<string, Fill>, history: readonly Asked[], run: number): Plan {
  const using = Object.values(filled).filter((f) => !f.expired && f.source === 'labelled')
  const confirm = Object.values(filled).filter((f) => !f.expired && f.source !== 'labelled')
  const resting: string[] = []
  const candidates: Plan['ask'] = []
  const required = spec.slots.filter((x) => x.required !== false)
  for (const slot of required) {
    const f = filled[slot.id]
    if (f && !f.expired) continue
    const mine = history.filter((h) => h.slot === slot.id)
    // She answered (or said "nothing like that happened"): never asked again,
    // even before the stored fact is read back.
    if (mine.some((h) => h.outcome === 'answered' || h.outcome === 'nothing')) continue
    const skips = mine.filter((h) => h.outcome === 'skipped' || h.outcome === 'filler')
    const lastSkip = skips.length ? Math.max(...skips.map((h) => h.run)) : -Infinity
    if (skips.length >= 2 && run - lastSkip < REST_RUNS) { resting.push(slot.id); continue }
    if (f?.expired) { candidates.push({ slot, angle: 'first', offerBack: f.value, sameOrNew: true }); continue }
    candidates.push({ slot, angle: skips.length === 1 ? 'different' : 'first' })
  }
  // A time-bound fact that has expired is offered back as "same one or new?"
  // (one tap), required or not — a launch weeks later is usually a new one.
  for (const slot of spec.slots) {
    const f = filled[slot.id]
    if (slot.required === false && f?.expired) candidates.unshift({ slot, angle: 'first', offerBack: f.value, sameOrNew: true })
  }
  const filledRequired = required.filter((x) => filled[x.id] && !filled[x.id]!.expired).length
  const thin = required.length > 0 && filledRequired + Math.min(1, candidates.length) < required.length / 2
  const ask = candidates.slice(0, thin ? 2 : 1)
  return { using, confirm, ask, resting, thin: filledRequired < required.length }
}

/** Step 4: the one cheap call that words the question. */
export function wordingPrompt(spec: Spec, slot: Slot, opts: { angle: 'first' | 'different'; facts: readonly string[]; paragraph?: string; asked: readonly Asked[]; offerBack?: string }): { system: string; prompt: string } {
  return {
    system: [
      'You write ONE short question a content creator answers before her video is written.',
      `At most ${MAX_QUESTION_WORDS} words, one sentence, ends with "?". Plain, warm, specific to her world.`,
      'Ask only for the one missing piece named. Never ask about money, health, family, private matters, price, sizes or her call to action.',
      'Never repeat or lightly reword a question already asked.',
      'Never assume she runs, owns or works at a business, cart, shop, studio or role that WHAT TWIN ALREADY KNOWS does not name as hers. A video idea about something (e.g. starting a coffee cart) is a topic, not proof she has one.',
      'Never presume something happened. For a moment or a quote, ask whether it did first ("Did anyone say anything while it was gone? If so, what?"); "nothing like that" must be an easy, honest answer.',
      'Stay on THE MISSING PIECE for THE VIDEO. A different angle is a different way of asking for the SAME piece, never a new topic (no maintenance tips, no exercises, nothing about other products).',
      'Return JSON {"question":"..."}.',
    ].join('\n'),
    prompt: [
      `THE VIDEO: ${spec.label} — ${spec.job}`,
      `THE MISSING PIECE: ${slot.need} (${slot.type}${slot.type === 'moment' ? ': one specific moment, not a summary' : ''}).`,
      opts.offerBack ? `SHE TOLD TWIN BEFORE: "${opts.offerBack}". Ask if it is still true or what changed (is this the same one or a new one?).` : '',
      opts.angle === 'different' ? 'She skipped this before: ask for the SAME missing piece in clearly different words (simpler, more concrete, or as a choice). Not a different subject.' : '',
      opts.paragraph ? `HER NOTE FOR THIS VIDEO: ${opts.paragraph.slice(0, 400)}` : '',
      opts.facts.length ? `WHAT TWIN ALREADY KNOWS (never ask for these): ${opts.facts.slice(0, 12).join(' | ').slice(0, 1200)}` : '',
      opts.asked.length ? `ALREADY ASKED (never reuse these words):\n${opts.asked.slice(-8).map((a) => `- "${a.wording}" (${a.outcome})`).join('\n')}` : '',
    ].filter(Boolean).join('\n'),
  }
}

const words = (t: string) => new Set(norm(t).match(/[a-z']{3,}/g) ?? [])
export function nearDuplicate(a: string, b: string): boolean {
  const x = words(a), y = words(b)
  if (!x.size || !y.size) return false
  const inter = [...x].filter((w) => y.has(w)).length
  return inter / Math.min(x.size, y.size) >= 0.75
}

/** Step 6: every generated question is checked; a failure means no question, never a block. */
const PRESUMED_VENTURE = /\b(?:your|the)\s+((?:[a-z-]+\s+){0,2}(?:business|company|cart|truck|shop|store|studio|bakery|caf[eé]|roastery|salon|clinic|agency|restaurant|farm|gym|boutique|podcast|channel|newsletter|community|course|class|workshop|team|staff|employees|partner|kids|routine|mornings|kitchen|garage|events?|market stall|booth))\b/gi

/** Ventures a question presumes are hers ("your coffee cart") that her facts never name. */
export function presumedVentures(question: string, known: string): string[] {
  const k = known.toLowerCase()
  const out: string[] = []
  for (const m of question.toLowerCase().matchAll(PRESUMED_VENTURE)) {
    const words = (m[1] ?? '').split(/\s+/).filter((w) => w.length > 2 && !['own', 'new', 'small', 'little', 'mobile', 'first', 'daily', 'usual'].includes(w))
    if (words.some((w) => !k.includes(w.replace(/s$/, '')))) out.push(m[1]!)
  }
  return out
}

/**
 * A moment or quote question that takes for granted it happened ("What was the
 * exact comment a customer sent you?") invites her to invent one. Asked
 * neutrally, it opens with whether it happened, or leaves room for "if so".
 */
export function presumesItHappened(q: string): boolean {
  const t = q.trim().toLowerCase()
  if (/^(did|has|have|had|was there|were there|is there|are there|do you|does|any)\b/.test(t)) return false
  if (/\b(if (so|any|anything|ever|it did|there was|one comes to mind)|if you have one|ever)\b/.test(t)) return false
  return true
}

/** The cheap yes/no check that a generated question still asks for its slot. */
export function slotFitPrompt(spec: Spec, slot: Slot, question: string): { system: string; prompt: string } {
  return {
    system: 'You check one question for a content creator. Answer JSON {"fits": true|false}. fits=true only if answering it would directly give THE MISSING PIECE for THE VIDEO. A question about a different subject (maintenance tips, exercises, another product, general advice) is false.',
    prompt: `THE VIDEO: ${spec.label} — ${spec.job}\nTHE MISSING PIECE: ${slot.need}\nQUESTION: ${question}`,
  }
}

export function validateQuestion(q: unknown, opts: { spec: Spec; slot: Slot; asked: readonly Asked[]; known?: string }): { ok: true; question: string } | { ok: false; reason: string } {
  const text = String(q ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return { ok: false, reason: 'empty' }
  if (!text.endsWith('?')) return { ok: false, reason: 'not_a_question' }
  if (text.split(' ').length > MAX_QUESTION_WORDS) return { ok: false, reason: 'too_long' }
  if (BANNED_ASKS.some((re) => re.test(text))) return { ok: false, reason: 'banned' }
  if ((text.match(/\?/g) ?? []).length > 1) return { ok: false, reason: 'two_questions' }
  if (opts.asked.some((a) => nearDuplicate(a.wording, text))) return { ok: false, reason: 'repeats' }
  if (opts.known !== undefined && presumedVentures(text, opts.known).length) return { ok: false, reason: 'presumes_venture' }
  if ((opts.slot.type === 'moment' || opts.slot.type === 'quote') && presumesItHappened(text)) return { ok: false, reason: 'presumes_it_happened' }
  return { ok: true, question: text }
}
