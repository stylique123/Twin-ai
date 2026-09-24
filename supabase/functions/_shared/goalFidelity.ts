// GENERATED FROM packages/shared/src/script/goalFidelity.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// A FINISHED SCRIPT MUST DO WHAT ITS GOAL SAYS, AND SAY ONLY WHAT IS CONFIRMED.
//
// Four reported defects, measured on real generations of one creator
// (owner 8940bed4, voice d4d49c98), each with its own deterministic pass:
//
// 1. REBUTTAL FRAMING NOBODY ASKED FOR. Generation 81cfb5ba (goal: leads) said
//    "I still think…" three times — as a rebuttal to objections the video never
//    raised — and its Hook ("I still think keeping a strict turnaround rule
//    makes sense, even for a special rescue pup") contradicted its own Tension
//    beat ("when someone is welcoming a rescue dog… rules take a back seat").
//    The phrase was literally SUPPLIED by the entitlement repair instruction
//    ('state the view ("I still think…")'), which rewrote each line alone with
//    no view of the rest of the script. Rebuttal framing is only honest when the
//    chosen objective is built on a disagreement (goal `conversations`, focus
//    `opinion` / `review`); anywhere else the frame is removed.
//
// 2. PROMOTIONS NOBODY CONFIRMED. Generation ae4031ba (goal: sell) closed on
//    "take advantage of our buy 3 get 1 free offer". "BUY 3 GET 1 FREE" is on
//    her shop's front page and stored as a `needs_confirmation` product fact.
//    A promotion is time-bound and priced exactly like a price is, so it gets the
//    price rule: only a `user_confirmed` fact (or text she typed) may carry one
//    to the writer, and any promotion in the finished script that no confirmed
//    text backs is cut out of the line.
//
// 3. SELL AND GET-LEADS SHIPPED THE SAME ENDING. d0efa4b4 and 8ce1290d (sell)
//    and 81cfb5ba (leads) all closed on "Try one on your dog and tag us in the
//    photo" — neither a purchase nor a conversation. CTO decision: keep both and
//    differentiate structurally. Leads: a direct-contact ask (DM / message /
//    comment a keyword / book a call / link to enquire), never a buy. Sell: names
//    the product and points to buying it.
//
// 4. THE SHOT LIST IS DERIVED FROM THE TELEPROMPTER, NOT A SECOND AUTHOR.
//    `shotListClaimDiff` reports every spoken shot row whose words assert
//    something other than the teleprompter beat it belongs to, so the caller can
//    re-derive it and log the drift instead of shipping two scripts.
//
// ⚖️ REPAIR BY REMOVAL OR BY A FIXED LINE, NEVER BY INVENTION. Nothing here
// writes a new claim about the creator: a frame is removed, a promotion clause
// is removed, a mismatched CTA is replaced by a fixed, claim-free line built
// only from the offer's own name.
//
// Deno copy is GENERATED (scripts/ci/generate_shared_pilot_core.mjs).

import { isSilentBeat } from './silentBeat.ts'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9%$]+/g, ' ').trim()

// ── 1. REBUTTAL FRAMING ─────────────────────────────────────────────────────

