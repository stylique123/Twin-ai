// GENERATED FROM packages/shared/src/script/inventionGate.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// THE ZERO-INVENTION GATE, STAGE 1 (design v1, Part A; owner amendments a–g).
//
// Every factual sentence a creator is handed — spoken lines, hook options,
// titles, captions, on-screen text — must be entailed by an item of the
// material the writer was given, IN SCOPE (the right product), with numbers
// matched to their FIELD, and with the gated claim classes (audience,
// customer, result, scarcity) backed by first-party or live evidence.
//
// Pure: no I/O, no model call. The edge function (and the offline
// calibration script) supply the model call; this module builds the ledger,
// pre-classifies by rule, writes the judge prompt, parses its JSON strictly,
// combines both into S/E/I/N, plans repairs and applies them.
//
// ⚠️ NO IMPORTS ON PURPOSE: scripts/ci and the calibration script load this
// file directly under Node's type stripping, which cannot resolve a `.js`
// specifier to a `.ts` source. The record carries ids, indexes and reasons
// only — never text.

export const INVENTION_GATE_VERSION = 'invention-gate-v1'

/** Judge models, as TASK CLASSES of worker/model_routing_v1.json (no model
 *  literal outside the catalog — check_model_routing). Cheapest first:
 *  `read` is the writer-family flash model, `extract` the stronger pro model.
 *  The edge runs the flash judge; calibration runs both (owner amendment b). */
export const INVENTION_JUDGE_TASKS = ['read', 'extract'] as const

/** Hard cap on the whole gate per request (owner amendment d). */
export const INVENTION_GATE_TIMEOUT_MS = 25_000
export const INVENTION_GATE_MAX_ROUNDS = 2
/** ≈ one E per this many words may remain (design A5). */
export const E_BUDGET_WORDS = 150
/** Need Check cap (design B4). */
export const MAX_ASKS = 3
export const SPOKEN_FLOOR = 3

// ── LEDGER ─────────────────────────────────────────────────────────────────

export type ItemOrigin =
  | 'her_story' | 'her_fact' | 'her_answer' | 'product_fact' | 'offer' | 'urgency'
  | 'outside_research' | 'outside_moment' | 'niche_note' | 'audience_question'

export type NumberUnit = 'money' | 'weight' | 'volume' | 'duration' | 'percent' | 'ratio' | 'temperature' | 'count'

export interface LedgerNumber { value: number; unit: NumberUnit; field: string }

export interface LedgerItem {
  id: string
  origin: ItemOrigin
  product_id: string | null
  field: string | null
  text: string
  numbers: LedgerNumber[]
  first_party: boolean
  live: boolean
  source_label: string
}

export interface LedgerInput {
  /** Her knowledge rows the writer was shown (creator_knowledge shape). */
  knowledge?: ReadonlyArray<{ id?: unknown; kind?: unknown; text?: unknown }> | null
  /** Her answers for this request, keyed by slot. */
  answers?: Record<string, unknown> | null
  /** Her request note. */
  note?: unknown
  /** Every product on file; the target is `targetProductId`. */
  products?: ReadonlyArray<{ id?: unknown; name?: unknown; offer?: unknown; knowledge?: unknown }> | null
  targetProductId?: string | null
  /** The offer record (what the close may restate). */
  offer?: unknown
  /** Outside material: research, moments, niche notes, audience (Reddit) items. */
  outside?: ReadonlyArray<{ id?: unknown; kind?: unknown; text?: unknown }> | null
  /** ms since epoch; urgency is live only when expires_at is after it. */
  now?: number
}

const STORY_KINDS = new Set(['experience', 'example', 'story'])
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, dozen: 12, half: 0.5,
}
const UNIT_WORDS: Array<[RegExp, NumberUnit]> = [
  [/^(?:dollars?|bucks|usd|eur|euros?|pounds? sterling|gbp)$/, 'money'],
  [/^(?:oz|ounces?|lbs?|pounds?|g|grams?|kg|kilos?|kilograms?)$/, 'weight'],
  [/^(?:ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|cups?|fl)$/, 'volume'],
  [/^(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|decades?)$/, 'duration'],
  [/^(?:%|percent|per ?cent)$/, 'percent'],
  [/^(?:parts?)$/, 'ratio'],
  [/^(?:degrees?|°[cf]?|f|c)$/, 'temperature'],
]
/** Count nouns that only structure a script ("three things"), never a claim. */
const STRUCTURE_NOUNS = /^(?:things?|tips?|ways?|reasons?|mistakes?|steps?|secrets?|rules?|signs?|questions?|lessons?|ideas?|tricks?|more|of|thing)$/
const UNIT_FIELD: Record<NumberUnit, string> = {
  money: 'price', weight: 'size', volume: 'size', duration: 'duration', percent: 'proof_number',
  ratio: 'process_step', temperature: 'process_step', count: 'count',
}

function unitOf(word: string): NumberUnit | null {
  const w = word.toLowerCase().replace(/[.,;:!?)]+$/, '')
  for (const [re, u] of UNIT_WORDS) if (re.test(w)) return u
  return null
}

