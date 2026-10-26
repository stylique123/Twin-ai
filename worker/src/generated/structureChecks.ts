// GENERATED FROM packages/shared/src/script/structureChecks.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// W3 STRUCTURE CHECKS (plan v6.6 §32; DEFAULT OFF: STRUCTURE_CHECKS=on turns them on,
// and nothing reads them yet except the offline report scripts/quality/structureReport.mjs).
//
// Seven deterministic checks on a script's spoken lines, in order. Each returns
// pass / fail / n/a and a reason id (never text). No model call, no I/O.
//
//   hook_payoff        the hook's promise pays off by line 3: line 2 or 3 shares a
//                      topic word with the hook AND delivers (a story beat, a reason,
//                      a step, a number or a direct answer).
//   story_before_lesson when the script tells a first-person story and states a
//                      lesson (a rule, an instruction, "the lesson"), the story
//                      comes first. The hook is not counted as the lesson.
//   one_story          at most one of her stories per script (by her material when
//                      given; otherwise story lines that share no topic word).
//   leads_offer        a sell / leads script states the offer (her offer text, the
//                      product with a price / trial / link, or an offer CTA).
//   no_pitch_non_sell  an educate / story / other non-sell script carries no pitch
//                      (her product named with a price, trial, order or link CTA).
//   reshape_keeps_refs after a reshape (reorder, trim, refill, completion) every one
//                      of her items the script used before is still used.
//   pacing             no spoken line over 40 words, a hook of at most 20 words,
//                      the total inside 50-160 words, never three long lines (over
//                      30 words) in a row.

export type StructureCheckId =
  | 'hook_payoff' | 'story_before_lesson' | 'one_story' | 'leads_offer'
  | 'no_pitch_non_sell' | 'reshape_keeps_refs' | 'pacing'
export const STRUCTURE_CHECK_IDS: readonly StructureCheckId[] = [
  'hook_payoff', 'story_before_lesson', 'one_story', 'leads_offer', 'no_pitch_non_sell', 'reshape_keeps_refs', 'pacing',
]
export const STRUCTURE_CHECKS_VERSION = 'structure-checks-v1'

export type CheckStatus = 'pass' | 'fail' | 'n/a'
export interface CheckResult { id: StructureCheckId; status: CheckStatus; reason: string | null; line: number | null }

/** Default OFF: only the literal 'on' (or 'true') turns the checks on. */
export function structureChecksOn(flag: string | undefined | null): boolean {
  const f = String(flag ?? '').trim().toLowerCase()
  return f === 'on' || f === 'true'
}

export interface MaterialItem { id: string; text: string; kind?: 'story' | 'fact' | 'product_fact' | 'offer' | 'other' }
export interface StructureContext {
  /** The request's goal: sell / leads carry an offer; anything else is non-sell. */
  goal?: string
  /** Her material (stories, facts, product facts, offer). */
  material?: readonly MaterialItem[]
  /** Her product names (any of hers, not only the target). */
  products?: readonly string[]
  /** Her offer text, when on file. */
  offer?: string
}

// ── words ──────────────────────────────────────────────────────────────────
const STOP = new Set(('a an the and or but so if then than that this these those to of in on at for with from by as is are was were be been being '
  + 'it its i im ive me my we our us you your youre he she her his they them their what which who when where why how do does did done not no '
  + 'yes just really very can could would should will all any every some more most one here there about into out up down over after before '
  + 'because like get got have has had make made keep kept tell told let know thing things time way much many even also only still now today '
  + 'once ever never stop start going go want need first last').split(' '))