/** Phrases that answer an objection. Each is a rebuttal wherever it appears. */
export const REBUTTAL_PATTERNS: readonly RegExp[] = [
  /\bI\s+still\s+(?:think|believe|say|stand\s+by|maintain)\b/i,
  /\b(?:some|many)\s+(?:people|folks|of\s+you)\s+(?:say|think|believe|assume|will\s+tell\s+you|might\s+say)\b/i,
  /\byou\s+(?:might|may|probably)\s+(?:think|be\s+thinking|say|assume|believe)\b/i,
  /\bI\s+know\s+what\s+you(?:'re|\s+are)\s+thinking\b/i,
  /\b(?:people|critics|others)\s+(?:often\s+)?(?:argue|claim|object)\b/i,
  /\bcontrary\s+to\s+(?:what|popular)\b/i,
  /\bdespite\s+what\s+(?:people|others|some|you)\b/i,
]

/** Goals/focuses whose whole mechanism is a disagreement or a comparison. */
export const REBUTTAL_GOALS: ReadonlySet<string> = new Set(['conversations'])
export const REBUTTAL_FOCUSES: ReadonlySet<string> = new Set(['opinion', 'review'])

export function rebuttalFramingAllowed(goal: unknown, focus: unknown): boolean {
  return REBUTTAL_GOALS.has(str(goal)) || REBUTTAL_FOCUSES.has(str(focus))
}

/** The rebuttal phrases present in a line, as written. */
export function findRebuttalFraming(line: unknown): string[] {
  const s = str(line)
  const out: string[] = []
  for (const re of REBUTTAL_PATTERNS) {
    const m = s.match(re)
    if (m) out.push(m[0])
  }
  return out
}

const cap = (s: string): string => s.replace(/^(\s*)([a-z])/, (_m, sp: string, c: string) => sp + c.toUpperCase())

/**
 * Remove rebuttal framing from one line. "I still think X" → "X"; "Some people
 * say X, but Y" → "Y". A sentence whose frame cannot be removed cleanly is left
 * as written and reported in `unrepaired`, never mangled.
 */
export function stripRebuttalFraming(line: unknown): { line: string; stripped: number; unrepaired: string[] } {
  const src = str(line)
  let stripped = 0
  const unrepaired: string[] = []
  const sentences = src.match(/[^.!?]+[.!?]*\s*/g) ?? (src ? [src] : [])
  const out = sentences.map((sent) => {
    if (findRebuttalFraming(sent).length === 0) return sent
    let s = sent
    // "I still think (that) X" — the view survives without the rebuttal.
    s = s.replace(/\bI\s+still\s+(?:think|believe|say|maintain)\s+(?:that\s+)?/i, () => { stripped++; return '' })
    s = s.replace(/\bI\s+still\s+stand\s+by\s+/i, () => { stripped++; return '' })
    // "<objection frame> X, but Y" — keep only the answer.
    const objection = /^\s*(?:and\s+|so\s+)?(?:(?:some|many|most)\s+(?:people|folks|of\s+you)\s+\w+(?:\s+\w+)?|you\s+(?:might|may|probably)\s+\w+(?:\s+\w+)?|I\s+know\s+what\s+you(?:'re|\s+are)\s+thinking|(?:people|critics|others)\s+(?:often\s+)?\w+|contrary\s+to\s+[^,]+|despite\s+what\s+[^,]+)[^]*?,\s*(?:but|and\s+yet|yet|however)\s+/i
    if (objection.test(s)) {
      s = s.replace(objection, () => { stripped++; return '' })
    } else if (/^\s*(?:contrary\s+to|despite\s+what)\b[^,]*,\s*/i.test(s)) {
      s = s.replace(/^\s*(?:contrary\s+to|despite\s+what)\b[^,]*,\s*/i, () => { stripped++; return '' })
    }
    // Tidy the join left behind: ", a soft…" after "best part" stays; a doubled
    // comma or a leading comma does not.
    s = s.replace(/,\s*,/g, ',').replace(/^\s*,\s*/, '')
    if (findRebuttalFraming(s).length > 0) unrepaired.push(sent.trim())
    const lead = sent.match(/^\s*/)?.[0] ?? ''
    return lead + cap(s.trimStart())
  })
  return { line: out.join('').replace(/\s{2,}/g, ' ').trim(), stripped, unrepaired }
}

export interface RebuttalRepair<T> { beats: T[]; stripped: number; beatsTouched: number[]; unrepaired: string[] }

/** Strip rebuttal framing from every spoken beat unless the objective uses it. */
export function repairRebuttalFraming<T extends { line?: unknown }>(
  beats: readonly T[] | null | undefined,
  goal: unknown,
  focus: unknown,
): RebuttalRepair<T> {
  const list = Array.isArray(beats) ? beats : []
  if (rebuttalFramingAllowed(goal, focus)) return { beats: [...list], stripped: 0, beatsTouched: [], unrepaired: [] }
  let stripped = 0
  const beatsTouched: number[] = []
  const unrepaired: string[] = []
  const out = list.map((b, i) => {
    const line = str(b?.line)
    if (findRebuttalFraming(line).length === 0) return b
    const r = stripRebuttalFraming(line)
    unrepaired.push(...r.unrepaired)
    if (r.stripped === 0 || r.line === line) return b
    stripped += r.stripped
    beatsTouched.push(i)
    return { ...b, line: r.line }
  })
  return { beats: out, stripped, beatsTouched, unrepaired }
}

/** The writer-prompt rule for the same thing, so prompt and check agree. */
export function rebuttalPromptRule(goal: unknown, focus: unknown): string {
  if (rebuttalFramingAllowed(goal, focus)) return ''
  return 'NO REBUTTAL FRAMING. This video\'s objective is not an objection or a comparison, so never answer'
    + ' an objection nobody raised: do not write "I still think", "some people say", "you might think",'
    + ' "I know what you\'re thinking" or any similar frame. State each point directly, and never let one'
    + ' beat contradict another.'
}

// ── 2. PROMOTIONS ───────────────────────────────────────────────────────────

const NUMBER_WORD: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
}
const N = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten)'

/** Every structure that makes a sentence a promotion. */
export const PROMOTION_PATTERNS: readonly RegExp[] = [
  new RegExp(`\\bbuy\\s+${N}\\s*,?\\s*(?:and\\s+)?get\\s+${N}(?:\\s+(?:free|half\\s+off|\\d+\\s*%\\s*off))?`, 'i'),
  /\bbogo\b/i,
  /\bbuy\s+one,?\s+get\s+one\b/i,
  /\b\d{1,3}\s*(?:%|percent)\s*off\b/i,
  /\$\s?\d+(?:\.\d+)?\s+off\b/i,
  /\b(?:discount|promo|coupon)\s+code\b/i,
  /\buse\s+(?:the\s+)?code\s+[A-Za-z0-9]+/i,
  /\bfree\s+shipping(?:\s+(?:on|over|for)\s+[^.,!?]*)?/i,
  /\b(?:on\s+sale|flash\s+sale|sale\s+ends|(?:summer|winter|spring|fall|autumn|holiday|black\s+friday|cyber\s+monday|clearance|site-?wide|end\s+of\s+season)\s+sale)\b/i,
  /\boff\s+your\s+first\s+order\b/i,
]

/** The promotional spans in a text, as written. */
export function promotionSpans(text: unknown): string[] {
  const s = str(text)
  const out: string[] = []
  for (const re of PROMOTION_PATTERNS) {
    const m = s.match(re)
    if (m) out.push(m[0].trim())
  }
  return out
}

export function isPromotional(text: unknown): boolean {
  return promotionSpans(text).length > 0
}

const canon = (s: string): string => ` ${norm(s).split(' ').map((w) => NUMBER_WORD[w] ?? w).join(' ')} `

/** Is this promotional span stated in confirmed text? */
export function promotionBacked(span: string, confirmedText: unknown): boolean {
  const c = canon(str(confirmedText))
  if (c.trim() === '') return false
  const s = canon(span).trim()
  return s !== '' && c.includes(` ${s} `)
}

export interface TrustedFact { field?: unknown; value?: unknown; trust?: unknown }

/**
 * May this stored fact reach the writer? A promotion needs `user_confirmed`,
 * exactly like a price; anything else needs `usable` or `user_confirmed`.
 */
export function factReachesWriter(f: TrustedFact | null | undefined): boolean {
  if (!f) return false
  const trust = str(f.trust)
  const field = str(f.field).toLowerCase()
  if (field === 'price' || field === 'promotion' || field === 'offer' || isPromotional(f.value)) {
    return trust === 'user_confirmed'
  }
  return trust === 'usable' || trust === 'user_confirmed'
}

/** Confirmed promotional text from facts (for backing post-generation). */
export function confirmedPromotionText(facts: readonly TrustedFact[] | null | undefined): string {
  return (Array.isArray(facts) ? facts : [])
    .filter((f) => str(f?.trust) === 'user_confirmed' && isPromotional(f?.value))
    .map((f) => str(f.value))
    .join('\n')
}

/** Remove unbacked promotions from one line: the clause if it can stand alone, else the sentence. */
export function removeUnbackedPromotion(line: unknown, confirmedText: unknown): { line: string; removed: string[] } {
  const src = str(line)
  const removed: string[] = []
  const sentences = src.match(/[^.!?]+[.!?]*\s*/g) ?? (src ? [src] : [])
  const kept: string[] = []
  for (const sent of sentences) {
    const bad = promotionSpans(sent).filter((sp) => !promotionBacked(sp, confirmedText))
    if (bad.length === 0) { kept.push(sent); continue }
    removed.push(...bad)
    const end = (sent.trim().match(/[.!?]+$/) ?? ['.'])[0]
    const body = sent.trim().replace(/[.!?]+$/, '')
    const clauses = body.split(/,\s*(?:and\s+|but\s+|or\s+)?|\s+(?:and|but|plus)\s+/)
    const good = clauses.filter((c) => c.trim() !== '' && !isPromotional(c) && !/^\s*(?:offer|deal|sale)\b/i.test(c))
    if (good.length > 0 && good.length < clauses.length && good.join(' ').split(/\s+/).length >= 3) {
      kept.push(`${cap(good.join(', ').trim())}${end} `)
    }
  }
  return { line: kept.join('').replace(/\s{2,}/g, ' ').trim(), removed }
}

export interface PromotionRepair<T> { beats: T[]; removed: string[]; beatsTouched: number[]; emptied: number[] }

/** Cut every promotion no confirmed text backs, across a script. */
export function removeUnbackedPromotions<T extends { line?: unknown }>(
  beats: readonly T[] | null | undefined,
  confirmedText: unknown,
): PromotionRepair<T> {
  const list = Array.isArray(beats) ? beats : []
  const removed: string[] = []
  const beatsTouched: number[] = []
  const emptied: number[] = []
  const out = list.map((b, i) => {
    const line = str(b?.line)
    if (!isPromotional(line)) return b
    const r = removeUnbackedPromotion(line, confirmedText)
    if (r.removed.length === 0) return b
    removed.push(...r.removed)
    beatsTouched.push(i)
    if (r.line === '') emptied.push(i)
    return { ...b, line: r.line }
  })
  return { beats: out, removed, beatsTouched, emptied }
}

// ── 3. THE CTA MUST MATCH THE GOAL ──────────────────────────────────────────

const CONTACT = /\b(?:dm|dms|direct\s+message|message\s+me|send\s+(?:me\s+)?(?:a\s+)?(?:message|dm|note)|text\s+me|email\s+me|comment\s+["'“]?[A-Za-z0-9-]+["'”]?\s+(?:below|and|to)|comment\s+(?:below\s+)?(?:with\s+)?(?:the\s+word|["'“])|book\s+(?:a|your)\s+(?:call|consult|consultation|session|chat|spot)|reach\s+out|get\s+in\s+touch|enquir(?:e|y)|inquir(?:e|y)|apply\s+(?:through|via|at|now)|link\s+in\s+(?:my\s+)?bio\s+to\s+(?:book|enquire|inquire|apply|chat|talk))\b/i
const BUY = /\b(?:buy|shop|order(?:\s+(?:yours|one|now))?|purchase|add\s+to\s+cart|check\s*out|checkout|grab\s+(?:yours|one|it)|get\s+yours|pick\s+(?:one|yours)\s+up|in\s+my\s+shop|link\s+(?:is\s+)?in\s+my\s+bio|link\s+in\s+bio|available\s+(?:now|in|at|on))\b/i