/** Numbers in a text, each with its unit and field. Parsed once per item. */
export function parseNumbers(text: unknown, field: string | null = null): LedgerNumber[] {
  const out: LedgerNumber[] = []
  const t = String(text ?? '')
  // Tokens keep "$12", "12oz", "two-pound", "50%" together, then split.
  const toks = t.replace(/(\d)\s*-\s*(?=[a-z])/gi, '$1 ').replace(/([a-z])-(?=[a-z])/gi, '$1 ')
    .split(/\s+/).filter(Boolean)
  for (let k = 0; k < toks.length; k++) {
    const raw = toks[k]!
    const lower = raw.toLowerCase().replace(/^[("'“]+|[)"'”.,;:!?]+$/g, '')
    let value: number | null = null
    let unit: NumberUnit | null = null
    const money = lower.match(/^[$£€](\d+(?:[.,]\d+)?)/)
    const glued = lower.match(/^(\d+(?:[.,]\d+)?)([a-z%°]+)$/)
    if (money) { value = Number(money[1]!.replace(',', '.')); unit = 'money' }
    else if (glued) { value = Number(glued[1]!.replace(',', '.')); unit = unitOf(glued[2]!) ?? (glued[2] === 'x' ? 'count' : null) }
    else if (/^\d+(?:[.,]\d+)?%?$/.test(lower)) { value = Number(lower.replace('%', '').replace(',', '.')); if (lower.endsWith('%')) unit = 'percent' }
    else if (lower in NUMBER_WORDS) {
      value = NUMBER_WORDS[lower]!
      // "one" and "half" alone are idiom far more often than a claim.
      if ((lower === 'one' || lower === 'half') && !unitOf(toks[k + 1] ?? '')) continue
    }
    if (value === null || !Number.isFinite(value)) continue
    if (!unit) {
      const next = (toks[k + 1] ?? '').toLowerCase().replace(/[.,;:!?)]+$/, '')
      unit = unitOf(next)
      if (!unit && STRUCTURE_NOUNS.test(next)) continue
      if (!unit && /^(?:am|pm|a\.m|p\.m)/.test(next)) unit = 'duration'
    }
    const u: NumberUnit = unit ?? 'count'
    out.push({ value, unit: u, field: u === 'count' ? (field ?? 'count') : UNIT_FIELD[u] })
  }
  return out
}

function knowledgeList(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []
}

const OUTSIDE_ORIGIN: Record<string, ItemOrigin> = {
  research: 'outside_research', world: 'outside_research', moment: 'outside_moment', trend: 'outside_moment',
  niche: 'niche_note', note: 'niche_note', audience: 'audience_question', reddit: 'audience_question',
}

/** The material ledger (design A2): every item the writer was given, with id and scope. */
export function buildLedger(input: LedgerInput): LedgerItem[] {
  const now = input.now ?? 0
  const items: LedgerItem[] = []
  const push = (it: Omit<LedgerItem, 'numbers' | 'source_label'> & { source_label?: string }) => {
    if (!it.text) return
    items.push({ ...it, numbers: parseNumbers(it.text, it.field), source_label: it.source_label ?? it.origin })
  }
  ;(input.knowledge ?? []).forEach((k, n) => {
    const kind = str(k?.kind).toLowerCase()
    push({ id: str(k?.id) || `k${n}`, origin: STORY_KINDS.has(kind) ? 'her_story' : 'her_fact', product_id: null,
      field: kind || null, text: str(k?.text), first_party: true, live: false })
  })
  for (const [key, v] of Object.entries(input.answers ?? {})) {
    push({ id: `answer:${key}`, origin: 'her_answer', product_id: null, field: key, text: str(v), first_party: true, live: false })
  }
  push({ id: 'note', origin: 'her_answer', product_id: null, field: 'note', text: str(input.note), first_party: true, live: false })
  for (const p of input.products ?? []) {
    const pid = str(p?.id)
    if (!pid) continue
    knowledgeList(p?.knowledge).forEach((f, n) => {
      const field = str(f.field).toLowerCase() || null
      const text = str(f.value) || str(f.text)
      const confirmed = str(f.trust) !== 'unconfirmed'
      const exp = Date.parse(str(f.expires_at))
      const isUrgency = field === 'urgency'
      push({
        id: str(f.id) || `p:${pid}:${field ?? 'fact'}:${n}`,
        origin: isUrgency ? 'urgency' : 'product_fact',
        product_id: pid, field, text,
        first_party: confirmed,
        live: isUrgency && confirmed && Number.isFinite(exp) && exp > now && !!(str(f.source) || str(f.source_url)),
      })
    })
  }
  push({ id: 'offer', origin: 'offer', product_id: input.targetProductId ?? null, field: 'offer', text: str(input.offer), first_party: true, live: false })
  ;(input.outside ?? []).forEach((o, n) => {
    push({ id: str(o?.id) || `o${n}`, origin: OUTSIDE_ORIGIN[str(o?.kind).toLowerCase()] ?? 'outside_research',
      product_id: null, field: null, text: str(o?.text), first_party: false, live: false })
  })
  return items
}

// ── WORDS ──────────────────────────────────────────────────────────────────

const STOP = new Set(('the a an and or but of to in on at for with from by as is are was were be been being it its this that these those '
  + 'i me my mine we our us you your yours he she her his they them their there here what when where why how who which '
  + 'so just really very do does did done have has had not no yes can could will would should may might must about '
  + 'into out up down over than then too also only even still every all any some more most much many one get got '
  + 'make made like know think thing things way').split(' '))
function stem(w0: string): string {
  let w = w0.length > 3 ? w0.replace(/(?:es|s)$/, '') : w0
  if (w.length > 4) w = w.replace(/(?:ing|ed|ly)$/, '')
  return w.replace(/(.)\1$/, '$1')
}
export function contentWords(text: unknown): Set<string> {
  const out = new Set<string>()
  for (const w0 of String(text ?? '').toLowerCase().split(/[^a-z0-9']+/)) {
    const w = w0.replace(/'s?$/, '').replace(/'/g, '')
    if (w.length < 3 || STOP.has(w)) continue
    out.add(stem(w))
  }
  return out
}
function overlap(sentence: Set<string>, item: Set<string>): number {
  if (sentence.size === 0) return 0
  let hit = 0
  for (const w of sentence) if (item.has(w)) hit++
  return hit / sentence.size
}
export function wordCount(s: string): number { return s.trim().split(/\s+/).filter(Boolean).length }

// ── SURFACES ───────────────────────────────────────────────────────────────

export type Surface = 'script' | 'hook_option' | 'title' | 'caption' | 'publish_caption' | 'thumbnail_text'

export interface GateSentence {
  i: number
  surface: Surface
  /** Index into the surface's array (script beat, hook option, title, …). */
  at: number
  /** Sentence index inside that entry. */
  k: number
  text: string
  section?: string
}

export interface GateBlueprint {
  script?: unknown
  hook_options?: unknown
  captions?: unknown
  packaging?: unknown
  publish_plan?: unknown
  shot_list?: unknown
  [key: string]: unknown
}

const PLACEHOLDER_RE = /\[Your answer:[^\]]*\]/g
export const isPlaceholder = (s: string) => /^\[Your answer:[^\]]*\]$/.test(s.trim())

export function splitSentences(text: string): string[] {
  // A placeholder for her answer is one unit, never split or judged.
  const parts: string[] = []
  let last = 0
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    parts.push(...splitPlain(text.slice(last, m.index)), m[0])
    last = (m.index ?? 0) + m[0].length
  }
  return [...parts, ...splitPlain(text.slice(last))]
}
function splitPlain(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]*["”')]*/g) ?? []).map((s) => s.trim()).filter((s) => /[A-Za-z0-9]/.test(s))
}

/** Every creator-facing sentence the gate covers (owner amendment c). */
export function extractSentences(bp: GateBlueprint): GateSentence[] {
  const out: GateSentence[] = []
  const add = (surface: Surface, at: number, text: unknown, section?: string) => {
    if (typeof text !== 'string' || !text.trim()) return
    splitSentences(text).forEach((s, k) => out.push({ i: out.length, surface, at, k, text: s, ...(section ? { section } : {}) }))
  }
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
  arr(bp.script).forEach((b, at) => add('script', at, (b as { line?: unknown })?.line, str((b as { section?: unknown })?.section) || undefined))
  arr(bp.hook_options).forEach((h, at) => add('hook_option', at, h))
  const pk = (bp.packaging && typeof bp.packaging === 'object' ? bp.packaging : {}) as { titles?: unknown; thumbnail?: { text_overlay?: unknown } }
  arr(pk.titles).forEach((t, at) => add('title', at, t))
  add('thumbnail_text', 0, pk.thumbnail?.text_overlay)
  arr(bp.captions).forEach((c, at) => add('caption', at, c))
  arr(bp.publish_plan).forEach((p, at) => add('publish_caption', at, (p as { caption?: unknown })?.caption))
  return out
}

// ── RULES ──────────────────────────────────────────────────────────────────

export type GateClass = 'S' | 'E' | 'I' | 'N'
export type ClaimType =
  | 'audience' | 'customer' | 'result' | 'scarcity' | 'number' | 'event' | 'quote' | 'feeling'
  | 'presupposition' | 'cross_product' | 'product' | 'opinion' | 'general' | 'figurative' | 'hyperbole'

export type GateReason =
  | 'entailed' | 'stronger_than_item' | 'hyperbole' | 'no_item' | 'number_unmatched' | 'cross_product'
  | 'gated_no_first_party' | 'scarcity_not_live' | 'event_unbacked' | 'invented_quote' | 'pure_question'
  | 'figurative' | 'truism' | 'cta' | 'opinion_unbacked' | 'no_claim' | 'judge_missing' | 'e_over_budget'

const AUDIENCE_RE = /\b(?:people|everyone|everybody|you guys|y'all|folks|my followers|followers|viewers|so many of you|a lot of you|half of you|most of you)\b[^.!?]{0,30}\b(?:ask|asks|asked|asking|tell|tells|told|say|says|said|think|thinks|dm|message|comment|comments|want|wants|love|loves)\b|\b(?:i (?:always |constantly |keep )?get asked|the (?:number one|#1|most common) question|you (?:always|keep) ask(?:ing)?|you guys always)\b/i
const CUSTOMER_RE = /\b(?:customers?|clients?|regulars?|buyers?|shoppers?|subscribers?|members|students|users)\b[^.!?]{0,40}\b(?:say|says|said|tell|tells|told|love|loves|loved|rave|keep|come|came|order|orders|ordered|buy|buys|bought|ask|asks|asked|write|wrote|swear|swears|walk|walks|reorder)\b|\b(?:best[- ]?seller|five[- ]star|5[- ]star|reviews? (?:say|call)|rave reviews|fan favou?rite|crowd favou?rite)\b/i
const SCARCITY_RE = /\b(?:sells? out|sold out|selling (?:out|fast)|only \S+ left|only\b[^.!?]{0,40}\b(?:left|remaining)|limited (?:batch|stock|run|edition|time|supply)|almost gone|last chance|won't last|while (?:supplies|stocks?) last|running out|few left|back in stock|never restock|once it'?s gone)\b/i
const RESULT_RE = /\b(?:saved my (?:life|mornings?|business|sanity)|changed my life|changed everything|life[- ]changing|you'?ll (?:get|see|feel|notice|save|lose|gain|sleep)|guarantee[ds]?|guaranteed|transform(?:s|ed)? (?:your|my)|cured|fix(?:es|ed)? (?:your|my) \w+ for good|doubled? (?:my|your)|tripled|in (?:just )?\d+ days)\b/i
const EVENT_RE = /\b(?:i|we|she|he|they|my \w+|a (?:regular|customer|client|friend|neighbou?r|woman|man|guy|lady)|someone|one (?:customer|regular|client))\s+(?:was|were|had|went|came|walked|spilled|dropped|burned|burnt|lost|found|got|started|quit|opened|closed|tried|cried|laughed|realized|realised|decided|moved|ordered|bought|told|asked|said|wrote|messaged|showed|brought|sent|called|comes?|walks?|orders?|asks?|tells?|messages?|shows? up|drives?|drove|stopped|stops|began|begins|almost|nearly|finally|once)\b|\b(?:last (?:week|month|year|night|summer|winter|spring|fall|time)|yesterday|this morning|the other day|years ago|one day|the first time|that'?s how|ever since|back when|when i (?:first|started))\b/i
const QUOTE_RE = /["“][^"”]{6,}["”]|\b(?:said|says|told me|tells me|wrote|asked me)\s*[,:]\s*\S/i
const FEELING_RE = /\b(?:i (?:felt|cried|panicked|was (?:terrified|devastated|heartbroken|thrilled|shaking)|nearly cried|almost cried|freaked out)|my heart (?:sank|broke|raced))\b/i
const PRESUP_Q_RE = /^(?:did you know|ever (?:wonder|wondered|notice|noticed)|have you (?:ever )?(?:noticed|wondered|seen)|guess (?:how|what|why)|want to know why|why (?:do|does|did|is|are) (?:my|our|this|these|the|every)|what (?:makes|made) (?:my|our|this))\b/i
const FIGURATIVE_RE = /\b(?:(?:a|like a) (?:hug|warm hug|love letter|little ritual|ritual|magic|tiny vacation|vacation|sunrise|blanket|dream|party|cheat code|superpower)|in a (?:mug|cup)|pure (?:joy|magic|comfort|bliss)|happiness in a|liquid (?:gold|sunshine|courage)|my (?:happy place|love language|whole personality)|chef'?s kiss|heaven|a vibe|hits different|main character|sunshine in)\b/i
const HYPERBOLE_RE = /\b(?:literally|seriously|honestly|basically) (?:saved|changed|the best|obsessed|can'?t live|my whole)|\b(?:saved my (?:life|mornings?|sanity)|changed my life|can'?t live without|obsessed)\b/i
const CTA_RE = /\b(?:link in (?:my |the )?bio|order (?:now|today|yours)|shop (?:now|the)|grab (?:yours|a bag|one)|dm me|comment (?:below|\w+ and)|follow (?:for|me|along)|tap (?:the|to)|click (?:the|below)|book (?:now|a|your)|save this|try it)\b/i
const OPINION_RE = /\b(?:i (?:think|believe|love|prefer|like|hate|swear by|always say|feel like)|my (?:favou?rite|take|rule|go-to)|in my opinion|for me,?)\b/i
const COMPARATIVE_RE = /\b(?:\w+er than|more \w+ than|less \w+ than|the (?:best|only|first|most|least)|studies|science|research shows|proven|clinically|percent|%)\b/i
const FIRST_PERSON_RE = /\b(?:i|i'm|i've|i'd|i'll|me|my|mine|we|we're|we've|our|ours|us)\b/i
/** Share of a gated/event sentence's claim words her own item must share before the judge may back it. */
export const HER_MIN = 0.34
/** A sentence about "it"/"this" is about the product, never a truism. */
const PRODUCT_PRONOUN_RE = /\b(?:it|it's|its|this|these|they|they're|ours?)\b/i
/** A quantified or business-specific statement is never a harmless truism. */
const SPECIFIC_RE = /\b(?:every|each|always|never|all of|only)\b|\b(?:ships?|shipped|roast(?:s|ed)?|sourced?|handmade|organic|same[- ]day|small[- ]batch(?:es)?|award|certified|imported|local(?:ly)?)\b/i
const SECOND_PERSON_PROMISE_RE = /\byou(?:'ll| will| would)\b/i

export interface RuleRead {
  claim_types: ClaimType[]
  /** A hard rule verdict the judge cannot overturn. */
  hard: { cls: 'I'; reason: GateReason } | null
  /** A soft verdict: the judge may only overturn it with a hard claim type. */
  soft: { cls: 'N'; reason: GateReason } | null
  /** Items the pre-filter thinks are close (in scope first). */
  near: string[]
  subject_product: string | null
}

const HARD_TYPES = new Set<ClaimType>(['event', 'number', 'quote', 'scarcity', 'audience', 'customer', 'result', 'cross_product', 'feeling', 'presupposition'])
const GATED = new Set<ClaimType>(['audience', 'customer', 'result', 'scarcity'])

export interface ProductName { id: string; name: string }

/** Her own words: what can back an event, a quote, a feeling, an audience or a
 *  customer claim. A confirmed product testimonial/review counts too. Outside
 *  items never do ("people on Reddit ask" is not her audience). */
export function isHerOwn(it: LedgerItem): boolean {
  if (it.origin === 'her_story' || it.origin === 'her_fact' || it.origin === 'her_answer') return true
  return it.origin === 'product_fact' && it.first_party && /^(?:testimonial|review|proof_number|claim|faq)$/.test(it.field ?? '')
}

function productWordsOf(name: string): Set<string> {
  return contentWords(name.replace(/\(.*?\)/g, ' '))
}

/** Which product a sentence is about: one it names, else the target. */
export function subjectProduct(text: string, products: readonly ProductName[], targetId: string | null): string | null {
  const ws = contentWords(text)
  let best: { id: string; score: number } | null = null
  for (const p of products) {
    const pw = productWordsOf(p.name)
    if (pw.size === 0) continue
    let hit = 0
    for (const w of pw) if (ws.has(w)) hit++
    const score = hit / pw.size
    if (score >= 0.5 && (!best || score > best.score)) best = { id: p.id, score }
  }
  return best ? best.id : targetId
}

export function inScope(item: LedgerItem, subject: string | null): boolean {
  return item.product_id === null || item.product_id === subject
}

function numbersMatch(n: LedgerNumber, items: readonly LedgerItem[]): boolean {
  return items.some((it) => it.numbers.some((m) => m.value === n.value && m.unit === n.unit
    && (n.unit === 'count' || m.field === n.field || it.field === n.field || it.origin !== 'product_fact')))
}

/** Rule pre-classifier (design A3). Never switched off by "story on file". */
export function ruleRead(s: GateSentence, ledger: readonly LedgerItem[], products: readonly ProductName[], targetId: string | null): RuleRead {
  const t = s.text
  const types: ClaimType[] = []
  const subject = subjectProduct(t, products, targetId)
  if (subject && targetId && subject !== targetId) types.push('product')
  const scoped = ledger.filter((it) => inScope(it, subject))
  const outOfScope = ledger.filter((it) => !inScope(it, subject))
  const ws = contentWords(t)
  // Product-name words would make any line "overlap" its own product's facts;
  // evidence is measured on the rest of the sentence.
  const nameWords = new Set(products.flatMap((p) => [...productWordsOf(p.name)]))
  const claimWs = new Set([...ws].filter((w) => !nameWords.has(w)))
  const ranked = ledger.map((it) => ({ it, o: overlap(ws, contentWords(it.text)), c: overlap(claimWs, contentWords(it.text)) })).filter((x) => x.o > 0)
    .sort((a, b) => (inScope(b.it, subject) ? 1 : 0) - (inScope(a.it, subject) ? 1 : 0) || b.o - a.o)
  const bestScoped = Math.max(0, ...ranked.filter((x) => inScope(x.it, subject)).map((x) => x.o))
  const bestHer = Math.max(0, ...ranked.filter((x) => inScope(x.it, subject) && isHerOwn(x.it)).map((x) => x.c))
  const bestOut = Math.max(0, ...ranked.filter((x) => !inScope(x.it, subject)).map((x) => x.o))

  const isQuestion = /\?\s*["”')]*$/.test(t)
  const presup = isQuestion && PRESUP_Q_RE.test(t.trim())
  if (presup) types.push('presupposition')
  if (AUDIENCE_RE.test(t)) types.push('audience')
  if (CUSTOMER_RE.test(t)) types.push('customer')
  if (SCARCITY_RE.test(t)) types.push('scarcity')
  if (RESULT_RE.test(t)) types.push('result')
  if (HYPERBOLE_RE.test(t)) types.push('hyperbole')
  if (EVENT_RE.test(t)) types.push('event')
  if (QUOTE_RE.test(t)) types.push('quote')
  if (FEELING_RE.test(t)) types.push('feeling')
  if (FIGURATIVE_RE.test(t)) types.push('figurative')
  if (OPINION_RE.test(t)) types.push('opinion')
  const nums = parseNumbers(t).filter((n) => !(n.unit === 'count' && n.value <= 1))
  if (nums.length) types.push('number')
  if (bestOut >= 0.5 && bestScoped < 0.25) types.push('cross_product')

  // Close items for a replace repair: in scope, and her own words when the claim is gated.
  const needsHer = types.some((x) => GATED.has(x) || x === 'event' || x === 'quote' || x === 'feeling')
  const near = ranked.filter((x) => x.o >= 0.25 && inScope(x.it, subject) && (!needsHer || isHerOwn(x.it))).slice(0, 4).map((x) => x.it.id)
  const read = (hard: RuleRead['hard'], soft: RuleRead['soft'] = null): RuleRead =>
    ({ claim_types: [...new Set(types)], hard, soft, near, subject_product: subject })

  // A pure question to the viewer carries no claim.
  if (isQuestion && !presup && !types.some((x) => HARD_TYPES.has(x) && x !== 'presupposition')) return read(null, { cls: 'N', reason: 'pure_question' })
  // SCARCITY needs a LIVE urgency item for this product.
  if (types.includes('scarcity') && !scoped.some((it) => it.origin === 'urgency' && it.live)) return read({ cls: 'I', reason: 'scarcity_not_live' })
  // NUMBER TO FIELD: every number must match an in-scope item's number of the same unit and field.
  for (const n of nums) {
    if (!numbersMatch(n, scoped)) {
      return read({ cls: 'I', reason: numbersMatch(n, outOfScope) ? 'cross_product' : 'number_unmatched' })
    }
  }
  // AUDIENCE / CUSTOMER / RESULT need first-party evidence; outside items never count.
  const gated = types.filter((x) => GATED.has(x) && x !== 'scarcity')
  if (gated.length && bestHer < HER_MIN) return read({ cls: 'I', reason: 'gated_no_first_party' })
  // AN EVENT in any tense needs an item that could entail it — stories on file
  // only add candidates; they never switch this off.
  if ((types.includes('event') || types.includes('feeling')) && bestHer < HER_MIN) return read({ cls: 'I', reason: 'event_unbacked' })
  if (types.includes('quote') && bestHer < HER_MIN) return read({ cls: 'I', reason: 'invented_quote' })
  if (types.includes('cross_product') && !gated.length) return read({ cls: 'I', reason: 'cross_product' })

  const hardPresent = types.some((x) => HARD_TYPES.has(x))
  // Figurative language with no checkable claim is N (owner amendment e).
  if (types.includes('figurative') && !hardPresent && !COMPARATIVE_RE.test(t)) return read(null, { cls: 'N', reason: 'figurative' })
  // A non-specific, non-risky truism is N (owner amendment f).
  if (!hardPresent && !FIRST_PERSON_RE.test(t) && !SPECIFIC_RE.test(t) && !PRODUCT_PRONOUN_RE.test(t) && !SECOND_PERSON_PROMISE_RE.test(t) && !COMPARATIVE_RE.test(t)
    && subject === targetId && !mentionsAnyProduct(t, products) && wordCount(t) <= 12 && !types.includes('opinion')) {
    return read(null, { cls: 'N', reason: CTA_RE.test(t) ? 'cta' : 'truism' })
  }
  if (CTA_RE.test(t) && !hardPresent && wordCount(t) <= 14) return read(null, { cls: 'N', reason: 'cta' })
  if (wordCount(t) <= 3 && !hardPresent) return read(null, { cls: 'N', reason: 'no_claim' })
  return read(null)
}

function mentionsAnyProduct(t: string, products: readonly ProductName[]): boolean {
  const ws = contentWords(t)
  return products.some((p) => [...productWordsOf(p.name)].some((w) => w.length >= 4 && ws.has(w)))
}

// ── JUDGE: PROMPT + STRICT PARSER ───────────────────────────────────────────

export const JUDGE_SYSTEM = 'You check a short video script for invented claims. For each numbered sentence you decide whether the listed material ENTAILS it. You never use outside knowledge. You return JSON only.'

export const JUDGE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sentences: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          i: { type: 'INTEGER' },
          class: { type: 'STRING', enum: ['S', 'E', 'I', 'N'] },
          item_ids: { type: 'ARRAY', items: { type: 'STRING' } },
          claim_types: { type: 'ARRAY', items: { type: 'STRING' } },
          reason: { type: 'STRING' },
        },
        required: ['i', 'class', 'item_ids'],
      },
    },
  },
  required: ['sentences'],
} as const

const fence = (s: string) => s.split('<<<UNTRUSTED_DATA').join('').split('END_UNTRUSTED_DATA>>>').join('')

/** One prompt per script: all sentences and all items (design A4). */
export function buildJudgePrompt(sentences: readonly GateSentence[], ledger: readonly LedgerItem[], products: readonly ProductName[] = []): string {
  const prodName = (id: string | null) => (id === null ? 'general' : products.find((p) => p.id === id)?.name ?? id)
  const items = ledger.map((it) => `[${it.id}] (${it.origin}${it.field ? `/${it.field}` : ''}; about: ${prodName(it.product_id)}; ${it.first_party ? 'her own words' : 'outside source'}${it.origin === 'urgency' ? (it.live ? '; LIVE' : '; NOT live') : ''}) ${it.text.slice(0, 400)}`)
  const lines = sentences.map((s) => `${s.i}. (${s.surface}) ${s.text}`)
  return [
    'Classify EVERY sentence below as exactly one of:',
    'S = every claim is entailed by one listed item about the same product (or a general item); numbers match the item number with the same unit and meaning.',
    'E = an item backs it, but the sentence adds intensity, frequency or an experience adjective ("always", "every single time"); the addition is never a number, event, quote, scarcity or result.',
    'I = any claim with no entailing item; a claim backed only by an item about ANOTHER product; a number whose unit or meaning differs ("two parts water" is not "a two-pound bag"); what people/customers/followers ask or say without HER OWN item saying so (outside sources never count); scarcity without a LIVE urgency item; an event, quote or feeling she never gave, in ANY tense ("people always ask me", "a regular comes in every morning").',
    'N = no checkable claim: a pure question to the viewer, a transition, a call to action restating the offer, an opinion she gave, figurative language ("a hug in a mug"), or a non-specific harmless truism ("good coffee takes time").',
    'A question that PRESUPPOSES a fact ("Did you know every bag is roasted the morning it ships?") is judged on that fact.',
    'Hyperbole about her own experience ("this literally saved my mornings") is E when her own item backs the experience, otherwise I.',
    'item_ids: the ids of the items that entail the sentence (empty for I or N). claim_types: any of audience, customer, result, scarcity, number, event, quote, feeling, presupposition, cross_product, opinion, figurative, general. reason: at most 8 words.',
    `\nMATERIAL (the only source of truth):\n<<<UNTRUSTED_DATA material\n${fence(items.join('\n'))}\nEND_UNTRUSTED_DATA>>>`,
    `\nSENTENCES:\n<<<UNTRUSTED_DATA sentences\n${fence(lines.join('\n'))}\nEND_UNTRUSTED_DATA>>>`,
    '\nReturn {"sentences":[{"i":0,"class":"S","item_ids":["…"],"claim_types":[],"reason":"…"}]} with one entry per sentence.',
  ].join('\n')
}

export interface JudgeVerdict { i: number; cls: GateClass; item_ids: string[]; claim_types: ClaimType[]; reason: string }

const CLAIM_TYPES = new Set<ClaimType>(['audience', 'customer', 'result', 'scarcity', 'number', 'event', 'quote', 'feeling', 'presupposition', 'cross_product', 'product', 'opinion', 'general', 'figurative', 'hyperbole'])

/** Strict parse of the judge's answer. Never throws; drops anything malformed. */
export function parseJudge(raw: unknown, sentenceCount: number, ledgerIds: ReadonlySet<string>): { verdicts: Map<number, JudgeVerdict>; malformed: number } {
  const verdicts = new Map<number, JudgeVerdict>()
  let malformed = 0
  let o: unknown = raw
  if (typeof raw === 'string') {
    const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    try { o = JSON.parse(s) } catch {
      const m = s.match(/\{[\s\S]*\}/)
      try { o = m ? JSON.parse(m[0]) : null } catch { o = null }
    }
  }
  const list = Array.isArray(o) ? o : (o as { sentences?: unknown } | null)?.sentences
  if (!Array.isArray(list)) return { verdicts, malformed: 1 }
  for (const e of list) {
    const r = e as Record<string, unknown> | null
    const i = typeof r?.i === 'number' ? r.i : typeof r?.i === 'string' && /^\d+$/.test(r.i) ? Number(r.i) : NaN
    const cls = String(r?.class ?? '').trim().toUpperCase()
    if (!Number.isInteger(i) || i < 0 || i >= sentenceCount || !['S', 'E', 'I', 'N'].includes(cls) || verdicts.has(i)) { malformed++; continue }
    const ids = (Array.isArray(r?.item_ids) ? r!.item_ids as unknown[] : []).map((x) => String(x ?? '').trim()).filter((x) => ledgerIds.has(x))
    const types = (Array.isArray(r?.claim_types) ? r!.claim_types as unknown[] : []).map((x) => String(x ?? '').trim().toLowerCase()).filter((x): x is ClaimType => CLAIM_TYPES.has(x as ClaimType))
    verdicts.set(i, { i, cls: cls as GateClass, item_ids: [...new Set(ids)], claim_types: [...new Set(types)], reason: String(r?.reason ?? '').slice(0, 60) })
  }
  return { verdicts, malformed }
}

// ── COMBINE ────────────────────────────────────────────────────────────────

export interface ClassifiedSentence {
  i: number
  surface: Surface
  at: number
  k: number
  class: GateClass
  claim_types: ClaimType[]
  item_ids: string[]
  reason: GateReason
  /** Close in-scope items, for a replace repair. Not recorded. */
  near: string[]
  judged: boolean
}

export interface ClassifyInput {
  sentences: readonly GateSentence[]
  ledger: readonly LedgerItem[]
  products?: readonly ProductName[]
  targetProductId?: string | null
  /** The judge's parsed verdicts, or null when no judge ran (measure-only/timeout). */
  judge: Map<number, JudgeVerdict> | null
}

/** Rules + judge → S/E/I/N per sentence, with ids and a reason (design A4). */
export function classifySentences(input: ClassifyInput): ClassifiedSentence[] {
  const products = input.products ?? []
  const target = input.targetProductId ?? null
  const byId = new Map(input.ledger.map((it) => [it.id, it] as const))
  return input.sentences.map((s) => {
    if (isPlaceholder(s.text)) return { i: s.i, surface: s.surface, at: s.at, k: s.k, class: 'N' as const, claim_types: [], item_ids: [], reason: 'no_claim' as const, near: [], judged: false }
    const r = ruleRead(s, input.ledger, products, target)
    const base = { i: s.i, surface: s.surface, at: s.at, k: s.k, near: r.near }
    const v = input.judge?.get(s.i) ?? null
    const types = [...new Set([...r.claim_types, ...(v?.claim_types ?? [])])]
    const out = (cls: GateClass, reason: GateReason, ids: string[] = []): ClassifiedSentence =>
      ({ ...base, class: cls, claim_types: types, item_ids: ids, reason, judged: !!v })
    if (r.hard) return out('I', r.hard.reason)
    if (r.soft && (!v || v.cls !== 'I' || !v.claim_types.some((x) => HARD_TYPES.has(x)))) return out('N', r.soft.reason)
    if (!v) {
      if (!input.judge) {
        // No judge (measure-only): the overlap pre-filter is the only evidence.
        return r.near.length ? out('S', 'entailed', base.near.slice(0, 2)) : out('I', 'no_item')
      }
      return out('I', 'judge_missing')
    }
    if (v.cls === 'N') {
      if (types.some((x) => HARD_TYPES.has(x) && x !== 'presupposition') || types.includes('presupposition')) return out('I', 'no_item')
      if (types.includes('opinion') && !v.item_ids.length) return out('E', 'opinion_unbacked')
      return out('N', 'no_claim')
    }
    if (v.cls === 'I') return out('I', types.includes('cross_product') ? 'cross_product' : 'no_item')
    // S or E: the cited items must exist, be in scope, and meet the class's evidence rule.
    const cited = v.item_ids.map((id) => byId.get(id)).filter((x): x is LedgerItem => !!x)
    const scoped = cited.filter((it) => inScope(it, r.subject_product))
    if (!scoped.length) return out('I', cited.length ? 'cross_product' : 'no_item')
    if (types.includes('scarcity') && !scoped.some((it) => it.origin === 'urgency' && it.live)) return out('I', 'scarcity_not_live')
    if (types.some((x) => x === 'audience' || x === 'customer' || x === 'result' || x === 'event' || x === 'quote' || x === 'feeling')
      && !scoped.some(isHerOwn)) return out('I', 'gated_no_first_party')
    const ids = scoped.map((it) => it.id)
    if (v.cls === 'E') return out('E', types.includes('hyperbole') ? 'hyperbole' : 'stronger_than_item', ids)
    if (types.includes('hyperbole')) return out('E', 'hyperbole', ids)
    return out('S', 'entailed', ids)
  })
}

export interface ClassCounts { S: number; E: number; I: number; N: number }
export function countClasses(cs: readonly ClassifiedSentence[]): ClassCounts {
  const c: ClassCounts = { S: 0, E: 0, I: 0, N: 0 }
  for (const s of cs) c[s.class]++
  return c
}

/** E budget (design A5): ≈ one E per 150 spoken words; the excess is repaired like an I. */
export function eBudget(spokenWords: number): number {
  return Math.max(1, Math.round(spokenWords / E_BUDGET_WORDS))
}
export function overBudgetE(cs: readonly ClassifiedSentence[], spokenWords: number): number[] {
  const es = cs.filter((s) => s.class === 'E')
  return es.slice(eBudget(spokenWords)).map((s) => s.i)
}

// ── REPAIR PLANNING ────────────────────────────────────────────────────────

export type RepairAction = 'replace' | 'ask' | 'drop' | 'fallback'
export type AskKind = 'story' | 'audience_question' | 'customer' | 'result' | 'urgency' | 'product_fact' | 'quote' | 'detail'

/** Need Check-format question (design B4). */
export interface GateQuestion { scope: 'script'; kind: AskKind; text: string; writes_to: string }

export interface RepairStep {
  i: number
  action: RepairAction
  item_ids: string[]
  question?: GateQuestion
}

const ASK_TEXT: Record<AskKind, string> = {
  story: 'What actually happened here, in your own words? One real moment is enough.',
  audience_question: 'What do people really ask you about this? Paste or describe one real question.',
  customer: 'What has a real customer told you about this? Their words, if you have them.',
  result: 'What changed for you, or for a customer, after using this? Only what really happened.',
  urgency: 'Is there a real deadline or limited stock right now? When does it end?',
  product_fact: 'What is the exact number here (size, price, time or amount)?',
  quote: 'Who said this, and what exactly did they say?',
  detail: 'What is the true detail for this line, in your own words?',
}

function askKindOf(s: ClassifiedSentence): AskKind {
  const t = s.claim_types
  if (s.reason === 'scarcity_not_live' || t.includes('scarcity')) return 'urgency'
  if (t.includes('audience')) return 'audience_question'
  if (t.includes('customer')) return 'customer'
  if (t.includes('result')) return 'result'
  if (t.includes('quote')) return 'quote'
  if (t.includes('event') || t.includes('feeling')) return 'story'
  if (s.reason === 'number_unmatched' || t.includes('number')) return 'product_fact'
  return 'detail'
}
const SLOT_SECTION = /hook|story|proof|moment|turn|reveal|payoff|anchor/i

export interface PlanInput {
  classified: readonly ClassifiedSentence[]
  sentences: readonly GateSentence[]
  /** Extra Es over budget, repaired like Is. */
  overBudget?: readonly number[]
  /** Spoken (non-empty) script beats before repair. */
  spokenBeats: number
  /** Last round: no more replace (a rewrite could not be re-checked). */
  finalRound?: boolean
  asksSoFar?: number
}

/** For each I (cheapest safe fix first): replace → ask → drop → fallback (design A5). */
export function planRepairs(p: PlanInput): RepairStep[] {
  const targets = p.classified.filter((s) => s.class === 'I' || (p.overBudget ?? []).includes(s.i))
  const steps: RepairStep[] = []
  let asks = p.asksSoFar ?? 0
  // Which script beats would be emptied by drops, to keep the 3-beat floor.
  const sentencesPerBeat = new Map<number, number>()
  for (const s of p.sentences) if (s.surface === 'script') sentencesPerBeat.set(s.at, (sentencesPerBeat.get(s.at) ?? 0) + 1)
  const dropsPerBeat = new Map<number, number>()
  let beats = p.spokenBeats
  for (const s of targets) {
    const sent = p.sentences[s.i]
    const nonScript = s.surface !== 'script'
    if (!p.finalRound && s.near.length && s.reason !== 'scarcity_not_live') { steps.push({ i: s.i, action: 'replace', item_ids: s.near.slice(0, 3) }); continue }
    if (nonScript) { steps.push({ i: s.i, action: 'drop', item_ids: [] }); continue }
    const fillsSlot = SLOT_SECTION.test(sent?.section ?? '') || sent?.at === 0
      || s.claim_types.some((x) => x === 'event' || x === 'audience' || x === 'customer' || x === 'result')
    const kind = askKindOf(s)
    const ask = (): RepairStep => {
      asks++
      return { i: s.i, action: 'ask', item_ids: [], question: { scope: 'script', kind, text: ASK_TEXT[kind], writes_to: `script.beat.${sent?.at ?? 0}:${kind}` } }
    }
    if (fillsSlot && asks < MAX_ASKS) { steps.push(ask()); continue }
    const dropped = (dropsPerBeat.get(s.at) ?? 0) + 1
    const emptiesBeat = dropped >= (sentencesPerBeat.get(s.at) ?? 1)
    if (!emptiesBeat || beats - 1 >= SPOKEN_FLOOR) {
      dropsPerBeat.set(s.at, dropped)
      if (emptiesBeat) beats--
      steps.push({ i: s.i, action: 'drop', item_ids: [] })
      continue
    }
    if (asks < MAX_ASKS) { steps.push(ask()); continue }
    steps.push({ i: s.i, action: 'fallback', item_ids: [], question: { scope: 'script', kind, text: ASK_TEXT[kind], writes_to: `script.beat.${sent?.at ?? 0}:${kind}` } })
  }
  return steps
}

/** The constrained rewrite prompt for `replace`: only the listed items may be used. */
export const REWRITE_SYSTEM = 'You rewrite single lines of a short video script so that every claim comes ONLY from the listed items. You never add a number, name, event, quote, customer, result or scarcity that the items do not state. You return JSON only.'
export function buildRewritePrompt(targets: ReadonlyArray<{ i: number; text: string; items: readonly LedgerItem[] }>): string {
  const blocks = targets.map((t) => `${t.i}. LINE: ${t.text}\n   ITEMS:\n${t.items.map((it) => `   - [${it.id}] ${it.text.slice(0, 300)}`).join('\n')}`)
  return [
    'Rewrite each line in first person, short and spoken, saying only what its ITEMS state. Keep numbers exactly as the items give them. If the items cannot carry the line, return an empty line.',
    `\n<<<UNTRUSTED_DATA lines\n${fence(blocks.join('\n'))}\nEND_UNTRUSTED_DATA>>>`,
    '\nReturn {"rewrites":[{"index":"<number>","line":"<new line>"}]}.',
  ].join('\n')
}

// ── APPLY ──────────────────────────────────────────────────────────────────

export const placeholderFor = (q: GateQuestion) => `[Your answer: ${q.text}]`

export interface ApplyResult {
  bp: GateBlueprint
  replaced: number
  asked: number
  dropped: number
  fallback: number
  questions: GateQuestion[]
}

/** Apply a plan to the blueprint. `rewrites` maps sentence index → new text
 *  (an empty or missing rewrite turns that replace into a drop). Pure: returns
 *  a new object. The shot list and teleprompter are re-synced by the caller
 *  from the repaired script. */
export function applyRepairs(bp: GateBlueprint, sentences: readonly GateSentence[], steps: readonly RepairStep[], rewrites: ReadonlyMap<number, string> = new Map()): ApplyResult {
  const res: ApplyResult = { bp, replaced: 0, asked: 0, dropped: 0, fallback: 0, questions: [] }
  // Per-entry sentence arrays, edited then re-joined.
  const key = (s: GateSentence) => `${s.surface}:${s.at}`
  const entries = new Map<string, Array<string | null>>()
  for (const s of sentences) {
    const e = entries.get(key(s)) ?? []
    e[s.k] = s.text
    entries.set(key(s), e)
  }
  const touched = new Set<string>()
  for (const st of steps) {
    const s = sentences[st.i]
    if (!s) continue
    const e = entries.get(key(s))!
    touched.add(key(s))
    if (st.action === 'replace') {
      const nt = (rewrites.get(st.i) ?? '').trim()
      if (nt) { e[s.k] = nt; res.replaced++ } else { e[s.k] = null; res.dropped++ }
    } else if (st.action === 'ask' || st.action === 'fallback') {
      e[s.k] = placeholderFor(st.question!)
      if (st.action === 'ask') res.asked++
      else res.fallback++
      res.questions.push(st.question!)
    } else { e[s.k] = null; res.dropped++ }
  }
  if (!touched.size) return res
  const joined = (k: string) => (entries.get(k) ?? []).filter((x): x is string => typeof x === 'string' && x.trim() !== '').join(' ')
  const out: GateBlueprint = { ...bp }
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? [...v] : [])
  const script = arr(bp.script)
  const scriptOut: unknown[] = []
  script.forEach((b, at) => {
    const k = `script:${at}`
    if (!touched.has(k)) { scriptOut.push(b); return }
    const line = joined(k)
    if (line) scriptOut.push({ ...(b as object), line })
  })
  if (Array.isArray(bp.script)) out.script = scriptOut
  const simple = (surface: Surface, list: unknown[]) => list
    .map((v, at) => (touched.has(`${surface}:${at}`) ? joined(`${surface}:${at}`) : v))
    .filter((v) => !(typeof v === 'string' && v.trim() === ''))
  if (Array.isArray(bp.hook_options)) out.hook_options = simple('hook_option', arr(bp.hook_options))
  if (Array.isArray(bp.captions)) out.captions = simple('caption', arr(bp.captions))
  if (bp.packaging && typeof bp.packaging === 'object') {
    const pk = { ...(bp.packaging as Record<string, unknown>) }
    if (Array.isArray(pk.titles)) pk.titles = simple('title', arr(pk.titles))
    if (touched.has('thumbnail_text:0') && pk.thumbnail && typeof pk.thumbnail === 'object') pk.thumbnail = { ...(pk.thumbnail as object), text_overlay: joined('thumbnail_text:0') }
    out.packaging = pk
  }
  if (Array.isArray(bp.publish_plan)) {
    out.publish_plan = arr(bp.publish_plan).map((p, at) => (touched.has(`publish_caption:${at}`) ? { ...(p as object), caption: joined(`publish_caption:${at}`) } : p))
  }
  res.bp = out
  return res
}

// ── THE RECORD ─────────────────────────────────────────────────────────────

/** 'timeout' = the gate ran out of time and fell back to measure-only for this request. */
export type GateOutcome = 'final' | 'needs_answers' | 'general' | 'measure_only' | 'timeout'

export interface GateRecordSentence { i: number; surface: Surface; class: GateClass; claim_types: ClaimType[]; item_ids: string[]; reason: GateReason }

export interface InventionGateRecord {
  version: string
  model: string | null
  sentences: GateRecordSentence[]
  before: ClassCounts
  after: ClassCounts
  repaired: { replaced: number; asked: number; dropped: number }
  rounds: number
  outcome: GateOutcome
  e_flags: Array<{ i: number; surface: Surface; item_ids: string[] }>
  ms: number
  timed_out: boolean
  judge_malformed?: number
  error?: string
}

export function recordSentences(cs: readonly ClassifiedSentence[]): GateRecordSentence[] {
  return cs.map((s) => ({ i: s.i, surface: s.surface, class: s.class, claim_types: s.claim_types, item_ids: s.item_ids, reason: s.reason }))
}

/** Outcome after the last round: an unrepaired I never ships as final. */
export function decideOutcome(after: readonly ClassifiedSentence[], asked: number, fallback: number): GateOutcome {
  if (fallback > 0) return 'general'
  if (after.some((s) => s.class === 'I')) return asked > 0 ? 'needs_answers' : 'general'
  return asked > 0 ? 'needs_answers' : 'final'
}

/** Owner amendment g: the batch lines, from records alone. */
export function summarizeGateRecords(records: ReadonlyArray<InventionGateRecord | null | undefined>) {
  const rs = records.filter((r): r is InventionGateRecord => !!r && typeof r === 'object' && !!r.before)
  const factual = (c: ClassCounts) => c.S + c.E + c.I
  const sum = (f: (r: InventionGateRecord) => number) => rs.reduce((a, r) => a + f(r), 0)
  const outcomes: Record<string, number> = {}
  for (const r of rs) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1
  const fb = sum((r) => factual(r.before))
  const fa = sum((r) => factual(r.after))
  return {
    scripts: rs.length,
    invented_rate_before: fb ? sum((r) => r.before.I) / fb : 0,
    invented_rate_after: fa ? sum((r) => r.after.I) / fa : 0,
    scripts_with_i_before: rs.filter((r) => r.before.I > 0).length,
    scripts_with_i_after: rs.filter((r) => r.after.I > 0).length,
    needs_answers_share: rs.length ? (outcomes.needs_answers ?? 0) / rs.length : 0,
    repairs: { replaced: sum((r) => r.repaired.replaced), asked: sum((r) => r.repaired.asked), dropped: sum((r) => r.repaired.dropped) },
    outcomes,
    timed_out: rs.filter((r) => r.timed_out).length,
    ms_median: (() => { const m = rs.map((r) => r.ms).sort((a, b) => a - b); return m.length ? m[Math.floor(m.length / 2)]! : 0 })(),
  }
}

// ── ONE ROUND, END TO END (the edge and the tests drive this) ──────────────

export interface GateDeps {
  /** One judge call per script. Returns the model's raw text. */
  judge: (prompt: string) => Promise<string>
  /** One constrained rewrite call for all replace targets. Returns raw text. */
  rewrite: (prompt: string) => Promise<string>
}

export interface RunGateInput {
  blueprint: GateBlueprint
  ledger: readonly LedgerItem[]
  products?: readonly ProductName[]
  targetProductId?: string | null
  model?: string | null
  /** Measure only: classify, record, never repair. */
  measureOnly?: boolean
  now?: () => number
  timeoutMs?: number
}

export interface RunGateResult { blueprint: GateBlueprint; record: InventionGateRecord; questions: GateQuestion[] }

function spokenWords(bp: GateBlueprint): number {
  return (Array.isArray(bp.script) ? bp.script : []).reduce((a: number, b) => a + wordCount(String((b as { line?: unknown })?.line ?? '')), 0)
}
function spokenBeats(bp: GateBlueprint): number {
  return (Array.isArray(bp.script) ? bp.script : []).filter((b) => typeof (b as { line?: unknown })?.line === 'string' && String((b as { line?: unknown }).line).trim()).length
}

function parseRewrites(raw: string): Map<number, string> {
  const m = new Map<number, string>()
  try {
    const o = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')) as { rewrites?: unknown }
    for (const r of Array.isArray(o?.rewrites) ? o.rewrites as Array<Record<string, unknown>> : []) {
      const i = Number(r?.index)
      if (Number.isInteger(i) && typeof r?.line === 'string') m.set(i, r.line)
    }
  } catch { /* an unparseable rewrite is no rewrite: those targets drop */ }
  return m
}

class GateTimeout extends Error {}

/** Classes for a repaired blueprint WITHOUT a new judge call: no new text was
 *  written (only drops, asks and placeholders), so each surviving sentence
 *  keeps the class it already had; a placeholder carries no claim (N). */
export function carryClasses(prev: { sentences: readonly GateSentence[]; classified: readonly ClassifiedSentence[] }, next: readonly GateSentence[]): ClassifiedSentence[] {
  const pool = prev.classified.map((c) => ({ c, text: prev.sentences[c.i]?.text ?? '', used: false }))
  return next.map((s) => {
    if (isPlaceholder(s.text)) {
      return { i: s.i, surface: s.surface, at: s.at, k: s.k, class: 'N' as const, claim_types: [], item_ids: [], reason: 'no_claim' as const, near: [], judged: false }
    }
    const hit = pool.find((p) => !p.used && p.c.surface === s.surface && p.text === s.text)
    if (hit) { hit.used = true; return { ...hit.c, i: s.i, at: s.at, k: s.k } }
    return { i: s.i, surface: s.surface, at: s.at, k: s.k, class: 'I' as const, claim_types: [], item_ids: [], reason: 'judge_missing' as const, near: [], judged: false }
  })
}

/** Classify → repair → re-check (at most 2 repair rounds), then hold every
 *  remaining I as a question or a general placeholder: an unrepaired I never
 *  ships. Under a hard deadline: on timeout the ORIGINAL blueprint is returned
 *  with a measure-only record marked 'timeout' (owner amendment d). */
export async function runInventionGate(input: RunGateInput, deps: GateDeps): Promise<RunGateResult> {
  const now = input.now ?? (() => Date.now())
  const t0 = now()
  const timeoutMs = input.timeoutMs ?? INVENTION_GATE_TIMEOUT_MS
  const products = input.products ?? []
  const target = input.targetProductId ?? null
  const ids = new Set(input.ledger.map((it) => it.id))
  const byId = new Map(input.ledger.map((it) => [it.id, it] as const))
  const race = async <T>(p: Promise<T>): Promise<T> => {
    const ms = timeoutMs - (now() - t0)
    if (ms <= 0) throw new GateTimeout()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([p, new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new GateTimeout()), ms) })])
    } finally { if (timer) clearTimeout(timer) }
  }
  let malformed = 0
  type State = { sentences: GateSentence[]; classified: ClassifiedSentence[] }
  const classify = async (bp: GateBlueprint): Promise<State> => {
    const sentences = extractSentences(bp)
    let judge: Map<number, JudgeVerdict> | null = null
    if (sentences.length) {
      const raw = await race(deps.judge(buildJudgePrompt(sentences, input.ledger, products)))
      const parsed = parseJudge(raw, sentences.length, ids)
      malformed += parsed.malformed
      judge = parsed.verdicts
    }
    return { sentences, classified: classifySentences({ sentences, ledger: input.ledger, products, targetProductId: target, judge }) }
  }
  const empty: ClassCounts = { S: 0, E: 0, I: 0, N: 0 }
  const base = (): InventionGateRecord => ({
    version: INVENTION_GATE_VERSION, model: input.model ?? null, sentences: [], before: { ...empty }, after: { ...empty },
    repaired: { replaced: 0, asked: 0, dropped: 0 }, rounds: 0, outcome: 'measure_only', e_flags: [], ms: 0, timed_out: false,
  })
  let first: State | null = null
  try {
    first = await classify(input.blueprint)
    const before = countClasses(first.classified)
    if (input.measureOnly) {
      return { blueprint: input.blueprint, questions: [], record: { ...base(), sentences: recordSentences(first.classified), before, after: before, ms: now() - t0, judge_malformed: malformed } }
    }
    let bp = input.blueprint
    let cur: State = first
    let rounds = 0
    const repaired = { replaced: 0, asked: 0, dropped: 0 }
    let fallback = 0
    const questions: GateQuestion[] = []
    const apply = (steps: RepairStep[], rewrites?: Map<number, string>) => {
      const a = applyRepairs(bp, cur.sentences, steps, rewrites)
      bp = a.bp
      repaired.replaced += a.replaced
      repaired.asked += a.asked
      repaired.dropped += a.dropped
      fallback += a.fallback
      questions.push(...a.questions)
    }
    while (rounds < INVENTION_GATE_MAX_ROUNDS) {
      const over = overBudgetE(cur.classified, spokenWords(bp))
      if (!cur.classified.some((s) => s.class === 'I') && !over.length) break
      rounds++
      const steps = planRepairs({ classified: cur.classified, sentences: cur.sentences, overBudget: over, spokenBeats: spokenBeats(bp), asksSoFar: questions.length })
      const replaceSteps = steps.filter((s) => s.action === 'replace')
      if (!replaceSteps.length) {
        // Nothing new written: no re-judge needed.
        const prev = cur
        apply(steps)
        const sentences = extractSentences(bp)
        cur = { sentences, classified: carryClasses(prev, sentences) }
        continue
      }
      const raw = await race(deps.rewrite(buildRewritePrompt(replaceSteps.map((st) => ({
        i: st.i, text: cur.sentences[st.i]!.text, items: st.item_ids.map((id) => byId.get(id)).filter((x): x is LedgerItem => !!x),
      })))))
      apply(steps, parseRewrites(raw))
      cur = await classify(bp)
    }
    // THE LAST WORD: whatever is still I (or E over budget) is asked or dropped, never kept.
    const overLast = overBudgetE(cur.classified, spokenWords(bp))
    if (cur.classified.some((s) => s.class === 'I') || overLast.length) {
      const prev = cur
      const steps = planRepairs({ classified: cur.classified, sentences: cur.sentences, overBudget: overLast, spokenBeats: spokenBeats(bp), finalRound: true, asksSoFar: questions.length })
      apply(steps)
      const sentences = extractSentences(bp)
      cur = { sentences, classified: carryClasses(prev, sentences) }
    }
    const ebudget = eBudget(spokenWords(bp))
    const record: InventionGateRecord = {
      ...base(),
      sentences: recordSentences(first.classified),
      before, after: countClasses(cur.classified), repaired, rounds,
      outcome: decideOutcome(cur.classified, repaired.asked, fallback),
      e_flags: cur.classified.filter((s) => s.class === 'E').slice(0, ebudget).map((s) => ({ i: s.i, surface: s.surface, item_ids: s.item_ids })),
      ms: now() - t0,
      judge_malformed: malformed,
    }
    return { blueprint: bp, record, questions }
  } catch (e) {
    const timedOut = e instanceof GateTimeout
    const counts = first ? countClasses(first.classified) : { ...empty }
    return {
      blueprint: input.blueprint,
      questions: [],
      record: {
        ...base(),
        sentences: first ? recordSentences(first.classified) : [],
        before: counts, after: counts,
        outcome: timedOut ? 'timeout' : 'measure_only',
        ms: now() - t0, timed_out: timedOut, judge_malformed: malformed,
        ...(timedOut ? {} : { error: String((e as Error)?.name ?? 'error').slice(0, 40) }),
      },
    }
  }
}