const stem = (w: string) => w.replace(/'s$/, '').replace(/ies$/, 'y').replace(/(?:ing|ed|es|s)$/, '')
export function topicWords(t: string): Set<string> {
  const ws = String(t ?? '').toLowerCase().replace(/[’']/g, '').match(/[a-z0-9][a-z0-9-]+/g) ?? []
  return new Set(ws.filter((w) => w.length > 2 && !STOP.has(w)).map(stem).filter((w) => w.length > 2))
}
const shared = (a: Set<string>, b: Set<string>) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n }
export const wordCount = (t: string) => (String(t ?? '').match(/[A-Za-z0-9$][A-Za-z0-9$'’.,-]*/g) ?? []).length
const clean = (lines: readonly string[]) => lines.map((l) => String(l ?? '').trim()).filter(Boolean)

// ── line kinds ─────────────────────────────────────────────────────────────
/** A first-person (or her customer's) past-tense story beat. */
export const STORY_RE = /\b(?:i|my|we|our|one of my|a regular|a buyer|a customer|a client|my client)\b[^.?!]*\b(?:was|were|had|came|went|got|lost|found|caught|threw|told|asked|ran|built|started|tried|glued|ruined|wrote|fixed|spent|skipped|pulled|burned|broke|failed|learned|realized|bought|sold|copied|hurt|picked|turned|trained|took|felt|said|sang|fell|grabbed|counted|[a-z]{3,}ed)\b/i
export const isStoryLine = (l: string) => STORY_RE.test(String(l ?? '')) && !/\?\s*$/.test(String(l ?? '').trim())
const DELIVER_RE = /(\$\s?\d|\b\d|\bbecause\b|\bwhich is (?:why|how)\b|\bthat(?:'s| is) (?:why|how)\b|\bso (?:i|we|you)\b|\bstep\b|\bfirst\b|\bthen\b|\binstead\b|\bthe (?:reason|answer|trick|rule|fix|catch)\b|\bhere(?:'s| is) (?:why|how|what)\b)/i
const IMPERATIVE_START = /^(?:stop|start|check|keep|try|use|write|save|store|read|smell|watch|ask|open|find|stand|push|tag|wax|wipe|dip|pick|choose|avoid|look|test|remember|never|always|don't|do not|make sure)\b/i
const LESSON_RE = /\b(?:the lesson|lesson is|what i learned|i learned that|the rule|rule is|the takeaway|moral|so remember|you should|you need to|you have to|make sure you|the key is|the trick is)\b/i
/** A lesson: a stated rule or an instruction to the viewer. */
export const isLessonLine = (l: string) => { const t = String(l ?? '').trim(); return LESSON_RE.test(t) || IMPERATIVE_START.test(t) }
const CTA_RE = /\b(?:link in (?:my |the )?bio|in my bio|comment|comments|tell me|let me know|save this|send this|share this|subscribe|sign up|book (?:a|your)|order|grab (?:a|your|one|it)|shop|follow (?:me|for)|dm me|message me|free trial|start (?:your|a) (?:free )?trial|try it|tickets?|join)\b/i
export const isCtaLine = (l: string) => CTA_RE.test(String(l ?? ''))
const BUY_RE = /(\$\s?\d|\b\d+ (?:dollars|per)\b|\bper (?:month|week|bag|jar|mug|tin)\b|\bfree trial\b|\b\d+-day\b|\btrial\b|\blink in (?:my |the )?bio\b|\bin my bio\b|\bshop\b|\border\b|\bbuy\b|\bgrab (?:yours|your|one|it)\b|\bdrops? in the shop\b|\bbook a (?:free )?\S* ?(?:intro )?call\b|\btickets?\b|https?:\/\/)/i
const OFFER_CTA_RE = /\b(?:link in (?:my |the )?bio|in my bio|book (?:a|your)|free trial|trial|sign up|dm me|message me|intro call|shop|order|grab (?:it|yours|one|your)|tickets?|subscribe)\b/i

const check = (id: StructureCheckId, status: CheckStatus, reason: string | null = null, line: number | null = null): CheckResult => ({ id, status, reason, line })

// ── the checks ─────────────────────────────────────────────────────────────

/** The hook's promise pays off by line 3. */
export function hookPaysOff(lines: readonly string[]): CheckResult {
  const L = clean(lines)
  if (L.length < 2) return check('hook_payoff', 'fail', 'too_short', 0)
  const hook = topicWords(L[0]!)
  for (let i = 1; i <= Math.min(2, L.length - 1); i++) {
    const l = L[i]!
    if (isCtaLine(l) && i === L.length - 1) continue
    const on = shared(hook, topicWords(l)) > 0
    if (on && (isStoryLine(l) || DELIVER_RE.test(l) || isLessonLine(l))) return check('hook_payoff', 'pass', null, i)
  }
  return check('hook_payoff', 'fail', 'no_payoff_by_line_3', 2)
}

/** Her story comes before the lesson it supports. */
export function storyBeforeLesson(lines: readonly string[]): CheckResult {
  const L = clean(lines)
  const body = L.map((l, i) => ({ l, i })).filter((x) => x.i > 0 && !(x.i === L.length - 1 && isCtaLine(x.l)))
  const story = body.find((x) => isStoryLine(x.l))
  const lesson = body.find((x) => isLessonLine(x.l) && !isStoryLine(x.l))
  if (!story || !lesson) return check('story_before_lesson', 'n/a', !story ? 'no_story' : 'no_lesson')
  return story.i < lesson.i ? check('story_before_lesson', 'pass', null, story.i) : check('story_before_lesson', 'fail', 'lesson_first', lesson.i)
}

/** Her stories a script tells: an item is told when half its topic words sit in one line. */
export function storiesTold(lines: readonly string[], material: readonly MaterialItem[]): string[] {
  const L = clean(lines).map(topicWords)
  const out: string[] = []
  for (const m of material) {
    if (m.kind !== 'story') continue
    const own = topicWords(m.text)
    if (own.size < 3) continue
    if (L.some((w) => shared(own, w) / own.size >= 0.5)) out.push(m.id)
  }
  return out
}

/** At most one story per script. */
export function oneStory(lines: readonly string[], ctx: StructureContext = {}): CheckResult {
  const L = clean(lines)
  const stories = (ctx.material ?? []).filter((m) => m.kind === 'story')
  if (stories.length) {
    // Two items that are the same story (a retelling in her own words) count once.
    const told = storiesTold(L, stories)
    const distinct: string[] = []
    for (const id of told) {
      const a = topicWords(stories.find((s) => s.id === id)!.text)
      if (!distinct.some((d) => { const b = topicWords(stories.find((s) => s.id === d)!.text); return shared(a, b) / Math.min(a.size, b.size) >= 0.5 })) distinct.push(id)
    }
    return distinct.length <= 1 ? check('one_story', 'pass') : check('one_story', 'fail', `stories_${distinct.length}`)
  }
  // No material: story lines that share no topic word with an earlier story line start a new story.
  const groups: Array<Set<string>> = []
  for (const l of L.slice(1)) {
    if (!isStoryLine(l)) continue
    const w = topicWords(l)
    const g = groups.find((x) => shared(x, w) > 0)
    if (g) for (const x of w) g.add(x)
    else groups.push(w)
  }
  return groups.length <= 1 ? check('one_story', 'pass') : check('one_story', 'fail', `stories_${groups.length}`)
}

export const isSellGoal = (goal: unknown) => /^(?:sell|leads|lead|sales|launch|promo)/i.test(String(goal ?? '').trim())

const namesProduct = (l: string, products: readonly string[]) => products.some((p) => p.trim().length > 2 && l.toLowerCase().includes(p.trim().toLowerCase()))

/** A sell / leads script states the offer. */
export function leadsIncludeOffer(lines: readonly string[], ctx: StructureContext = {}): CheckResult {
  if (!isSellGoal(ctx.goal)) return check('leads_offer', 'n/a', 'non_sell')
  const L = clean(lines)
  const offer = topicWords(ctx.offer ?? '')
  for (let i = 0; i < L.length; i++) {
    const l = L[i]!
    if (offer.size >= 2 && shared(offer, topicWords(l)) / offer.size >= 0.5) return check('leads_offer', 'pass', null, i)
    if (namesProduct(l, ctx.products ?? []) && (BUY_RE.test(l) || OFFER_CTA_RE.test(l))) return check('leads_offer', 'pass', null, i)
    if (OFFER_CTA_RE.test(l) && BUY_RE.test(l)) return check('leads_offer', 'pass', null, i)
  }
  return check('leads_offer', 'fail', 'no_offer')
}

/** A non-sell script carries no pitch. */
export function noPitchInNonSell(lines: readonly string[], ctx: StructureContext = {}): CheckResult {
  if (isSellGoal(ctx.goal) || !ctx.goal) return check('no_pitch_non_sell', 'n/a', ctx.goal ? 'sell' : 'no_goal')
  const L = clean(lines)
  for (let i = 0; i < L.length; i++) {
    const l = L[i]!
    if (namesProduct(l, ctx.products ?? []) && BUY_RE.test(l)) return check('no_pitch_non_sell', 'fail', 'product_pitch', i)
    if (/(\$\s?\d|\bper month\b|\bfree trial\b)/i.test(l) && OFFER_CTA_RE.test(l)) return check('no_pitch_non_sell', 'fail', 'price_cta', i)
  }
  return check('no_pitch_non_sell', 'pass')
}

/** Her items a script uses: one line holds 60% of the item's topic words (or 5+ of them). */
export function itemsUsed(lines: readonly string[], material: readonly MaterialItem[]): string[] {
  const L = clean(lines).map(topicWords)
  const out: string[] = []
  for (const m of material) {
    const own = topicWords(m.text)
    if (own.size < 2) continue
    if (L.some((w) => { const h = shared(own, w); return h / own.size >= 0.6 || h >= 5 })) out.push(m.id)
  }
  return out
}

/** A reshape keeps every one of her items the script used before. */
export function reshapeKeepsReferences(before: readonly string[], after: readonly string[], material: readonly MaterialItem[]): CheckResult & { lost: string[] } {
  if (!material.length) return { ...check('reshape_keeps_refs', 'n/a', 'no_material'), lost: [] }
  const was = itemsUsed(before, material)
  const now = new Set(itemsUsed(after, material))
  const lost = was.filter((id) => !now.has(id))
  return { ...(lost.length ? check('reshape_keeps_refs', 'fail', `lost_${lost.length}`) : check('reshape_keeps_refs', 'pass')), lost }
}

export const PACING = { maxLineWords: 40, maxHookWords: 20, minWords: 50, maxWords: 160, longLine: 30, maxLongRun: 2 } as const

/** Pacing: line length, hook length, total and runs of long lines. */
export function pacing(lines: readonly string[]): CheckResult {
  const L = clean(lines)
  if (!L.length) return check('pacing', 'fail', 'empty')
  const wc = L.map(wordCount)
  const total = wc.reduce((a, b) => a + b, 0)
  if (wc[0]! > PACING.maxHookWords) return check('pacing', 'fail', 'long_hook', 0)
  const over = wc.findIndex((n) => n > PACING.maxLineWords)
  if (over >= 0) return check('pacing', 'fail', 'long_line', over)
  let run = 0
  for (let i = 0; i < wc.length; i++) { run = wc[i]! > PACING.longLine ? run + 1 : 0; if (run > PACING.maxLongRun) return check('pacing', 'fail', 'long_run', i) }
  if (total < PACING.minWords) return check('pacing', 'fail', 'too_short')
  if (total > PACING.maxWords) return check('pacing', 'fail', 'too_long')
  return check('pacing', 'pass')
}

/** All seven. `before` (the script before a reshape) is needed only for reshape_keeps_refs. */
export function runStructureChecks(lines: readonly string[], ctx: StructureContext = {}, before?: readonly string[]): CheckResult[] {
  const r = before ? reshapeKeepsReferences(before, lines, ctx.material ?? []) : null
  const refs = r ? check('reshape_keeps_refs', r.status, r.reason, r.line) : check('reshape_keeps_refs', 'n/a', 'no_reshape')
  return [hookPaysOff(lines), storyBeforeLesson(lines), oneStory(lines, ctx), leadsIncludeOffer(lines, ctx), noPitchInNonSell(lines, ctx), refs, pacing(lines)]
}