export function ctaIntent(line: unknown): { contact: boolean; buy: boolean } {
  const s = str(line)
  return { contact: CONTACT.test(s), buy: BUY.test(s) }
}

const STOP = new Set(['the', 'a', 'an', 'my', 'our', 'your', 'and', 'of', 'for', 'with', 'to', 'in', 'on'])
const contentWords = (s: string): string[] => norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w))

/** Does the line name the offer? At least half of its content words, minimum one. */
export function namesOffer(line: unknown, offerName: unknown): boolean {
  const words = contentWords(str(offerName))
  if (words.length === 0) return false
  const l = ` ${norm(str(line))} `
  const hit = words.filter((w) => l.includes(` ${w} `) || l.includes(` ${w}s `) || (w.endsWith('s') && l.includes(` ${w.slice(0, -1)} `)))
  return hit.length >= Math.max(1, Math.ceil(words.length / 2))
}

export type CtaFit = 'fits' | 'no_contact_ask' | 'buy_on_leads' | 'no_buy_pointer' | 'offer_not_named' | 'not_checked'

/** Does the CTA line do what the goal needs? Only `sell` and `leads` are checked. */
export function ctaFitsGoal(line: unknown, goal: unknown, offerName?: unknown): CtaFit {
  const g = str(goal)
  const { contact, buy } = ctaIntent(line)
  if (g === 'leads') {
    if (buy && !contact) return 'buy_on_leads'
    if (/\b(?:buy|shop|purchase|add\s+to\s+cart|checkout|order\s+now)\b/i.test(str(line))) return 'buy_on_leads'
    return contact ? 'fits' : 'no_contact_ask'
  }
  if (g === 'sell') {
    if (!buy) return 'no_buy_pointer'
    if (str(offerName).trim() !== '' && !namesOffer(line, offerName)) return 'offer_not_named'
    return 'fits'
  }
  return 'not_checked'
}

