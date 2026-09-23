/**
 * A REFUSAL BECOMES A QUESTION.
 *
 * ⚠️ THE WORST MOMENT IN THE PRODUCT, AND IT IS ALSO THE BEST OPPORTUNITY IN IT.
 * When a beat rests on the creator's own life, the writer correctly refuses to
 * invent one — and the product then shipped that refusal AS THE SPOKEN LINE:
 * "Only you can supply this. What would you actually say here?" appeared in
 * three of six scenes of a real script. A creator at a teleprompter cannot read
 * that. The refusal is right; printing it as dialogue is the failure.
 *
 * ⚖️ A `needs_user` BEAT IS NOT A FAILED LINE. IT IS A CAPTURED QUESTION. The
 * same measurement that makes this a defect makes it an opportunity: answers a
 * creator types are the highest-quality knowledge this pipeline holds —
 * transcripts beat captions 78% to 13% on substance, and captions have produced
 * ZERO experiences ever. One answered question is worth more than the scrape.
 *
 * ⚠️ THIS MODULE HOLDS THE CONTRACT, NOT THE SCREEN. What makes an ask usable,
 * what makes a scaffold fillable, and what a filled line looks like. The card
 * that renders it and the endpoint that stores the answer are separate, and
 * both read this.
 */

/** ⚠️ ONE SLOT, SPELLED EXACTLY THIS WAY. A scaffold with two slots has no
 *  single answer; a scaffold with none is a line that never needed asking. */
export const ANSWER_SLOT = '{answer}'

/** The longest ask a creator will actually read before deciding to answer. */
export const ASK_MAX_CHARS = 160

/** ⚖️ REFUSE, NEVER TRUNCATE. A cut-off answer changes what the creator said,
 *  and this text goes into their script and their permanent knowledge. */
export const ANSWER_MAX_CHARS = 240

/**
 * ⚠️ AN ASK THAT COULD BE SENT TO ANY CREATOR IN THE NICHE IS MALFORMED.
 * "Tell me about yourself" produces the same nothing the placeholder did. The
 * beat needs ONE specific moment, number or object, and a question that names
 * none is a question the writer did not actually think about.
 */