const speakableOffer = (o: unknown): string => {
  const s = str(o).trim()
  return s !== '' && s.length <= 48 && !/[\n\r]/.test(s) && s.toLowerCase() !== 'unspecified' ? s : ''
}

/** A fixed, claim-free CTA for the goal. Price only when the caller confirmed it. */
export function ctaForGoal(goal: unknown, offerName?: unknown, confirmedPrice?: unknown): string {
  const g = str(goal)
  const o = speakableOffer(offerName)
  const price = str(confirmedPrice).trim()
  if (g === 'leads') {
    return o !== ''
      ? `DM me and I'll help you pick the right ${o.toLowerCase()}.`
      : "DM me and we'll talk it through."
  }
  if (g === 'sell') {
    if (o === '') return 'Grab yours — the link is in my bio.'
    return price !== ''
      ? `The ${o} is ${price} — grab yours, the link is in my bio.`
      : `Grab your ${o} — the link is in my bio.`
  }
  return ''
}

/** Index of the CTA beat: the last spoken beat that is not an unanswered ask. */
export function ctaBeatIndex(beats: ReadonlyArray<{ line?: unknown; ask?: unknown; section?: unknown }> | null | undefined): number {
  const list = Array.isArray(beats) ? beats : []
  for (let i = list.length - 1; i >= 0; i--) {
    if (str(list[i]?.line).trim() !== '') return i
  }
  return -1
}

export interface CtaRepair<T> { beats: T[]; index: number; before: CtaFit; replaced: boolean; line: string | null }

/**
 * Make the closing beat do what the goal needs. A leads CTA that asks nobody to
 * make contact, or asks them to buy, and a sell CTA that points nowhere to buy
 * or never names the product, is replaced by `ctaForGoal`. A sell CTA missing
 * only the product name keeps its words and gets the fixed line appended, so a
 * line the creator's own `defaultCta` produced is not thrown away.
 */
export function repairCtaForGoal<T extends { line?: unknown; section?: unknown }>(
  beats: readonly T[] | null | undefined,
  goal: unknown,
  offerName?: unknown,
  confirmedPrice?: unknown,
): CtaRepair<T> {
  const list = Array.isArray(beats) ? [...beats] : []
  const index = ctaBeatIndex(list as ReadonlyArray<{ line?: unknown }>)
  if (index < 0) return { beats: list, index, before: 'not_checked', replaced: false, line: null }
  const current = str(list[index]!.line)
  const before = ctaFitsGoal(current, goal, offerName)
  if (before === 'fits' || before === 'not_checked') return { beats: list, index, before, replaced: false, line: null }
  const fixed = ctaForGoal(goal, offerName, confirmedPrice)
  if (fixed === '') return { beats: list, index, before, replaced: false, line: null }
  // Keep the beat's non-CTA lead-in (its first sentences) when the beat is
  // longer than one sentence; replace only the closing ask.
  const sentences = current.match(/[^.!?]+[.!?]*\s*/g) ?? [current]
  const lead = sentences.length > 1
    ? sentences.slice(0, -1).filter((s) => {
      const i = ctaIntent(s)
      return !i.buy && !i.contact
    }).join('').trim()
    : ''
  const line = lead !== '' ? `${lead} ${fixed}` : fixed
  list[index] = { ...list[index]!, line }
  return { beats: list, index, before, replaced: true, line }
}