const GENERIC_ASKS: readonly RegExp[] = Object.freeze([
  /^\s*tell me about\b/i,
  /^\s*describe your\b/i,
  /^\s*share your story\b/i,
  /^\s*what(?:'s| is) your (?:story|background|journey)\b/i,
  /^\s*talk about\b/i,
  /^\s*can you (?:tell|describe|share)\b/i,
  // ⚠️ THE ONE THAT ACTUALLY SHIPS, AND THE DETECTOR DID NOT KNOW IT. Measured
  // in production, generation 4608dc73: all FIVE unanswered beats showed the
  // creator the identical sentence "Only you can supply this. What would you
  // actually say here?" while each beat carried its own `section` (Inciting
  // Incident, False Resolution, Re-hook, Two-Front War) and its own direction.
  // The writer planned the whole arc and asked the same blank question five
  // times. This validator existed and never fired, because the string it was
  // built to catch was not in its list.
  /only you can supply this/i,
  // ⚠️⚠️ AND THE ANCHOR ON THE LINE BELOW MADE THE FIX ABOVE HALF A FIX.
  //
  // It used to read `/^\s*what would you actually say here\b/i` — pinned to the
  // START of the string. `checkEntitlement` in `claimEntitlement.ts` emits:
  //
  //     "Nothing on record supports this beat. What would you actually say here?"
  //
  // which is the SAME blank question with a sentence in front of it, and the
  // anchor slid straight past it. MEASURED: `askIsGeneric` returned false, so
  // `askForBeat` kept it verbatim and returned it for Setup, Proof and an
  // unrecognised section alike — the identical five-beats-one-question defect
  // that generation 4608dc73 produced and that this list exists to stop,
  // reintroduced through a prefix.
  /what would you actually say here\b/i,
  // ⚠️ THE HISTORY BRANCH OF THE SAME MODULE, WHICH IS THE COMMON CASE. A
  // `history` claim is the most frequent entitlement failure, and
  // `checkEntitlement` answers every one of them with the same sentence:
  //
  //     "This beat only works as something you have personally done.
  //      What is your real example?"
  //
  // Verbatim, for every beat in the script, overriding each section's own
  // question. It names no moment, no object and no number, which is this
  // list's whole definition of generic.
  /what is your real example\b/i,
])

export function askIsGeneric(ask: unknown): boolean {
  const s = String(ask ?? '').trim()
  if (s === '') return true
  return GENERIC_ASKS.some((r) => r.test(s))
}

export interface AskProblem {
  code: 'ASK_MISSING' | 'ASK_TOO_LONG' | 'ASK_GENERIC' | 'ASK_NOT_A_QUESTION'
    | 'SCAFFOLD_MISSING' | 'SCAFFOLD_NO_SLOT' | 'SCAFFOLD_MANY_SLOTS' | 'SCAFFOLD_ONLY_SLOT'
  detail: string
}

/**
 * Is this pair usable as a question card?
 *
 * ⚖️ IT RETURNS PROBLEMS, NOT A BOOLEAN, because the caller's job is to repair
 * deterministically and to record WHICH rule failed. "Invalid" tells nobody
 * whether the writer forgot the scaffold or wrote a question for everybody.
 */
export function askProblems(ask: unknown, scaffold: unknown): readonly AskProblem[] {
  const out: AskProblem[] = []
  const a = String(ask ?? '').trim()
  const s = String(scaffold ?? '').trim()

  if (a === '') out.push({ code: 'ASK_MISSING', detail: 'no question was emitted' })
  else {
    if (a.length > ASK_MAX_CHARS) {
      out.push({ code: 'ASK_TOO_LONG', detail: `${a.length} chars, max ${ASK_MAX_CHARS}` })
    }
    if (askIsGeneric(a)) {
      out.push({ code: 'ASK_GENERIC', detail: 'could be sent to any creator in this niche' })
    }
    // ⚠️ IT MUST READ AS A QUESTION. A statement rendered as a question card is
    // a card the creator does not know how to answer.
    if (!a.includes('?')) out.push({ code: 'ASK_NOT_A_QUESTION', detail: 'no question mark' })
  }

  if (s === '') out.push({ code: 'SCAFFOLD_MISSING', detail: 'no line to fill' })
  else {
    const slots = s.split(ANSWER_SLOT).length - 1
    if (slots === 0) out.push({ code: 'SCAFFOLD_NO_SLOT', detail: `expected ${ANSWER_SLOT}` })
    else if (slots > 1) out.push({ code: 'SCAFFOLD_MANY_SLOTS', detail: `${slots} slots, expected 1` })
    // ⚖️ A SCAFFOLD THAT IS *ONLY* THE SLOT HAS WRITTEN NOTHING. The point of a
    // scaffold is that the creator supplies one fact and the writer supplies the
    // sentence around it; "{answer}" alone hands the whole line back to them,
    // which is the placeholder again in a better costume.
    if (slots === 1 && s.replace(ANSWER_SLOT, '').trim().length < 8) {
      out.push({ code: 'SCAFFOLD_ONLY_SLOT', detail: 'the scaffold is the slot and almost nothing else' })
    }
  }
  return Object.freeze(out)
}

export function askIsUsable(ask: unknown, scaffold: unknown): boolean {
  return askProblems(ask, scaffold).length === 0
}

/** The three states an ask can be in. ⚠️ `skipped` IS STORED AS FIRMLY AS AN
 *  ANSWER — a creator who declines must never be asked the same thing again,
 *  and an unanswered ask must never be mistaken for a declined one. */
export type AskState = 'unanswered' | 'answered' | 'skipped'

/**
 * Fill the scaffold with what the creator typed.
 *
 * ⚠️ NO MODEL CALL. The whole point of the scaffold is that the common case
 * costs nothing and cannot fail: the writer already wrote the sentence, the
 * creator supplies the fact, and the two are joined by string substitution.
 *
 * ⚖️ AND THE ANSWER IS REFUSED, NEVER TRUNCATED, when it is too long. Cutting a
 * sentence in half can invert its meaning, and this text is about to be both
 * spoken on camera and stored as something the creator believes.
 */
export function fillScaffold(scaffold: unknown, answer: unknown): string | null {
  const s = String(scaffold ?? '')
  const a = String(answer ?? '').trim()
  if (a === '' || a.length > ANSWER_MAX_CHARS) return null
  if (s.split(ANSWER_SLOT).length - 1 !== 1) return null

  // ⚠️ THE JOIN IS TIDIED, BECAUSE A CREATOR TYPES LIKE A PERSON. They may end
  // with a full stop or not, capitalise or not; the scaffold already carries the
  // sentence punctuation around the slot. Doubling it produces "I quit.. And
  // that was the moment", which reads as a typo in their own script.
  const trimmed = a.replace(/[.\s]+$/, '')
  const filled = s.replace(ANSWER_SLOT, trimmed)
  return filled.replace(/\s+/g, ' ').trim()
}

/** ⚖️ WHAT THE SKIP LEAVES BEHIND. The slot is removed and the sentence around
 *  it survives if it can still stand alone; otherwise there is no line, and the
 *  caller drops the beat rather than shipping a fragment. */
export function scaffoldWithoutAnswer(scaffold: unknown): string | null {
  const s = String(scaffold ?? '')
  if (s.split(ANSWER_SLOT).length - 1 !== 1) return null
  // ⚠️ REMOVING THE SLOT ORPHANS ITS PUNCTUATION. "It starts small. {answer}."
  // becomes "It starts small. ." and then "small.." — a doubled full stop the
  // creator reads as a typo in their own script. Collapse the run rather than
  // leaving the seam visible.
  const rest = s
    .replace(ANSWER_SLOT, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/([.,!?])\1+/g, '$1')
    .replace(/([.,!?])\s*([.,!?])/g, '$1')
    .trim()
  // A fragment is worse than a missing beat: it reads as a sentence someone
  // started and abandoned, which is exactly how the placeholder read.
  if (rest.replace(/[^a-z0-9]/gi, '').length < 12) return null
  return rest
}

/** What answering or skipping an ask beat produces, and nothing else. */
export interface AskResolution {
  /** The spoken line to store, or '' when nothing survives — never the
   *  question and never a fragment (see `scaffoldWithoutAnswer`). */
  line: string
  state: AskState
}

/**
 * ONE FUNCTION, CALLED FROM BOTH SIDES OF THE WIRE.
 *
 * ⚖️ THE CLIENT AND THE SERVER MUST AGREE ON THE RESULT BEFORE THE SERVER HAS
 * ANSWERED. The card applies this locally the instant a creator taps Answer, so
 * the teleprompter reads real words with no spinner in front of them; the edge
 * function applies the SAME call to decide what actually gets persisted. Two
 * call sites, one function, is how "instant" and "correct" stop being in
 * tension — a second, hand-written copy of this branch is exactly the kind of
 * drift this module exists to prevent.
 *
 * `answer` absent/blank means SKIP, not a malformed answer — skipping is a
 * first-class outcome here, not an error path the caller has to construct.
 *
 * ⚖️ NO SCAFFOLD IS NOT A FAILURE. `generate-blueprint` blanks a beat's line to
 * '' when the writer produced an ask with no usable scaffold — the beat is
 * still worth asking, and the creator's own words become the line directly,
 * with no sentence built around them.
 */
export function resolveAskAnswer(
  ask: unknown, scaffold: unknown, answer: string | null | undefined,
): AskResolution {
  const usable = askIsUsable(ask, scaffold)
  const a = String(answer ?? '').trim()

  if (a === '') {
    // SKIP. Whatever the scaffold's own sentence can stand on without the
    // slot survives; a scaffold that cannot stand alone, or that never
    // existed, leaves no line — never the question itself.
    const kept = usable ? scaffoldWithoutAnswer(scaffold) : null
    return { line: kept ?? '', state: 'skipped' }
  }

  if (usable) {
    const filled = fillScaffold(scaffold, a)
    // `fillScaffold` only returns null for a too-long answer here, since
    // `usable` already guarantees exactly one slot — refuse, not truncate.
    return filled === null
      ? { line: '', state: 'unanswered' }
      : { line: filled, state: 'answered' }
  }

  // No usable scaffold: the creator's own words ARE the line.
  if (a.length > ANSWER_MAX_CHARS) return { line: '', state: 'unanswered' }
  return { line: a, state: 'answered' }
}

/**
 * The question a creator can actually answer, derived from the beat's own
 * section when the writer's ask is generic.
 *
 * ⚠️ THE INFORMATION WAS ALWAYS THERE. A `needs_user` beat ships with a
 * `section` naming its narrative job — "Inciting Incident", "False Resolution",
 * "Re-hook" — and a `direction` describing the emotional turn it should carry.
 * Showing the creator "What would you actually say here?" five times throws all
 * of it away and asks them to guess what the beat is for.
 *
 * ⚖️ THE WRITER'S OWN ASK WINS WHENEVER IT IS SPECIFIC. This is a floor, not a
 * replacement: a model that wrote a real question about a real moment knows
 * more about this script than a lookup table does. Only a generic ask is
 * overwritten.
 *
 * ⚖️ AND AN UNRECOGNISED SECTION STILL NAMES ITSELF. Falling back to the
 * original generic sentence would reintroduce the defect for every section not
 * in this table; naming the beat is worse than a hand-written question and far
 * better than asking about nothing.
 */
const SECTION_ASKS: ReadonlyArray<readonly [RegExp, string]> = Object.freeze([
  [/inciting|incident|trigger/i, 'What actually happened that set this off for you?'],
  [/false resolution|failed fix|first attempt/i, 'What looked like it fixed the problem but did not?'],
  [/re-?hook|reset|second hook/i, 'What is the turn that makes someone keep watching here?'],
  [/setup|background|context/i, 'What was your situation right before this started?'],
  [/stake|war|conflict|struggle|obstacle/i, 'What was the hardest part of this for you?'],
  [/proof|evidence|result|outcome/i, 'What is the specific result or number you can point to?'],
  [/lesson|takeaway|insight/i, 'What did you learn that you would tell someone else?'],
  // ── THE SECTIONS THAT CARRY EVERY SCRIPT, AND HAD NO QUESTION ────────────
  //
  // ⚠️ MEASURED ACROSS EVERY GENERATION, 2026-09-17. Section beats: hook 147,
  // setup 131, re-hook 120, cta 91, payoff 60, body 20, "call to action" 10.
  // `setup` and `re-hook` were covered above. `hook`, `cta`, `payoff` and `body`
  // — the first, last and middle of every script — were NOT, so they fell
  // through to the last resort and a creator was asked "This beat is your cta.
  // What happened?"
  //
  // ⚠️ AND THAT IS MY OWN FALLBACK, NOT THE MODEL'S. It is ungrammatical on a
  // plural section ("is your consequences") and semantically wrong on the two
  // commonest: a hook and a CTA are not things that HAPPENED. Reported by the
  // owner as the questions inside the script being wrong, and he was right.
  //
  // ⚖️ APPENDED, NEVER INSERTED, BECAUSE THE FIRST MATCH WINS. `/re-?hook/`
  // sits above and must keep its priority — a bare `/hook/` placed before it
  // would swallow every re-hook beat and ask the opening question in the middle
  // of a script.
  [/\bhook\b/i, 'What would you say first to stop someone scrolling?'],
  [/cta|call to action|outro|sign.?off/i, 'What do you want someone to do after watching this?'],
  [/payoff|resolution|solution|reveal/i, 'What does someone walk away with by the end?'],
  [/body|main|middle|explain/i, 'What is the one thing this video has to get across?'],
  [/escalat|worse|spiral/i, 'What makes this worse than people assume?'],
])

export function askForBeat(section: unknown, writersAsk: unknown): string {
  const written = String(writersAsk ?? '').trim()
  if (written !== '' && !askIsGeneric(written)) return written

  const s = String(section ?? '').trim()
  for (const [pattern, question] of SECTION_ASKS) {
    if (pattern.test(s)) return question
  }
  // ⚠️ THE OLD LAST RESORT WAS `This beat is your ${s}. What happened?`, and it
  // was wrong twice over: ungrammatical on a plural ("is your consequences") and
  // asking about an EVENT on beats where nothing happens — a hook and a CTA are
  // not things that happened. Eight of those reached real creators.
  //
  // ⚠️⚠️ AND MY FIRST FIX WAS TO DROP THE SECTION NAME ENTIRELY, WHICH
  // `five-beats-five-questions` CORRECTLY REFUSED. That file exists because one
  // real generation shipped the SAME blank question on all five of its beats, so
  // collapsing every unrecognised section to one sentence would have rebuilt the
  // defect it was written to stop — a creator reading the identical question
  // five times down one script.
  //
  // ⚖️ SO THE NAME STAYS AND THE GRAMMAR IS FIXED INSTEAD. "the <name> beat"
  // agrees whatever the name is — singular, plural or a phrase — because `beat`
  // is the noun doing the work: "the consequences beat", "the cta beat", "the
  // Bridge beat". Distinct per section, grammatical, and it no longer claims
  // something happened.
  return s === ''
    ? 'What would you say here, in your own words?'
    : `This is the ${s.toLowerCase()} beat — what would you say here, in your own words?`
}

// ── HOW MANY ASKS A SCRIPT MAY CARRY, AND WHICH ───────────────────────────
//
// ⚠️ ITEM 31: THE ASK COUNT SCALED WITH SCENE COUNT. Every escalation path turns
// one beat into one question, so a nine-scene script with thin material came
// back with five or seven asks and a three-scene one with one — the number
// measured length, not what was missing.
//
// ⚠️ ITEM 30: AN OPTIONAL FIELD SKIPPED STILL CAME BACK AS A GAP. The product
// boxes on the card are labelled optional; skipping them left the writer with
// no product detail, and every product beat then escalated to "what does it
// actually do here?" — the question the creator had just declined, re-asked
// inside the script.
//
// ⚖️ THE DECISION (CTO): skipped optional material never creates an ask — the
// writer uses what exists or omits the beat. Asks are reserved for a REQUIRED
// fact only the creator can supply, and at most `MAX_ASK_BEATS` per script,
// whatever its length.
export const MAX_ASK_BEATS = 2

/** Why a beat became a question. `product_detail` is the one fed by the
 *  optional product boxes; every other reason is a fact nobody else can give. */
export type AskReason = 'personal_fact' | 'product_detail' | 'placeholder' | 'reference_overlap'

export const OPTIONAL_ASK_REASONS: readonly AskReason[] = Object.freeze(['product_detail'] as AskReason[])

export interface BoundableBeat {
  line?: unknown
  ask?: unknown
  substance?: unknown
  line_scaffold?: unknown
  ask_reason?: unknown
}

export interface AskBound {
  /** Asks left in the script, in order. Never more than the cap. */
  kept: number
  /** Asks resolved by keeping the scaffold's line without the answer. */
  writtenAround: number
  /** Beats removed because nothing honest could be said without the answer. */
  omitted: number
  /** The script after bounding — a new array; beats are mutated in place. */
  beats: BoundableBeat[]
}

/**
 * Bound the asks: at most `max`, only for required facts, and every other
 * `needs_user` beat is written around (its scaffold's own sentence stands) or
 * omitted. `ask_reason` is consumed here and never ships.
 */
export function boundAskBeats(
  beats: readonly BoundableBeat[],
  opts: { max?: number; optional?: readonly AskReason[] } = {},
): AskBound {
  const max = Math.max(0, opts.max ?? MAX_ASK_BEATS)
  const optional = new Set<string>(opts.optional ?? OPTIONAL_ASK_REASONS)
  let kept = 0
  let writtenAround = 0
  let omitted = 0
  const out: BoundableBeat[] = []
  for (const b of beats) {
    if (!b || typeof b !== 'object') { out.push(b); continue }
    const isAsk = b.substance === 'needs_user' && typeof b.ask === 'string' && b.ask.trim() !== ''
    const reason = typeof b.ask_reason === 'string' ? b.ask_reason : 'personal_fact'
    delete b.ask_reason
    if (!isAsk) { out.push(b); continue }
    if (!optional.has(reason) && kept < max) {
      kept++
      out.push(b)
      continue
    }
    const around = askIsUsable(b.ask, b.line_scaffold) ? scaffoldWithoutAnswer(b.line_scaffold) : null
    if (around !== null && around.trim() !== '') {
      b.line = around
      b.substance = 'general'
      delete b.ask
      writtenAround++
      out.push(b)
    } else {
      omitted++
    }
  }
  return { kept, writtenAround, omitted, beats: out }
}

// ── ONE MISSING FACT, ONE QUESTION, ONE ANSWER (items 40, 41) ─────────────
//
// ⚠️ MEASURED 2026-09-22 on generation 8ce1290d: three beats (Hook, Re-hook,
// Summary) carried the IDENTICAL ask "This beat needs a real detail about your
// product, and nothing about it was supplied. What does it actually do here?".
// The creator could not tell whether answering one covered the others (it did
// not), the question never named the product, showed nothing of what the beat
// was for, and gave no idea what shape of answer was wanted — one real answer
// in that row is a keyboard mash.

/** The fact a beat is asking for. Beats sharing a key share one answer. */
export function askGroupKey(beat: { ask?: unknown; ask_fact?: unknown } | null | undefined): string {
  const fact = String(beat?.ask_fact ?? '').trim()
  if (fact !== '') return `fact:${fact}`
  const ask = String(beat?.ask ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  return ask === '' ? '' : `ask:${ask}`
}

/**
 * The OTHER beats that ask for the same missing fact and are still open —
 * the beats one answer should also fill. Answered beats are never overwritten.
 */
export function askPeers(
  beats: ReadonlyArray<{ ask?: unknown; ask_fact?: unknown; ask_state?: unknown } | null | undefined>,
  index: number,
): number[] {
  const list = Array.isArray(beats) ? beats : []
  const key = askGroupKey(list[index])
  if (key === '') return []
  const out: number[] = []
  list.forEach((b, j) => {
    if (j === index || !b) return
    if (String(b.ask_state ?? '') === 'answered') return
    if (askGroupKey(b) === key) out.push(j)
  })
  return out
}

/** The first-time-user copy for a product ask: names the product, and carries
 *  an example of the expected answer format. The canonical marker phrase
 *  ("this beat needs a real detail about your product" / "...describes your
 *  product in a way...") is kept verbatim — `generationReadiness` detects our
 *  asks by authorship. */
export function productAskCopy(
  kind: 'product_function' | 'product_accuracy',
  productName: unknown,
): { ask: string; example: string } {
  const raw = String(productName ?? '').trim().replace(/\s+/g, ' ')
  const name = raw.length > 40 ? `${raw.slice(0, 39).trimEnd()}…` : raw
  if (kind === 'product_function') {
    return {
      ask: `This beat needs a real detail about your product${name !== '' ? `, ${name}` : ''}. What does it actually do, in one sentence?`,
      example: 'e.g. "It slips on over the head, so there are no snaps to fight with."',
    }
  }
  return {
    ask: `This beat describes your product in a way the supplied details do not cover${name !== '' ? ` (${name})` : ''}. What is the accurate version?`,
    example: 'e.g. "It is hand-stitched cotton, and it is washable at 30 degrees."',
  }
}

/** What the beat is doing on screen, so the question is asked in context. */
export function askContext(beat: { section?: unknown; action_posing?: unknown; direction?: unknown } | null | undefined): string {
  const section = String(beat?.section ?? '').trim()
  const doing = String(beat?.action_posing ?? '').trim() || String(beat?.direction ?? '').trim()
  if (section === '' && doing === '') return ''
  if (doing === '') return `This is the ${section.toLowerCase()} beat.`
  return section === '' ? `On screen: ${doing}` : `${section} beat — on screen: ${doing}`
}