/** The writer-prompt rule for the CTA, so prompt and check agree. */
export function ctaGoalPromptRule(goal: unknown, offerName?: unknown, priceConfirmed?: boolean): string {
  const g = str(goal)
  const o = speakableOffer(offerName)
  if (g === 'leads') {
    return 'THE CALL TO ACTION IS A DIRECT-CONTACT ASK — the viewer contacts the creator: DM me, send me a message,'
      + ' comment a keyword, book a call, or use the link to enquire. NEVER a buy/shop/order CTA; this video'
      + ' opens a conversation, it does not close a sale.'
  }
  if (g === 'sell') {
    return 'THE CALL TO ACTION SELLS: it names ' + (o !== '' ? `"${o}"` : 'the product or offer') + ' and points the viewer'
      + ' to buying it (shop / link in bio / order).'
      + (priceConfirmed ? ' Its confirmed price may be stated.' : ' Do NOT state a price or a promotion — none is confirmed.')
      + ' Never end on a comment, tag or follow ask instead.'
  }
  return ''
}

// ── 4. THE SHOT LIST IS DERIVED FROM THE TELEPROMPTER ───────────────────────

export interface ShotClaimDrift { row: number; beat: number; shot: string; line: string }

/**
 * Every spoken shot row whose words differ from the teleprompter beat it maps
 * to (same pointer rule as `syncShotListSpokenText`: only rows with spoken text
 * advance). Empty means the shot list says exactly what the teleprompter says.
 */
export function shotListClaimDiff(
  shots: ReadonlyArray<{ spoken_text?: unknown }> | null | undefined,
  script: ReadonlyArray<{ line?: unknown }> | null | undefined,
): ShotClaimDrift[] {
  const rows = Array.isArray(shots) ? shots : []
  const beats = Array.isArray(script) ? script : []
  const out: ShotClaimDrift[] = []
  let k = 0
  rows.forEach((r, row) => {
    const shot = str(r?.spoken_text)
    if (shot.trim() === '') return
    const raw = str(beats[k]?.line)
    const line = isSilentBeat(raw) ? '' : raw
    if (norm(shot) !== norm(line)) out.push({ row, beat: k, shot, line })
    k++
  })
  return out
}

// ── 5. A PRODUCT THE SCAN INFERRED IS NOT A PRODUCT SHE CONFIRMED ───────────
//
// ⚠️ MEASURED: "Autumn Collection" reached two of her scripts (a5416d6d,
// 4681cffe) as "our Autumn Collection scrunchie bandanas". It is NOT writer
// output persisted as knowledge — `creator_knowledge` row f26eb603 is
// `kind='product', source='caption'`, text "Autumn Collection scrunchie
// bandanas", inferred by the DNA scan from her captions. But a caption that
// mentioned a seasonal drop once is not an established product line, and the
// integrity pass grounded the name against that same row, so it survived.
//
// ⚖️ A scan-inferred product item (source caption/transcript, never confirmed
// by her) may inform the writer, but may not be presented as an established
// product line or name unless it matches a product in her library or brand.

/** Sources that are a model's reading of her public content, not her word. */
export const INFERRED_KNOWLEDGE_SOURCES: ReadonlySet<string> = new Set(['caption', 'transcript'])

export interface KnowledgeProductRow { kind?: unknown; source?: unknown; text?: unknown; creator_confirmed_at?: unknown }

/** Does this item name something in her library or brand? */
export function matchesConfirmedProduct(text: unknown, confirmedNames: readonly unknown[]): boolean {
  const t = ` ${norm(str(text))} `
  return confirmedNames.some((n) => {
    const words = contentWords(str(n))
    if (words.length === 0) return false
    const hits = words.filter((w) => t.includes(` ${w} `) || t.includes(` ${w}s `))
    return hits.length === words.length
  })
}

/** An inferred, unconfirmed `product` row that matches nothing she confirmed. */
export function isUnconfirmedInferredProduct(row: KnowledgeProductRow | null | undefined, confirmedNames: readonly unknown[]): boolean {
  if (!row || str(row.kind) !== 'product') return false
  if (!INFERRED_KNOWLEDGE_SOURCES.has(str(row.source))) return false
  if (str(row.creator_confirmed_at).trim() !== '') return false
  return !matchesConfirmedProduct(row.text, confirmedNames)
}

/** The mark the writer sees on such an item. */
export const UNCONFIRMED_PRODUCT_MARK =
  ' [inferred from her posts, NOT a confirmed product: never present this as an established product line or name — refer to it generically (e.g. "my scrunchie bandanas")]'
