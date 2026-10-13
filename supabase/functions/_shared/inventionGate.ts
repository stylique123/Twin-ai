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

export const INVENTION_GATE_VERSION = 'invention-gate-v3'

// v3 (owner Reply 14; combine rule and N/S rules otherwise unchanged):
//   1. SCRIPT LINES ARE THE JUDGED UNIT: hook options, titles, captions,
//      thumbnail text and publish captions take their best-overlap script
//      line's verdict, and are judged alone only when they add a claim no
//      script line makes (new number, named product, outcome/result, or a
//      first-person event/habit and other hard claims).
//   2. Numbers are normalized ("thirty-eight dollars" = "$38" = "38 USD";
//      "twelve ounce" = "12 oz") on both the sentence and the ledger.
//   3. Pure advice/instruction with no fact, number, result or event is N.
//   4. An unsupported first-person habit ("I always…", "every time I…") is
//      I-HARD by rule: neither judge can make it E or G.

// v2 (owner gate tuning, panel-current-2): an unsupported claim is split in two.
//   I (I-HARD): personal experience/events, what people did or said, numbers,
//     results, scarcity, customer/audience facts, product claims, and
//     high-risk health/safety/legal/money claims — with no first-party item or
//     source. Blocking: repaired, asked or held, exactly as before.
//   G (G-SOFT): unsupported LOW-RISK general knowledge or advice ("air exposure
//     ruins beans"). Flagged for sourcing; never repaired, never a
//     needs-answers trigger. Old records (no G) read the same.
// Titles, captions and thumbnail text inherit the verdict of the script line
// they paraphrase; list-count promises ("3 things") are checked against what
// the script delivers. First-party, live-fact, number-field and scope rules are
// unchanged.

/** Judge models, as TASK CLASSES of worker/model_routing_v1.json (no model
 *  literal outside the catalog — check_model_routing). Cheapest first:
 *  `read` is the writer-family flash model, `extract` the stronger pro model.
 *  The durable worker step runs them as a CASCADE (see INVENTION_JUDGE_CASCADE):
 *  flash on every chunk, pro only for the sentences flash is unsure of. */
export const INVENTION_JUDGE_TASKS = ['read', 'extract'] as const

/** Default deadline for a gate run when the caller gives none (the worker passes its own budget). */
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

// v3 (owner Reply 14, rule 2): spelled-out, symbol and word forms of one
// number read the same ("thirty-eight dollars" = "$38" = "38 USD"; "twelve
// ounce" = "12 oz"). `normalizeNumbers` runs on BOTH the sentence and every
// ledger item before any number is matched (it is the first step of parseNumbers).
const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, million: 1_000_000 }
const CURRENCY_WORD_RE = /^(?:dollars?|bucks|usd|cents?)$/
const UNIT_CANON: Array<[RegExp, string]> = [
  [/^(?:ounces?|oz|fl\.? ?oz)$/, 'oz'], [/^(?:pounds?|lbs?)$/, 'lb'], [/^(?:grams?|g|gr)$/, 'g'], [/^(?:kilograms?|kilos?|kg|kgs)$/, 'kg'],
  [/^(?:millilit(?:er|re)s?|ml)$/, 'ml'], [/^(?:lit(?:er|re)s?|l)$/, 'l'], [/^(?:percent|per ?cent|pct)$/, '%'],
  [/^(?:minutes?|mins?)$/, 'minutes'], [/^(?:seconds?|secs?)$/, 'seconds'], [/^(?:hours?|hrs?)$/, 'hours'],
]
const isUnitWord = (w: string) => UNIT_CANON.some(([re]) => re.test(w)) || CURRENCY_WORD_RE.test(w) || !!unitOf(w)

/** Words → digits (incl. hyphenated tens and "one hundred twenty"), currency
 *  words/codes → "$n", common units → one spelling, thousands separators and
 *  "2k" removed. A lone "one"/"a"/"half" with no unit after it is left alone
 *  (idiom far more often than a claim). Pure; never throws. */
export function normalizeNumbers(text: unknown): string {
  let t = String(text ?? '').replace(/[‐-―]/g, '-')
  // 1,200 → 1200; $2k → $2000
  t = t.replace(/\b(\d{1,3})((?:,\d{3})+)\b/g, (_m, a: string, b: string) => a + b.replace(/,/g, ''))
  t = t.replace(/(\d+(?:\.\d+)?)k\b/gi, (_m, a: string) => String(Math.round(Number(a) * 1000)))
  // Spelled numbers: a run of number words (hyphen or space joined, "and" allowed inside).
  const word = '(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)'
  t = t.replace(/\b(hundred|thousand)\s+and\s+/gi, '$1 ')
  const run = new RegExp(`\\b${word}(?:[\\s-]+${word})*\\b`, 'gi')
  t = t.replace(run, (m, offset: number, whole: string) => {
    const parts = m.toLowerCase().split(/[\s-]+/)
    // "twenty five" is one number; "two three" or "ten twenty" are two.
    const nums: number[] = []
    let total = 0, cur = 0, open = false, lastSmall = -1
    const flush = () => { if (open) nums.push(total + cur); total = 0; cur = 0; open = false; lastSmall = -1 }
    for (const w of parts) {
      if (w in ONES) {
        if (lastSmall >= 0 && !(lastSmall >= 20 && lastSmall % 10 === 0 && ONES[w]! < 10)) flush()
        cur += ONES[w]!; lastSmall = (lastSmall >= 20 ? lastSmall : 0) + ONES[w]!
      } else if (w in TENS) {
        if (lastSmall >= 0) flush()
        cur += TENS[w]!; lastSmall = TENS[w]!
      } else if (w === 'hundred') { cur = (cur || 1) * 100; lastSmall = -1 }
      else { total += (cur || 1) * SCALES[w]!; cur = 0; lastSmall = -1 }
      open = true
    }
    flush()
    if (nums.length === 1 && parts.length === 1 && (parts[0] === 'one' || parts[0] === 'zero')) {
      const next = whole.slice(offset + m.length).trim().split(/[\s.,;:!?)]+/)[0]?.toLowerCase() ?? ''
      if (!isUnitWord(next)) return m
    }
    return nums.join(' ')
  })
  // "12-ounce" / "12 ounce" / "12oz" → "12 oz"; "38 dollars"/"38 USD"/"38 bucks" → "$38".
  t = t.replace(/(\d+(?:\.\d+)?)\s*-?\s*([a-z]+)\b/gi, (m, num: string, unit0: string) => {
    const unit = unit0.toLowerCase()
    if (/^(?:dollars?|bucks|usd)$/.test(unit)) return `$${num}`
    for (const [re, canon] of UNIT_CANON) if (re.test(unit)) return canon === '%' ? `${num}%` : `${num} ${canon}`
    return m
  })
  t = t.replace(/\bUSD\s*\$?\s*(\d)/g, '$$$1').replace(/\$\s+(\d)/g, '$$$1')
  t = t.replace(/\$(\d+)\.00\b/g, '$$$1')
  return t
}

/** Numbers in a text, each with its unit and field. Parsed once per item.
 *  The text is normalized first (`normalizeNumbers`). */
export function parseNumbers(text: unknown, field: string | null = null): LedgerNumber[] {
  const out: LedgerNumber[] = []
  const t = normalizeNumbers(text)
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

/** One ledger item as stored on the blueprint: ids, origin and scope, never text. */
export interface CompactLedgerItem { id: string; origin: ItemOrigin; product_id: string | null; field: string | null; first_party: boolean; live: boolean }

/** `blueprint.gate_ledger` (private): what the gate checked the script against, ids only. */
export function compactLedger(ledger: readonly LedgerItem[]): CompactLedgerItem[] {
  return ledger.map((it) => ({ id: it.id, origin: it.origin, product_id: it.product_id, field: it.field, first_party: it.first_party, live: it.live }))
}

/** `blueprint.writer_supply` (private, every generation): what the writer was
 *  shown, ids only. `knowledge_ids` are the creator_knowledge rows recorded in
 *  creator_knowledge_uses; product facts, answers and the note have no table of
 *  their own, so this is their only record. */
export interface WriterSupply {
  knowledge_ids: string[]
  product_id: string | null
  product_fact_ids: string[]
  answer_keys: string[]
  note: boolean
}

export function writerSupply(input: {
  knowledge?: ReadonlyArray<{ id?: unknown } | null> | null
  product?: { id?: unknown; knowledge?: unknown } | null
  answers?: Record<string, unknown> | null
  note?: unknown
}): WriterSupply {
  const ids = (xs: ReadonlyArray<{ id?: unknown } | null>) => [...new Set(xs.map((x) => str(x?.id)).filter(Boolean))]
  const pid = str(input.product?.id) || null
  return {
    knowledge_ids: ids(input.knowledge ?? []),
    product_id: pid,
    product_fact_ids: pid ? ids(knowledgeList(input.product?.knowledge) as Array<{ id?: unknown }>) : [],
    answer_keys: Object.entries(input.answers ?? {}).filter(([, v]) => str(v) !== '').map(([k]) => k).sort(),
    note: str(input.note) !== '',
  }
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
  /** Non-script surfaces only: the script sentence this one paraphrases (see `linkParents`). */
  parent?: number
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
  return linkParents(out)
}

/** Surfaces that paraphrase the script. v3 (owner Reply 14, rule 1): SCRIPT
 *  LINES ARE THE JUDGED UNIT — hook options, titles, captions, thumbnail text
 *  and publish captions inherit their parent line's verdict and are judged
 *  alone only when they add a claim no script line makes (`fragmentNewClaim`). */
const PARAPHRASE_SURFACES = new Set<Surface>(['hook_option', 'title', 'caption', 'thumbnail_text', 'publish_caption'])
/** Share of a fragment's content words its script line must hold to be its parent. */
export const PARENT_MIN = 0.6
/** At or above this share (and no claim type the parent lacks) the fragment inherits the parent's verdict. */
export const INHERIT_MIN = 0.75

function coverage(frag: Set<string>, parent: Set<string>): number {
  if (!frag.size) return 0
  let hit = 0
  for (const w of frag) if (parent.has(w)) hit++
  return hit / frag.size
}

/** Titles, captions, thumbnail text, hook options and publish captions point at
 *  the script sentence they paraphrase. v3: the BEST-OVERLAP script line (most
 *  of the fragment's content words, numbers normalized; ties → more shared
 *  words, then the line the previous fragment of the same surface used, then
 *  the earlier line); any overlap at all is enough. Pure; returns the same
 *  sentences with `parent`. */
export function linkParents(sentences: GateSentence[]): GateSentence[] {
  const wordsOf = (t: string) => { const ws = contentWords(t); for (const n of parseNumbers(t)) ws.add(`#${n.unit}:${n.value}`); return ws }
  const script = sentences.filter((s) => s.surface === 'script' && !isPlaceholder(s.text)).map((s) => ({ s, ws: wordsOf(s.text) }))
  let prev: { surface: Surface; parent: number } | null = null
  for (const s of sentences) {
    if (!PARAPHRASE_SURFACES.has(s.surface) || isPlaceholder(s.text)) continue
    const ws = wordsOf(s.text)
    const near: number = prev && prev.surface === s.surface ? prev.parent : -1
    let best: { i: number; c: number; hits: number; near: boolean } | null = null
    for (const p of script) {
      const c = coverage(ws, p.ws)
      if (c <= 0) continue
      const hits = Math.round(c * ws.size)
      const isNear: boolean = near >= 0 && (p.s.i === near || p.s.i === near + 1)
      if (!best || c > best.c || (c === best.c && (hits > best.hits || (hits === best.hits && isNear && !best.near)))) best = { i: p.s.i, c, hits, near: isNear }
    }
    if (best) { s.parent = best.i; prev = { surface: s.surface, parent: best.i } }
    else delete s.parent
  }
  return sentences
}

// ── RULES ──────────────────────────────────────────────────────────────────

/** 'G' = G-SOFT (v2): unsupported low-risk general knowledge or advice. Non-blocking. */
export type GateClass = 'S' | 'E' | 'I' | 'N' | 'G'
export type ClaimType =
  | 'audience' | 'customer' | 'result' | 'scarcity' | 'number' | 'event' | 'quote' | 'feeling'
  | 'presupposition' | 'cross_product' | 'product' | 'opinion' | 'general' | 'figurative' | 'hyperbole'
  | 'risk' | 'list_count' | 'habit'

export type GateReason =
  | 'entailed' | 'stronger_than_item' | 'hyperbole' | 'no_item' | 'number_unmatched' | 'cross_product'
  | 'gated_no_first_party' | 'scarcity_not_live' | 'event_unbacked' | 'invented_quote' | 'pure_question'
  | 'figurative' | 'truism' | 'cta' | 'opinion_unbacked' | 'no_claim' | 'judge_missing' | 'e_over_budget'
  | 'general_unsourced' | 'inherited' | 'list_count_undelivered'
  | 'advice' | 'habit_unbacked'

const AUDIENCE_RE = /\b(?:people|everyone|everybody|you guys|y'all|folks|my followers|followers|viewers|so many of you|a lot of you|half of you|most of you)\b[^.!?]{0,30}\b(?:ask|asks|asked|asking|tell|tells|told|say|says|said|think|thinks|dm|message|comment|comments|want|wants|love|loves)\b|\b(?:i (?:always |constantly |keep )?get asked|the (?:number one|#1|most common) question|you (?:always|keep) ask(?:ing)?|you guys always)\b/i
const CUSTOMER_RE = /\b(?:customers?|clients?|regulars?|buyers?|shoppers?|subscribers?|members|students|users)\b[^.!?]{0,40}\b(?:say|says|said|tell|tells|told|love|loves|loved|rave|keep|come|came|order|orders|ordered|buy|buys|bought|ask|asks|asked|write|wrote|swear|swears|walk|walks|reorder)\b|\b(?:best[- ]?seller|five[- ]star|5[- ]star|reviews? (?:say|call)|rave reviews|fan favou?rite|crowd favou?rite)\b/i
const SCARCITY_RE = /\b(?:sells? out|sold out|selling (?:out|fast)|only \S+ left|only\b[^.!?]{0,40}\b(?:left|remaining)|limited (?:batch|stock|run|edition|time|supply)|almost gone|last chance|won't last|while (?:supplies|stocks?) last|running out|few left|back in stock|never restock|once it'?s gone)\b/i
const RESULT_RE = /\b(?:saved my (?:life|mornings?|business|sanity)|changed my life|changed everything|life[- ]changing|you'?ll (?:get|see|feel|notice|save|lose|gain|sleep)|guarantee[ds]?|guaranteed|transform(?:s|ed)? (?:your|my)|cured|fix(?:es|ed)? (?:your|my) \w+ for good|doubled? (?:my|your)|tripled|in (?:just )?\d+ days)\b/i
const EVENT_RE = /\b(?:i|we|she|he|they|my \w+|a (?:regular|customer|client|friend|neighbou?r|woman|man|guy|lady)|someone|one (?:customer|regular|client))\s+(?:was|were|had|went|came|walked|spilled|dropped|burned|burnt|lost|found|got|started|quit|opened|closed|tried|cried|laughed|realized|realised|decided|moved|ordered|bought|told|asked|said|wrote|messaged|showed|brought|sent|called|comes?|walks?|orders?|asks?|tells?|messages?|shows? up|drives?|drove|stopped|stops|began|begins|almost|nearly|finally|once|spent|kept|grew|learned|learnt|discovered|struggled)\b|\b(?:last (?:week|month|year|night|summer|winter|spring|fall|time)|yesterday|this morning|the other day|years ago|one day|the first time|that'?s how|ever since|back when|when i (?:first|started))\b/i
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
const HYPOTHETICAL_LEAD_RE = /^(?:if|when|whenever|once|stop|don'?t|never|avoid|imagine|say|let'?s say|picture)\b/i
const QUANTIFIER_RE = /\b(?:every|each|always|never|all of|only)\b/i
const SECOND_PERSON_PROMISE_RE = /\byou(?:'ll| will| would)\b/i
/** A first-person ORIGIN story: "I built the first version over a winter because…".
 *  "We built X to fix this" (a purpose) is not one; a time, place or cause is. */
export const ORIGIN_RE = /\b(?:i|we|my \w+ and i)\s+(?:first\s+)?(?:built|founded|launched|created|started|made)\b[^.!?]*\b(?:over (?:a|one|the)|in (?:my|our|a|the) (?:garage|kitchen|basement|bedroom|dorm|spare)|during|back (?:in|when)|because|after (?:i|we|my)|years? ago|months? ago|winter|summer|spring|autumn|first version|from scratch)\b/i

/** v3 (owner Reply 14, rule 4): a first-person HABIT or repeated experience
 *  ("I always…", "I tell it to…", "every time I…", "we usually…"). With no
 *  first-party item behind it this is I-HARD at rule level: neither judge can
 *  make it E or G. */
export const HABIT_RE = /\b(?:i|we)\s+(?:always|usually|often|never|constantly|typically|normally|generally|tend to|sometimes|still|regularly|religiously|every (?:day|morning|night|week|time|single))\b|\bevery (?:single )?(?:time|day|morning|night|week) (?:i|we)\b|\b(?:whenever|each time) (?:i|we)\b|\b(?:i|we)\s+(?:always\s+|usually\s+|just\s+)?(?:tell|ask|make|have|get|let|set|teach|train|prompt) (?:it|them|him|her|my|our|the)\b[^.!?]{0,40}\bto\b|\b(?:my|our) (?:routine|habit|ritual|go-to move|process) (?:is|was)\b/i
/** v3 (owner Reply 14, rule 3): pure advice or instruction. An imperative lead
 *  ("never treat X as Y until…", "stop…", "make sure…") or a takeaway frame
 *  ("the takeaway is…"). N unless it states a fact, number, result or
 *  first-person event (checked in ruleRead). */
const ADVICE_FRAME_RE = /^(?:so,?\s+|and\s+|but\s+|now,?\s+|here'?s the (?:thing|rule|fix|move|trick):?\s+)?(?:(?:the|my|your|one|biggest|real|main) (?:takeaway|lesson|rule|advice|tip|point|move|fix)(?: here)? (?:is|:)\s*:?|(?:pro )?tip:|takeaway:|rule of thumb:)/i
const IMPERATIVE_LEAD_RE = /^(?:so,?\s+|and\s+|but\s+|now,?\s+|just\s+|please\s+)?(?:never|don'?t|do not|always|stop|start|avoid|make sure|remember|keep|use|treat|try|check|ask|write|read|test|pick|choose|skip|put|give|set|turn|save|cut|add|swap|focus|think of|look for|watch for|measure|label|store|store|wait|let it|plan|build|batch|schedule|note|track|double-check|be sure)\b/i
const FACT_CONNECTIVE_RE = /\b(?:because|since|which (?:means|is why)|so that|that'?s why|studies|research|proven|according to)\b/i

/** "treat X as/like Y" (regard) is not a medical "treat". */
const TREAT_AS_RE = /\btreat(?:s|ed|ing)?\s+(?:[\w'-]+\s+){0,5}?(?:as|like)\b/gi
const withoutTreatAs = (t: string) => t.replace(TREAT_AS_RE, ' ')

/** High-risk health, safety, legal or money claims: never a truism, never G-SOFT. */
export const RISK_RE = /\b(?:cures?|cured|treats?|treated|treatment|heals?|healed|diagnos\w*|disease\w*|eczema|psoriasis|rosacea|dermatitis|acne|allerg\w*|toxic\w*|carcinogen\w*|cancer\w*|hormon\w*|pregnan\w*|infection\w*|inflammat\w*|prescription\w*|dosage|overdose|medical(?:ly)?|clinical(?:ly)?|doctors?|dermatologists?|safe (?:for|to|during)|unsafe|poison\w*|lawsuits?|illegal|legally|lawyers?|taxe?s?|irs|insurance|invest\w*|profits?|income|debt|loans?|interest rate|refunds?)\b/i
/** A title/caption/thumbnail that states an outcome is a result claim, not a truism (v2 rule 4). */
export const OUTCOME_FRAGMENT_RE = /\b(?:protect(?:s|ion|ed)?|repairs?|repaired|restor(?:e|es|ed)|smooth(?:s|er|ed)?|sooth(?:e|es|ed|ing)|clear(?:s|er|ed)? (?:skin|pores)|built|builds|boost(?:s|ed)?|grew|grows?|growth|doubl(?:e|ed|es)|tripl(?:e|ed|es)|increas(?:e|ed|es)|saved?|saves|won|wins|works|worked|results?|trust|sales|revenue|more (?:sales|customers|orders|followers|clients))\b/i
/** Nouns a list-count promise counts ("3 things", "five quick tips"). */
const LIST_NOUN = '(?:things?|tips?|ways?|reasons?|mistakes?|steps?|secrets?|rules?|signs?|questions?|lessons?|ideas?|tricks?|habits?|myths?|hacks?|facts?|checks?|ingredients to avoid)'
const LIST_COUNT_RE = new RegExp(`\\b(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\\s+(?:[a-z'-]+\\s+){0,2}?${LIST_NOUN}\\b`, 'gi')

/** List-count promises in a sentence ("Two weird things nobody tells you" → [2]). */
export function listCounts(text: string): number[] {
  const out: number[] = []
  for (const m of String(text ?? '').matchAll(LIST_COUNT_RE)) {
    const w = m[1]!.toLowerCase()
    const n = /^\d+$/.test(w) ? Number(w) : NUMBER_WORDS[w]
    if (typeof n === 'number' && n >= 2) out.push(n)
  }
  return out
}

const ORDINAL_RE = /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|number (?:one|two|three|four|five|six|seven|eight|nine|ten)|#\d|\d+[.)])(?=[\s,:])/gi
/** How many list items the script delivers: the larger of its ordinal markers
 *  ("first", "number two", "3.") and its body beats (all beats but the first and the last). */
export function listDelivery(sentences: readonly GateSentence[]): number {
  const beats = new Set<number>()
  let ordinals = 0
  for (const s of sentences) {
    if (s.surface !== 'script') continue
    beats.add(s.at)
    ordinals += (s.text.match(ORDINAL_RE) ?? []).length
  }
  return Math.max(ordinals, Math.max(0, beats.size - 2))
}

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

const HARD_TYPES = new Set<ClaimType>(['event', 'number', 'quote', 'scarcity', 'audience', 'customer', 'result', 'cross_product', 'feeling', 'presupposition', 'risk', 'habit'])
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

/** What a sentence's rules may know about the rest of the script. */
export interface RuleContext {
  /** List items the script delivers (`listDelivery`); absent = not checked. */
  delivered?: number
  /** The script sentence a fragment paraphrases. */
  parentText?: string
}

const FRAGMENT_SURFACES = new Set<Surface>(['title', 'caption', 'thumbnail_text'])

/** The context `ruleRead` gets for each sentence of one blueprint. */
export function ruleContexts(sentences: readonly GateSentence[]): (s: GateSentence) => RuleContext {
  const delivered = listDelivery(sentences)
  const byI = new Map(sentences.map((x) => [x.i, x] as const))
  return (s) => ({ delivered, ...(s.parent !== undefined && byI.get(s.parent) ? { parentText: byI.get(s.parent)!.text } : {}) })
}

/** v3 rule 1: does a non-script fragment add a claim no script line makes?
 *  A new number (normalized, incl. a list count), a product no script line
 *  names, an outcome/result word no script line has, or a hard claim (event,
 *  habit, feeling, quote, audience, customer, scarcity, risk) that no script
 *  line sharing its words makes. Script sentences: always null. */
export function fragmentNewClaim(s: GateSentence, sentences: readonly GateSentence[], products: readonly ProductName[]): 'number' | 'product' | 'result' | ClaimType | null {
  if (s.surface === 'script' || isPlaceholder(s.text)) return null
  const lines = sentences.filter((x) => x.surface === 'script' && !isPlaceholder(x.text))
  const t = s.text
  const lineNums = lines.flatMap((x) => [...parseNumbers(x.text), ...listCounts(x.text).map((v) => ({ value: v, unit: 'count' as NumberUnit, field: 'count' }))])
  const fragNums = [...parseNumbers(t).filter((n) => !(n.unit === 'count' && n.value <= 1)), ...listCounts(t).map((v) => ({ value: v, unit: 'count' as NumberUnit, field: 'count' }))]
  if (fragNums.some((n) => !lineNums.some((m) => m.value === n.value && (m.unit === n.unit || n.unit === 'count' || m.unit === 'count')))) return 'number'
  const named = (txt: string) => products.filter((p) => mentionsAnyProduct(txt, [p])).map((p) => p.id)
  const lineProducts = new Set(lines.flatMap((x) => named(x.text)))
  if (named(t).some((id) => !lineProducts.has(id))) return 'product'
  const lineWords = new Set(lines.flatMap((x) => [...contentWords(x.text)]))
  for (const re of [OUTCOME_FRAGMENT_RE, RESULT_RE]) {
    const m = t.match(new RegExp(re.source, 'gi')) ?? []
    for (const hit of m) { const ws = [...contentWords(hit)]; if (ws.length && !ws.every((w) => lineWords.has(w))) return 'result' }
  }
  const fw = contentWords(t)
  const kinds: Array<[ClaimType, RegExp]> = [['event', EVENT_RE], ['event', ORIGIN_RE], ['habit', HABIT_RE], ['feeling', FEELING_RE], ['quote', QUOTE_RE],
    ['audience', AUDIENCE_RE], ['customer', CUSTOMER_RE], ['scarcity', SCARCITY_RE], ['risk', RISK_RE]]
  for (const [kind, re] of kinds) {
    if (!re.test(t)) continue
    const backed = lines.some((x) => re.test(x.text) && coverage(fw, contentWords(x.text)) >= 0.34)
    if (!backed) return kind
  }
  return null
}

/** v3 rule 1: the fragments that INHERIT (no new claim): fragment i → its parent
 *  script sentence, or null when no script line overlaps it (then it is no claim). */
export function inheritingFragments(sentences: readonly GateSentence[], products: readonly ProductName[]): Map<number, number | null> {
  const out = new Map<number, number | null>()
  for (const s of sentences) {
    if (s.surface === 'script' || isPlaceholder(s.text)) continue
    if (fragmentNewClaim(s, sentences, products)) continue
    out.set(s.i, s.parent ?? null)
  }
  return out
}

/** Rule pre-classifier (design A3). Never switched off by "story on file". */
export function ruleRead(s: GateSentence, ledger: readonly LedgerItem[], products: readonly ProductName[], targetId: string | null, ctx: RuleContext = {}): RuleRead {
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
  // v4: one shared word ("WHY IT STINGS") is not a claim about another product.
  const outHits = Math.max(0, ...ranked.filter((x) => !inScope(x.it, subject)).map((x) => [...ws].filter((w) => contentWords(x.it.text).has(w)).length))

  const isQuestion = /\?\s*["”')]*$/.test(t)
  const presup = isQuestion && PRESUP_Q_RE.test(t.trim())
  if (presup) types.push('presupposition')
  if (AUDIENCE_RE.test(t)) types.push('audience')
  if (CUSTOMER_RE.test(t)) types.push('customer')
  if (SCARCITY_RE.test(t)) types.push('scarcity')
  if (RESULT_RE.test(t)) types.push('result')
  if (HYPERBOLE_RE.test(t)) types.push('hyperbole')
  if (EVENT_RE.test(t) || ORIGIN_RE.test(t)) types.push('event')
  if (HABIT_RE.test(t)) types.push('habit')
  if (QUOTE_RE.test(t)) types.push('quote')
  if (FEELING_RE.test(t)) types.push('feeling')
  if (FIGURATIVE_RE.test(t)) types.push('figurative')
  if (OPINION_RE.test(t)) types.push('opinion')
  if (RISK_RE.test(withoutTreatAs(t))) types.push('risk')
  // v2 rule 4: a title/caption/thumbnail that states an outcome is a result
  // claim (unless the script line it paraphrases states it too: then the
  // fragment inherits that line's verdict).
  if (FRAGMENT_SURFACES.has(s.surface) && !isQuestion && OUTCOME_FRAGMENT_RE.test(t) && !(ctx.parentText && OUTCOME_FRAGMENT_RE.test(ctx.parentText))) types.push('result')
  // v2 rule 3: a list-count promise ("3 things") is checked against delivery,
  // not evidence; every other number is still matched digit-to-field.
  const lists = listCounts(t)
  if (lists.length) types.push('list_count')
  const listLeft = [...lists]
  const nums = parseNumbers(t).filter((n) => !(n.unit === 'count' && n.value <= 1)).filter((n) => {
    const k = n.unit === 'count' ? listLeft.indexOf(n.value) : -1
    if (k >= 0) { listLeft.splice(k, 1); return false }
    return true
  })
  // v4: a small count in a hypothetical, an instruction or a question ("when
  // two people share an inbox", "stop letting two people reply") is not a
  // factual number. Units, prices, sizes and anything personal or about a
  // product are still matched digit-to-field.
  const hypothetical = (isQuestion || HYPOTHETICAL_LEAD_RE.test(t.trim())) && !FIRST_PERSON_RE.test(t) && !mentionsAnyProduct(t, products) && subject === targetId
  if (hypothetical) for (let k = nums.length - 1; k >= 0; k--) if (nums[k]!.unit === 'count' && nums[k]!.value <= 3) nums.splice(k, 1)
  if (nums.length) types.push('number')
  if (bestOut >= 0.5 && bestScoped < 0.25 && outHits >= 2) types.push('cross_product')

  // Close items for a replace repair: in scope, and her own words when the claim is gated.
  const needsHer = types.some((x) => GATED.has(x) || x === 'event' || x === 'quote' || x === 'feeling' || x === 'habit')
  const near = ranked.filter((x) => x.o >= 0.25 && inScope(x.it, subject) && (!needsHer || isHerOwn(x.it))).slice(0, 4).map((x) => x.it.id)
  const read = (hard: RuleRead['hard'], soft: RuleRead['soft'] = null): RuleRead =>
    ({ claim_types: [...new Set(types)], hard, soft, near, subject_product: subject })

  // A pure question to the viewer carries no claim.
  if (isQuestion && !presup && !types.some((x) => HARD_TYPES.has(x) && x !== 'presupposition')) return read(null, { cls: 'N', reason: 'pure_question' })
  // LIST COUNT: the script must deliver as many items as it promises.
  if (ctx.delivered !== undefined && lists.some((n) => n > ctx.delivered!)) return read({ cls: 'I', reason: 'list_count_undelivered' })
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
  // v3 rule 4: a first-person habit with no first-party item behind it.
  if (types.includes('habit') && bestHer < HER_MIN) return read({ cls: 'I', reason: 'habit_unbacked' })
  if (types.includes('quote') && bestHer < HER_MIN) return read({ cls: 'I', reason: 'invented_quote' })
  if (types.includes('cross_product') && !gated.length) return read({ cls: 'I', reason: 'cross_product' })

  const hardPresent = types.some((x) => HARD_TYPES.has(x))
  // v3 rule 3: pure advice/instruction with no fact, number, result or event is N.
  if (isPureAdvice(t, types, nums.length, products)) return read(null, { cls: 'N', reason: 'advice' })
  // Figurative language with no checkable claim is N (owner amendment e).
  if (types.includes('figurative') && !hardPresent && !COMPARATIVE_RE.test(t)) return read(null, { cls: 'N', reason: 'figurative' })
  // A non-specific, non-risky truism is N (owner amendment f).
  if (!hardPresent && !FIRST_PERSON_RE.test(t) && !SPECIFIC_RE.test(t) && !RISK_RE.test(t) && !PRODUCT_PRONOUN_RE.test(t) && !SECOND_PERSON_PROMISE_RE.test(t) && !COMPARATIVE_RE.test(t)
    && subject === targetId && !mentionsAnyProduct(t, products) && wordCount(t) <= 12 && !types.includes('opinion')) {
    return read(null, { cls: 'N', reason: CTA_RE.test(t) ? 'cta' : 'truism' })
  }
  if (CTA_RE.test(t) && !hardPresent && wordCount(t) <= 14) return read(null, { cls: 'N', reason: 'cta' })
  if (wordCount(t) <= 3 && !hardPresent) return read(null, { cls: 'N', reason: 'no_claim' })
  return read(null)
}

/** v3 rule 3: an imperative or a takeaway frame that states no fact: no hard
 *  claim type (number, result, event, habit, risk, …), no comparative or
 *  scientific claim, no "because"/"that's why" fact, no promise to the viewer,
 *  no first person outside the frame, and no product named. */
export function isPureAdvice(t: string, types: readonly ClaimType[], numberCount: number, products: readonly ProductName[]): boolean {
  const text = t.trim()
  const frame = text.match(ADVICE_FRAME_RE)
  if (!frame && !IMPERATIVE_LEAD_RE.test(text)) return false
  if (/\?\s*["”')]*$/.test(text)) return false
  if (numberCount > 0 || types.some((x) => HARD_TYPES.has(x))) return false
  const rest = frame ? text.slice(frame[0].length) : text
  if (FIRST_PERSON_RE.test(rest) || OUR_RE.test(rest)) return false
  if (RISK_RE.test(withoutTreatAs(text)) || COMPARATIVE_RE.test(text) || FACT_CONNECTIVE_RE.test(text) || SECOND_PERSON_PROMISE_RE.test(text) || RESULT_RE.test(text)) return false
  if (mentionsAnyProduct(text, products)) return false
  return true
}

/** Does the sentence name a product? v4: a multi-word name whose words are
 *  common ("Calm Cream") is named only when all its words appear ("calms the
 *  skin" is not Calm Cream); a one-word name is named by that word. Scope
 *  (`subjectProduct`) is unchanged. */
function mentionsAnyProduct(t: string, products: readonly ProductName[]): boolean {
  const ws = contentWords(t)
  return products.some((p) => {
    const pw = [...productWordsOf(p.name)].filter((w) => w.length >= 4)
    if (!pw.length) return false
    return pw.length === 1 ? ws.has(pw[0]!) : pw.every((w) => ws.has(w))
  })
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
          uncertain: { type: 'BOOLEAN' },
        },
        required: ['i', 'class', 'item_ids'],
      },
    },
  },
  required: ['sentences'],
} as const

const fence = (s: string) => s.split('<<<UNTRUSTED_DATA').join('').split('END_UNTRUSTED_DATA>>>').join('')

/** One prompt per chunk of sentences, carrying only the items relevant to that chunk (see `chunkLedger`). */
export function buildJudgePrompt(sentences: readonly GateSentence[], ledger: readonly LedgerItem[], products: readonly ProductName[] = [], parents: ReadonlyMap<number, string> = new Map()): string {
  const prodName = (id: string | null) => (id === null ? 'general' : products.find((p) => p.id === id)?.name ?? id)
  const items = ledger.map((it) => `[${it.id}] (${it.origin}${it.field ? `/${it.field}` : ''}; about: ${prodName(it.product_id)}; ${it.first_party ? 'her own words' : 'outside source'}${it.origin === 'urgency' ? (it.live ? '; LIVE' : '; NOT live') : ''}) ${it.text.slice(0, 400)}`)
  const lines = sentences.map((s) => {
    const p = s.parent !== undefined ? parents.get(s.parent) : undefined
    return p ? `${s.i}. (${s.surface}) ${s.text}\n   (paraphrases script line: ${p.slice(0, 300)})` : `${s.i}. (${s.surface}) ${s.text}`
  })
  return [
    'Classify EVERY sentence below as exactly one of:',
    'S = every claim is entailed by one listed item about the same product (or a general item); numbers match the item number with the same unit and meaning.',
    'E = an item backs it, but the sentence adds intensity, frequency or an experience adjective ("always", "every single time"); the addition is never a number, event, quote, scarcity or result.',
    'I = any claim with no entailing item; a claim backed only by an item about ANOTHER product; a number whose unit or meaning differs ("two parts water" is not "a two-pound bag"); what people/customers/followers ask or say without HER OWN item saying so (outside sources never count); scarcity without a LIVE urgency item; an event, quote or feeling she never gave, in ANY tense ("people always ask me", "a regular comes in every morning").',
    'N = no checkable claim: a pure question to the viewer, a transition, a call to action restating the offer, an opinion she gave, figurative language ("a hug in a mug"), or a non-specific harmless truism ("good coffee takes time").',
    'A question that PRESUPPOSES a fact ("Did you know every bag is roasted the morning it ships?") is judged on that fact.',
    'Hyperbole about her own experience ("this literally saved my mornings") is E when her own item backs the experience, otherwise I.',
    'item_ids: the ids of the items that entail the sentence (empty for I or N). claim_types: any of audience, customer, result, scarcity, number, event, quote, feeling, presupposition, cross_product, opinion, figurative, general. reason: at most 8 words.',
    'A title, caption or on-screen fragment that shows the script line it paraphrases is judged as that line: only a claim the fragment ADDS is judged on its own.',
    'A list-count promise ("3 things", "five tips") is not a factual number; judge the rest of the sentence.',
    'Pure advice or instruction that states no fact, number, result or event ("never treat a draft as final until…", "the takeaway is…") is N.',
    'A first-person habit or repeated experience ("I always…", "every time I…", "we usually…") is an event: I unless HER OWN item says it.',
    'Numbers match in any form: "thirty-eight dollars" = "$38" = "38 USD"; "twelve ounce" = "12 oz".',
    'uncertain: true when you cannot tell whether the material entails the sentence, or it is only partly backed (a stronger checker looks again); otherwise false.',
    `\nMATERIAL (the only source of truth):\n<<<UNTRUSTED_DATA material\n${fence(items.join('\n'))}\nEND_UNTRUSTED_DATA>>>`,
    `\nSENTENCES:\n<<<UNTRUSTED_DATA sentences\n${fence(lines.join('\n'))}\nEND_UNTRUSTED_DATA>>>`,
    '\nReturn {"sentences":[{"i":0,"class":"S","item_ids":["…"],"claim_types":[],"reason":"…","uncertain":false}]} with one entry per sentence.',
  ].join('\n')
}

export interface JudgeVerdict { i: number; cls: GateClass; item_ids: string[]; claim_types: ClaimType[]; reason: string; uncertain?: boolean }

const CLAIM_TYPES = new Set<ClaimType>(['audience', 'customer', 'result', 'scarcity', 'number', 'event', 'quote', 'feeling', 'presupposition', 'cross_product', 'product', 'opinion', 'general', 'figurative', 'hyperbole', 'risk', 'list_count', 'habit'])

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
    verdicts.set(i, { i, cls: cls as GateClass, item_ids: [...new Set(ids)], claim_types: [...new Set(types)], reason: String(r?.reason ?? '').slice(0, 60), ...(r?.uncertain === true ? { uncertain: true } : {}) })
  }
  return { verdicts, malformed }
}

// ── FAST PATH: PREFILTER → CHUNKS → CASCADE (owner decision 13 Oct) ────────
//
// One judge call over a whole script took 40-70 s. Three cuts, none of which
// loosens a verdict:
//   1. PREFILTER: a sentence the rules already decide (N by rule, I by a hard
//      rule, a placeholder) never goes to the judge — `classifySentences`
//      decides it the same way with or without a verdict.
//   2. CHUNKS: the rest go in groups of ~6, each prompt carrying only the items
//      that could matter to that group (in scope + lexical/number relevance +
//      the closest items, plus every first-party/live item when the group has a
//      gated claim). Chunks run in parallel, a few at a time.
//   3. TWO JUDGES (owner Reply 13, replaces the v3/v4 escalation cascade): the
//      fast model (task class `read`) AND the stronger model (task class
//      `extract`) each judge EVERY chunk, in parallel. Both verdicts are kept;
//      `combineJudges` turns them into pass / review / block.

export class GateTimeout extends Error {}

/** Sentences per judge call. */
export const JUDGE_CHUNK_SIZE = 6
/** Judge calls in flight at once per request (6 hit rate limits in calibration). */
export const JUDGE_CONCURRENCY = 4
/** Thinking budget for the judge: off. Schema-constrained classification. */
export const JUDGE_THINKING_BUDGET = 0
/** The two judges (task classes of model_routing_v1.json). Both judge every sentence the rules send on. */
export const INVENTION_JUDGE_CASCADE = { fast: 'read', strong: 'extract' } as const
/** Alias with the current meaning: two independent judges, not a cascade. */
export const INVENTION_JUDGES = INVENTION_JUDGE_CASCADE

/** Steps the durable worker run reports on `blueprint.gate_progress`. */
export type GateStep = 'queued' | 'judging' | 'repairing' | 'done' | 'failed'
export interface GateProgress { step: GateStep; at: string; chunks_done: number; chunks_total: number }
export function gateProgress(step: GateStep, chunksDone = 0, chunksTotal = 0, at: number = Date.now()): GateProgress {
  return { step, at: new Date(at).toISOString(), chunks_done: chunksDone, chunks_total: chunksTotal }
}

/** Per-request timing, recorded on the gate record (numbers only). */
export interface GatePerf {
  ms_total: number
  /** Wall time of each judge call (fast and strong), in order of completion. */
  chunk_ms: number[]
  judge_calls: number
  /** v5 two-judge: always 0 (no escalation cascade). Kept so old records and readers stay valid. */
  escalations: number
  /** Calls made to the strong judge (also counted in judge_calls). */
  strong_calls?: number
  /** Strong-judge chunks that failed (their sentences keep only the fast verdict). */
  strong_failed?: number
  /** Sentences the rules decided without a judge. */
  prefiltered: number
  /** Sentences sent to the judge (cache hits from an earlier round excluded). */
  judged: number
  /** Fast-judge chunks that failed (their sentences keep only the strong verdict). */
  fast_failed?: number
  /** Sentences no judge answered (judge_missing); the rest of the script kept its verdicts. */
  unjudged?: number
  /** Error classes of failed judge calls (never text). */
  errors?: string[]
}
export const emptyPerf = (): GatePerf => ({ ms_total: 0, chunk_ms: [], judge_calls: 0, escalations: 0, prefiltered: 0, judged: 0 })

/** Perf of a run that threw: what finished before, plus the failing judge pass's counts. */
export function mergeFailedPerf(perf: GatePerf, failed: GatePerf | undefined, msTotal: number): GatePerf {
  if (!failed) return { ...perf, ms_total: msTotal }
  return {
    ...perf, ms_total: msTotal,
    chunk_ms: [...perf.chunk_ms, ...failed.chunk_ms],
    judge_calls: perf.judge_calls + failed.judge_calls,
    escalations: perf.escalations + failed.escalations,
    prefiltered: perf.prefiltered + failed.prefiltered,
    judged: perf.judged + failed.judged,
    ...(failed.unjudged || perf.unjudged ? { unjudged: (perf.unjudged ?? 0) + (failed.unjudged ?? 0) } : {}),
    ...(failed.fast_failed || perf.fast_failed ? { fast_failed: (perf.fast_failed ?? 0) + (failed.fast_failed ?? 0) } : {}),
    ...(failed.strong_calls || perf.strong_calls ? { strong_calls: (perf.strong_calls ?? 0) + (failed.strong_calls ?? 0) } : {}),
    ...(failed.strong_failed || perf.strong_failed ? { strong_failed: (perf.strong_failed ?? 0) + (failed.strong_failed ?? 0) } : {}),
    ...(failed.errors?.length || perf.errors?.length ? { errors: [...(perf.errors ?? []), ...(failed.errors ?? [])] } : {}),
  }
}

/** True when the rules (or a placeholder) already decide this sentence. */
export function decidedByRule(s: GateSentence, r: RuleRead): boolean {
  return isPlaceholder(s.text) || !!r.hard || !!r.soft
}

export function chunk<T>(xs: readonly T[], size: number = JUDGE_CHUNK_SIZE): T[][] {
  const n = Math.max(1, Math.floor(size))
  const out: T[][] = []
  for (let k = 0; k < xs.length; k += n) out.push(xs.slice(k, k + n))
  return out
}

const NEEDS_HER = new Set<ClaimType>(['audience', 'customer', 'result', 'scarcity', 'event', 'quote', 'feeling', 'habit'])

/** The items a chunk's prompt carries: in scope for one of its sentences, and
 *  either one of their closest items, sharing a content word or a number with
 *  them, or (when the chunk holds a gated/her-own claim) any first-party or
 *  live item. Out-of-scope items can never back a sentence, so leaving them out
 *  changes no verdict. */
export function chunkLedger(group: ReadonlyArray<{ s: GateSentence; r: RuleRead }>, ledger: readonly LedgerItem[]): LedgerItem[] {
  const words = new Set<string>()
  const nums: LedgerNumber[] = []
  for (const { s } of group) { for (const w of contentWords(s.text)) words.add(w); nums.push(...parseNumbers(s.text)) }
  const near = new Set(group.flatMap((g) => g.r.near))
  const gated = group.some((g) => g.r.claim_types.some((t) => NEEDS_HER.has(t)))
  return ledger.filter((it) => {
    if (!group.some((g) => inScope(it, g.r.subject_product))) return false
    if (near.has(it.id)) return true
    if (gated && (it.first_party || it.live)) return true
    if (it.numbers.some((n) => nums.some((m) => m.value === n.value))) return true
    for (const w of contentWords(it.text)) if (words.has(w)) return true
    return false
  })
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (x: T, k: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) { const k = next++; out[k] = await fn(items[k]!, k) }
  }))
  return out
}

export interface JudgeRunInput {
  sentences: readonly GateSentence[]
  ledger: readonly LedgerItem[]
  products?: readonly ProductName[]
  targetProductId?: string | null
  chunkSize?: number
  concurrency?: number
  /** Fast verdicts from an earlier round, keyed by `verdictKey`; unchanged sentences are not judged again. */
  cache?: Map<string, JudgeVerdict>
  /** The strong judge's cache, same keys. */
  cacheStrong?: Map<string, JudgeVerdict>
}
export interface JudgeRunDeps {
  /** The fast judge (task class `read`). Raw model text. */
  judge: (prompt: string) => Promise<string>
  /** The stronger judge (task class `extract`): judges every chunk too, in
   *  parallel with the fast one. None = the fast judge stands in for both. */
  judgeStrong?: (prompt: string) => Promise<string>
  /** Called after each judge call: calls done so far, calls planned so far. */
  onChunk?: (done: number, total: number) => void
  now?: () => number
  /** Wraps each call (the gate's deadline). */
  wrap?: <T>(p: Promise<T>) => Promise<T>
}
export interface JudgeRunResult {
  /** The strong judge's verdicts where it answered, else the fast one's (back-compat single map). */
  verdicts: Map<number, JudgeVerdict>
  fast: Map<number, JudgeVerdict>
  /** Equal to `fast` (same map) when no strong judge was given. */
  strong: Map<number, JudgeVerdict>
  malformed: number
  perf: GatePerf
}

export const verdictKey = (s: GateSentence) => `${s.surface}\u0000${s.text}`

/** Prefilter → chunk → fast judge → strong judge for the uncertain ones. */
/** The sentences the judge must see: not a placeholder, not decided by a rule,
 *  not a fragment inheriting its script line (v2). The ONE definition of the
 *  prefilter, shared by `judgeSentences` (worker) and the calibration dry run. */
export function pendingForJudge(sentences: readonly GateSentence[], ledger: readonly LedgerItem[], products: readonly ProductName[], target: string | null): Array<{ s: GateSentence; r: RuleRead }> {
  const out: Array<{ s: GateSentence; r: RuleRead }> = []
  const ctxOf = ruleContexts(sentences)
  const reads = new Map<number, RuleRead>()
  const readOf = (s: GateSentence) => { let r = reads.get(s.i); if (!r) { r = ruleRead(s, ledger, products, target, ctxOf(s)); reads.set(s.i, r) } return r }
  const inherits = inheritingFragments(sentences, products)
  for (const s of sentences) {
    if (isPlaceholder(s.text) || inherits.has(s.i)) continue
    const r = readOf(s)
    // v4: a fragment is judged on its own unless a rule decides it; whether it
    // inherits is settled after its script line has a verdict (classifySentences).
    if (decidedByRule(s, r)) continue
    out.push({ s, r })
  }
  return out
}

/** A failure as a short class, never text: 'timeout', 'http_429', 'abort', 'parse', or the error name. */
export function errorClass(e: unknown): string {
  if (e instanceof GateTimeout) return 'timeout'
  const name = String((e as Error)?.name ?? 'error')
  const msg = String((e as Error)?.message ?? '')
  const http = msg.match(/\b(?:model|gemini|status)\D{0,12}(\d{3})\b/i)
  if (http) return `http_${http[1]}`
  if (name === 'AbortError' || /abort/i.test(msg)) return 'abort'
  if (name === 'SyntaxError') return 'parse'
  return name.slice(0, 40)
}

export async function judgeSentences(input: JudgeRunInput, deps: JudgeRunDeps): Promise<JudgeRunResult> {
  const perfOut = emptyPerf()
  try {
    return await judgeSentencesInner(input, deps, perfOut)
  } catch (e) {
    // The work done before a failure is still reported (escalations, calls, ms).
    if (e && typeof e === 'object') (e as { perf?: GatePerf }).perf = perfOut
    throw e
  }
}

async function judgeSentencesInner(input: JudgeRunInput, deps: JudgeRunDeps, perf: GatePerf): Promise<JudgeRunResult> {
  const now = deps.now ?? (() => Date.now())
  const wrap = deps.wrap ?? (<T>(p: Promise<T>) => p)
  const products = input.products ?? []
  const target = input.targetProductId ?? null
  const ids = new Set(input.ledger.map((it) => it.id))
  const verdicts = new Map<number, JudgeVerdict>()
  let malformed = 0
  const pending: Array<{ s: GateSentence; r: RuleRead }> = []
  const ctxOf = ruleContexts(input.sentences)
  const reads = new Map<number, RuleRead>()
  // v3 rule 1: a fragment with no claim of its own takes its script line's verdict; never judged.
  const inherits = inheritingFragments(input.sentences, products)
  for (const s of input.sentences) {
    if (isPlaceholder(s.text) || inherits.has(s.i)) { perf.prefiltered++; continue }
    const r = ruleRead(s, input.ledger, products, target, ctxOf(s))
    reads.set(s.i, r)
    // v4: fragments are judged on their own unless a rule decides them (see pendingForJudge).
    if (decidedByRule(s, r)) { perf.prefiltered++; continue }
    const hit = input.cache?.get(verdictKey(s))
    if (hit) { verdicts.set(s.i, { ...hit, i: s.i }); continue }
    pending.push({ s, r })
  }
  perf.judged = pending.length
  const size = input.chunkSize ?? JUDGE_CHUNK_SIZE
  const limit = input.concurrency ?? JUDGE_CONCURRENCY
  let done = 0
  let total = 0
  const run = async (group: Array<{ s: GateSentence; r: RuleRead }>, call: (p: string) => Promise<string>) => {
    const parents = new Map<number, string>()
    for (const g of group) if (g.s.parent !== undefined) { const p = input.sentences.find((x) => x.i === g.s.parent); if (p) parents.set(p.i, p.text) }
    const prompt = buildJudgePrompt(group.map((g) => g.s), chunkLedger(group, input.ledger), products, parents)
    const t0 = now()
    try {
      const raw = await wrap(call(prompt))
      const parsed = parseJudge(raw, input.sentences.length, ids)
      const mine = new Set(group.map((g) => g.s.i))
      const out = new Map<number, JudgeVerdict>()
      for (const [i, v] of parsed.verdicts) if (mine.has(i)) out.set(i, v)
      malformed += parsed.malformed
      return out
    } finally {
      perf.chunk_ms.push(now() - t0)
      perf.judge_calls++
      deps.onChunk?.(++done, total)
    }
  }
  // ⚖️ TWO JUDGES, EVERY CHUNK, IN PARALLEL. A failed chunk on one side
  // leaves that side's verdict missing for its sentences (judge_missing reads
  // as I-HARD for that judge); the other side's verdicts stand, and the rest
  // of the script keeps its verdicts (v4 per-chunk degradation).
  const groups = chunk(pending, size)
  total = groups.length * (deps.judgeStrong ? 2 : 1)
  const strongV = deps.judgeStrong ? new Map<number, JudgeVerdict>() : verdicts
  let fastFailed = 0
  let strongFailed = 0
  let lastError: unknown = null
  const fail = (e: unknown) => { lastError = e; perf.errors = [...(perf.errors ?? []), errorClass(e)] }
  await mapLimit(groups, limit, async (group) => {
    await Promise.all([
      run(group, deps.judge).then((got) => { for (const [i, v] of got) verdicts.set(i, v) }, (e) => { fastFailed++; fail(e) }),
      deps.judgeStrong
        ? run(group, deps.judgeStrong).then((got) => { perf.strong_calls = (perf.strong_calls ?? 0) + 1; for (const [i, v] of got) strongV.set(i, { ...v, uncertain: false }) }, (e) => { perf.strong_calls = (perf.strong_calls ?? 0) + 1; strongFailed++; fail(e) })
        : Promise.resolve(),
    ])
  })
  if (fastFailed) perf.fast_failed = fastFailed
  if (strongFailed) perf.strong_failed = strongFailed
  // Cache hits (both sides were cached together).
  for (const s of input.sentences) { const h = input.cacheStrong?.get(verdictKey(s)); if (h && deps.judgeStrong && !strongV.has(s.i) && !pending.some((g) => g.s.i === s.i)) strongV.set(s.i, { ...h, i: s.i }) }
  const unjudged = pending.filter((g) => !verdicts.has(g.s.i) && !strongV.has(g.s.i)).length
  if (unjudged) perf.unjudged = unjudged
  // Nothing judged at all by either judge: that is a failed gate (the worker retries), not a degraded one.
  if (pending.length && unjudged === pending.length && lastError) throw lastError
  if (input.cache) for (const s of input.sentences) { const v = verdicts.get(s.i); if (v) input.cache.set(verdictKey(s), v) }
  if (input.cacheStrong && deps.judgeStrong) for (const s of input.sentences) { const v = strongV.get(s.i); if (v) input.cacheStrong.set(verdictKey(s), v) }
  const merged = new Map(verdicts)
  for (const [i, v] of strongV) merged.set(i, v)
  return { verdicts: merged, fast: verdicts, strong: strongV, malformed, perf }
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
  /** Two-judge run (owner Reply 13): each judge's class and the combined verdict. */
  fast_class?: GateClass
  strong_class?: GateClass
  verdict?: GateVerdict
}

/** pass = ships as written; review = ships, shown to the creator to confirm/edit/remove
 *  (never hidden, never repaired); block = repaired (replace/ask/drop + re-check). */
export type GateVerdict = 'pass' | 'review' | 'block'

/** ⚖️ THE COMBINE RULE (owner Reply 13; rules frozen):
 *    both judges I-HARD          → block
 *    either judge I-HARD         → review
 *    either judge G-SOFT         → review (an unsupported low-risk claim needs sourcing)
 *    otherwise                   → pass
 *  A rule-decided sentence reads the same under both judges, so rule N/S pass
 *  and a hard-rule I blocks, exactly as before. */
export function combineVerdict(fast: GateClass, strong: GateClass): GateVerdict {
  if (fast === 'I' && strong === 'I') return 'block'
  if (fast === 'I' || strong === 'I' || fast === 'G' || strong === 'G') return 'review'
  return 'pass'
}

/** Merge the per-judge classifications (same sentences, same order) into one.
 *  The merged `class` drives repair and the outcome: block → I (repaired);
 *  review → never I (the non-I judge's class, G when either said G), so a
 *  review line alone never makes a script needs_answers/general; pass → the
 *  strong judge's class. A fragment that inherits its script line under both
 *  judges takes the line's verdict (round-4 inheritance). */
export function combineJudges(fast: readonly ClassifiedSentence[], strong: readonly ClassifiedSentence[]): ClassifiedSentence[] {
  const out: ClassifiedSentence[] = []
  fast.forEach((f, k) => {
    const s = strong[k] ?? f
    const verdict = combineVerdict(f.class, s.class)
    const both = { fast_class: f.class, strong_class: s.class, verdict }
    if (verdict === 'block') { out.push({ ...(s.class === 'I' ? s : f), ...both }); return }
    if (verdict === 'review') {
      const pick = f.class === 'I' ? s : s.class === 'I' ? f : (s.class === 'G' ? s : f)
      out.push({ ...pick, ...both, class: f.class === 'G' || s.class === 'G' ? 'G' : pick.class, judged: f.judged || s.judged })
      return
    }
    out.push({ ...s, ...both, judged: f.judged || s.judged })
  })
  return out
}

/** Run classifySentences once per judge and combine. */
export function classifyTwoJudges(input: Omit<ClassifyInput, 'judge'> & { fast: Map<number, JudgeVerdict> | null; strong: Map<number, JudgeVerdict> | null }): ClassifiedSentence[] {
  const f = classifySentences({ ...input, judge: input.fast })
  const s = input.strong === input.fast ? f : classifySentences({ ...input, judge: input.strong })
  return combineJudges(f, s)
}

export interface ClassifyInput {
  sentences: readonly GateSentence[]
  ledger: readonly LedgerItem[]
  products?: readonly ProductName[]
  targetProductId?: string | null
  /** The judge's parsed verdicts, or null when no judge ran (measure-only/timeout). */
  judge: Map<number, JudgeVerdict> | null
}

/** Claim types that keep an unsupported claim I-HARD, whether the rules or the judge named them:
 *  personal experience/events, what people did or said, numbers, results,
 *  scarcity, customer/audience facts, product and cross-product claims, high risk. */
const ALWAYS_HARD = new Set<ClaimType>(['event', 'quote', 'feeling', 'scarcity', 'number', 'cross_product', 'product', 'risk', 'audience', 'customer', 'result', 'habit'])
const OUR_RE = /\b(?:our|ours|we|we're|we've|us)\b/i

/** v2 rule 1: is an unsupported claim G-SOFT (low-risk general knowledge or
 *  advice) rather than I-HARD? Only a claim with NO personal, product,
 *  people/result, number, scarcity or high-risk content; another product named
 *  is a scope question and stays hard. */
export function isSoftGeneral(text: string, ruleTypes: readonly ClaimType[], judgeTypes: readonly ClaimType[], subject: string | null, targetId: string | null, products: readonly ProductName[]): boolean {
  const all = [...ruleTypes, ...judgeTypes]
  if (all.some((x) => ALWAYS_HARD.has(x))) return false
  // "it"/"this"/"they" is the product: a product claim stays hard.
  if (RISK_RE.test(text) || FIRST_PERSON_RE.test(text) || OUR_RE.test(text) || PRODUCT_PRONOUN_RE.test(text)) return false
  // A quantified or comparative/scientific statement is a checkable fact, never soft.
  if (QUANTIFIER_RE.test(text) || COMPARATIVE_RE.test(text)) return false
  if (SECOND_PERSON_PROMISE_RE.test(text)) return false
  if (subject !== targetId || mentionsAnyProduct(text, products)) return false
  const lower = text.toLowerCase()
  if (products.some((p) => p.name.trim() && lower.includes(p.name.trim().toLowerCase()))) return false
  return true
}

/** v2 rule 2: a fragment inherits its script line's verdict when it restates
 *  that line (INHERIT_MIN of its words) and adds no claim of its own: no hard
 *  claim type and no number the line lacks. A rule-hard fragment never inherits. */
export function inheritsFrom(frag: GateSentence, fragRead: RuleRead, parent: GateSentence, parentRead: RuleRead): boolean {
  if (frag.surface === 'script' || parent.surface !== 'script' || frag.parent !== parent.i || fragRead.hard) return false
  if (coverage(contentWords(frag.text), contentWords(parent.text)) < INHERIT_MIN) return false
  const pTypes = new Set(parentRead.claim_types)
  if (fragRead.claim_types.some((x) => HARD_TYPES.has(x) && x !== 'number' && !pTypes.has(x))) return false
  const pNums = parseNumbers(parent.text).map((n) => n.value)
  return parseNumbers(frag.text).every((n) => pNums.includes(n.value))
}

const STORY_TYPES = new Set<ClaimType>(['event', 'feeling', 'quote'])
/** v4: only the RISK direction is inherited — a parent's I, G or E, never its S
 *  or N (a fragment of an S line is judged alone, with the line shown). A
 *  fragment that is no claim on its own (a rule N) keeps that N unless its
 *  line is an invented story ("over one winter" carries the story). */
export function inheritable(pc: Pick<ClassifiedSentence, 'class' | 'claim_types' | 'reason'>, fragRead: RuleRead): boolean {
  if (pc.class !== 'I' && pc.class !== 'G' && pc.class !== 'E') return false
  if (!fragRead.soft) return true
  if (pc.class === 'E') return false
  return pc.reason === 'event_unbacked' || pc.reason === 'invented_quote' || pc.claim_types.some((x) => STORY_TYPES.has(x))
}

/** Parent I reasons whose trigger must be IN the fragment for the fragment to
 *  inherit them (a fragment with no number cannot carry an unmatched number). */
function carriesTrigger(reason: GateReason, fragText: string, fragRead: RuleRead): boolean {
  if (reason === 'number_unmatched' || reason === 'list_count_undelivered') return parseNumbers(fragText).length > 0 || listCounts(fragText).length > 0
  if (reason === 'scarcity_not_live') return fragRead.claim_types.includes('scarcity')
  return true
}

/** Rules + judge → S/E/I/G/N per sentence, with ids and a reason (design A4; v2). */
export function classifySentences(input: ClassifyInput): ClassifiedSentence[] {
  const products = input.products ?? []
  const target = input.targetProductId ?? null
  const byId = new Map(input.ledger.map((it) => [it.id, it] as const))
  const ctxOf = ruleContexts(input.sentences)
  const done = new Map<number, ClassifiedSentence>()
  const reads = new Map<number, RuleRead>()
  const readOf = (s: GateSentence) => { let r = reads.get(s.i); if (!r) { r = ruleRead(s, input.ledger, products, target, ctxOf(s)); reads.set(s.i, r) } return r }
  // Script sentences first (they come first in extractSentences order anyway).
  const inherits = inheritingFragments(input.sentences, products)
  const order = [...input.sentences].sort((a, b) => (a.surface === 'script' ? 0 : 1) - (b.surface === 'script' ? 0 : 1) || a.i - b.i)
  for (const s of order) done.set(s.i, classifyOne(s))
  return input.sentences.map((s) => done.get(s.i)!)

  function classifyOne(s: GateSentence): ClassifiedSentence {
    if (isPlaceholder(s.text)) return { i: s.i, surface: s.surface, at: s.at, k: s.k, class: 'N' as const, claim_types: [], item_ids: [], reason: 'no_claim' as const, near: [], judged: false }
    // v3 rule 1: SCRIPT LINES ARE THE JUDGED UNIT. A fragment that adds no
    // claim takes its parent line's verdict (every class, both directions);
    // with no parent line it carries no claim of its own.
    if (inherits.has(s.i)) {
      const pi = inherits.get(s.i)
      const pc = pi === null || pi === undefined ? undefined : done.get(pi)
      if (!pc) return { i: s.i, surface: s.surface, at: s.at, k: s.k, class: 'N' as const, claim_types: [], item_ids: [], reason: 'no_claim' as const, near: [], judged: false }
      return { i: s.i, surface: s.surface, at: s.at, k: s.k, class: pc.class, claim_types: [...pc.claim_types], item_ids: pc.item_ids, reason: pc.reason === 'judge_missing' ? 'judge_missing' : 'inherited', near: pc.near, judged: false }
    }
    const r = readOf(s)
    const base = { i: s.i, surface: s.surface, at: s.at, k: s.k, near: r.near }
    const v = input.judge?.get(s.i) ?? null
    const types = [...new Set([...r.claim_types, ...(v?.claim_types ?? [])])]
    const out = (cls: GateClass, reason: GateReason, ids: string[] = []): ClassifiedSentence =>
      ({ ...base, class: cls, claim_types: types, item_ids: ids, reason, judged: !!v })
    // An unsupported claim: I-HARD, or G-SOFT when it is low-risk general knowledge (v2 rule 1).
    const unsupported = (reason: GateReason): ClassifiedSentence =>
      reason === 'no_item' && isSoftGeneral(s.text, r.claim_types, v?.claim_types ?? [], r.subject_product, target, products)
        ? out('G', 'general_unsourced') : out('I', reason)
    if (r.hard) return out('I', r.hard.reason)
    const parent = s.parent !== undefined ? input.sentences.find((x) => x.i === s.parent) : undefined
    const pc = parent ? done.get(parent.i) : undefined
    if (parent && pc && inheritsFrom(s, r, parent, readOf(parent)) && inheritable(pc, r) && (pc.class !== 'I' || carriesTrigger(pc.reason, s.text, r))) {
      // An undecided parent (no judge verdict) leaves its fragment undecided too.
      return { ...base, class: pc.class, claim_types: [...new Set([...types, ...pc.claim_types])], item_ids: pc.item_ids, reason: pc.reason === 'judge_missing' ? 'judge_missing' : 'inherited', judged: false }
    }
    if (r.soft && (!v || v.cls !== 'I' || !v.claim_types.some((x) => HARD_TYPES.has(x)))) return out('N', r.soft.reason)
    if (!v) {
      if (!input.judge) {
        // No judge (measure-only): the overlap pre-filter is the only evidence.
        return r.near.length ? out('S', 'entailed', base.near.slice(0, 2)) : unsupported('no_item')
      }
      return out('I', 'judge_missing')
    }
    if (v.cls === 'N') {
      if (types.some((x) => HARD_TYPES.has(x) && x !== 'presupposition') || types.includes('presupposition')) return unsupported('no_item')
      if (types.includes('opinion') && !v.item_ids.length) return out('E', 'opinion_unbacked')
      return out('N', 'no_claim')
    }
    if (v.cls === 'I') return types.includes('cross_product') ? out('I', 'cross_product') : unsupported('no_item')
    // S or E: the cited items must exist, be in scope, and meet the class's evidence rule.
    const cited = v.item_ids.map((id) => byId.get(id)).filter((x): x is LedgerItem => !!x)
    const scoped = cited.filter((it) => inScope(it, r.subject_product))
    if (!scoped.length) return cited.length ? out('I', 'cross_product') : unsupported('no_item')
    if (types.includes('scarcity') && !scoped.some((it) => it.origin === 'urgency' && it.live)) return out('I', 'scarcity_not_live')
    if (types.some((x) => x === 'audience' || x === 'customer' || x === 'result' || x === 'event' || x === 'quote' || x === 'feeling' || x === 'habit')
      && !scoped.some(isHerOwn)) return out('I', 'gated_no_first_party')
    const ids = scoped.map((it) => it.id)
    if (v.cls === 'E') return out('E', types.includes('hyperbole') ? 'hyperbole' : 'stronger_than_item', ids)
    if (types.includes('hyperbole')) return out('E', 'hyperbole', ids)
    return out('S', 'entailed', ids)
  }
}

/** `G` is new in v2; records written before it have no G (read it as 0). */
export interface ClassCounts { S: number; E: number; I: number; N: number; G?: number }
export function countClasses(cs: readonly ClassifiedSentence[]): ClassCounts {
  const c: ClassCounts = { S: 0, E: 0, I: 0, N: 0, G: 0 }
  for (const s of cs) c[s.class] = (c[s.class] ?? 0) + 1
  return c
}

/** E budget (design A5): ≈ one E per 150 spoken words; the excess is repaired like an I. */
export function eBudget(spokenWords: number): number {
  return Math.max(1, Math.round(spokenWords / E_BUDGET_WORDS))
}
export function overBudgetE(cs: readonly ClassifiedSentence[], spokenWords: number): number[] {
  // A review line (one judge said I) is never repaired: it ships for the creator to check.
  const es = cs.filter((s) => s.class === 'E' && s.verdict !== 'review')
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
  if (t.includes('event') || t.includes('feeling') || t.includes('habit')) return 'story'
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
  /** Slots (`writes_to`) she already answered with a skip: never asked again. */
  declined?: ReadonlySet<string>
}

/** The skip the app sends for a question she declines (mirror of the edge's `isNonAnswer`). */
export const SKIP_ANSWER = 'Nothing specific, keep it general'

/** "Nothing specific", "keep it general", "idk", "skip": answered, but nothing to say.
 *  Mirror of `isNonAnswer` in supabase/functions/generate-blueprint/index.ts. */
export function isNonAnswerText(v: unknown): boolean {
  const t = String(v ?? '').trim().toLowerCase().replace(/[.!\s]+$/, '')
  if (!t) return true
  if (t.split(/\s+/).length > 12) return false
  return /^(nothing( specific| really| much)?|none|no|n\/a|na|idk|i don'?t know|not sure|skip|keep it general|nothing specific,? keep it general|no idea|not really)\b/.test(t)
    || /\bkeep it general\b/.test(t)
}

/** Slots she skipped, read from her answers in the ledger (`answer:<writes_to>`). */
export function declinedSlots(ledger: readonly LedgerItem[]): Set<string> {
  const out = new Set<string>()
  for (const it of ledger) if (it.origin === 'her_answer' && it.id.startsWith('answer:') && it.field && isNonAnswerText(it.text)) out.add(it.field)
  return out
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
    // ⚖️ SKIP ALWAYS WORKS: a slot she declined is never asked again. Its
    // sentence is dropped, or (at the beat floor) becomes the general version.
    const slotKey = `script.beat.${sent?.at ?? 0}:${kind}`
    const skipped = p.declined?.has(slotKey) ?? false
    const ask = (): RepairStep => {
      asks++
      return { i: s.i, action: 'ask', item_ids: [], question: { scope: 'script', kind, text: ASK_TEXT[kind], writes_to: `script.beat.${sent?.at ?? 0}:${kind}` } }
    }
    if (fillsSlot && !skipped && asks < MAX_ASKS) { steps.push(ask()); continue }
    const dropped = (dropsPerBeat.get(s.at) ?? 0) + 1
    const emptiesBeat = dropped >= (sentencesPerBeat.get(s.at) ?? 1)
    if (!emptiesBeat || beats - 1 >= SPOKEN_FLOOR) {
      dropsPerBeat.set(s.at, dropped)
      if (emptiesBeat) beats--
      steps.push({ i: s.i, action: 'drop', item_ids: [] })
      continue
    }
    if (!skipped && asks < MAX_ASKS) { steps.push(ask()); continue }
    steps.push({ i: s.i, action: 'fallback', item_ids: [], question: { scope: 'script', kind, text: ASK_TEXT[kind], writes_to: `script.beat.${sent?.at ?? 0}:${kind}` } })
  }
  return steps
}

/** The constrained rewrite prompt for `replace`: only the listed items may be used. */
/** The rewrite call's response shape (the edge's REPAIR_SCHEMA, same fields). */
export const REWRITE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    rewrites: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { index: { type: 'STRING' }, line: { type: 'STRING' } }, required: ['index', 'line'] },
    },
  },
  required: ['rewrites'],
} as const
/** The worker re-check's budget (owner rule 13 Oct): no edge wall clock to fit inside. */
export const INVENTION_RECHECK_TIMEOUT_MS = 120_000
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

/** 'timeout' = the gate ran out of time and fell back to measure-only for this request.
 *  'unchecked' = the shipped record when the gate timed out or failed: the script
 *  went out as written and a durable re-check (worker `invention_recheck`) owns it. */
export type GateOutcome = 'final' | 'needs_answers' | 'general' | 'measure_only' | 'timeout' | 'unchecked'

export interface GateRecordSentence {
  i: number; surface: Surface; class: GateClass; claim_types: ClaimType[]; item_ids: string[]; reason: GateReason
  /** Two-judge fields (absent on records written before them). */
  fast_class?: GateClass; strong_class?: GateClass; verdict?: GateVerdict
}

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
  /** Only on outcome 'unchecked': why the gate did not finish. */
  reason?: UncheckedReason
  /** Timing of this run: total ms, per-judge-call ms, judge calls, escalations. */
  perf?: GatePerf
  /** Lines of the SHIPPED blueprint (its sentence indices) the creator should
   *  check: one judge said I-HARD, or a judge said G-SOFT. Never hidden. */
  review_lines?: Array<{ i: number; surface: Surface }>
  /** Verdict counts on the first classification (before repair). */
  verdicts?: { review: number; block: number }
}

// ── CHECK STATUS (owner rule 13 Oct: a timeout never ships an unchecked script silently) ──

/** What the saved blueprint says about the gate, in one field the UI and the re-check read. */
export type CheckStatus = 'checked' | 'needs_answers' | 'general' | 'unchecked'
/** 'queued' = the edge saved the script and handed the gate to the durable worker step. */
export type UncheckedReason = 'timeout' | 'error' | 'queued'

/** Map a gate record to the blueprint's check status. Only the outcome counts:
 *  G-SOFT sentences never block (decideOutcome ignores them). A timeout, or a
 *  measure-only record from a full run (the judge or rewrite threw), means the
 *  script was NOT checked; the reason says which. */
export function checkStatusFor(record: Pick<InventionGateRecord, 'outcome' | 'timed_out'> | null | undefined): { status: CheckStatus; reason: UncheckedReason | null } {
  if (!record) return { status: 'unchecked', reason: 'error' }
  switch (record.outcome) {
    case 'final': return { status: 'checked', reason: null }
    case 'needs_answers': return { status: 'needs_answers', reason: null }
    case 'general': return { status: 'general', reason: null }
    case 'timeout': return { status: 'unchecked', reason: 'timeout' }
    case 'unchecked': return { status: 'unchecked', reason: record.timed_out ? 'timeout' : 'error' }
    default: return { status: 'unchecked', reason: record.timed_out ? 'timeout' : 'error' }
  }
}

/** The record stored when the gate did not finish: outcome 'unchecked' plus the
 *  reason, keeping whatever the first classification measured. */
export function uncheckedRecord(prev: InventionGateRecord | null | undefined, reason: UncheckedReason, ms: number, model: string | null = null): InventionGateRecord {
  const empty: ClassCounts = { S: 0, E: 0, I: 0, N: 0, G: 0 }
  return {
    version: INVENTION_GATE_VERSION,
    model: prev?.model ?? model,
    sentences: prev?.sentences ?? [],
    before: prev?.before ?? { ...empty },
    after: prev?.after ?? prev?.before ?? { ...empty },
    repaired: prev?.repaired ?? { replaced: 0, asked: 0, dropped: 0 },
    rounds: prev?.rounds ?? 0,
    outcome: 'unchecked',
    e_flags: prev?.e_flags ?? [],
    ms,
    timed_out: reason === 'timeout',
    ...(prev?.judge_malformed !== undefined ? { judge_malformed: prev.judge_malformed } : {}),
    ...(prev?.error ? { error: prev.error } : {}),
    ...(prev?.perf ? { perf: prev.perf } : {}),
    reason,
  }
}

/** Fields a gate run may rewrite on the blueprint (the shot list is re-synced after). */
export const GATE_REWRITTEN_KEYS = ['script', 'hook_options', 'captions', 'packaging', 'publish_plan'] as const

export function recordSentences(cs: readonly ClassifiedSentence[]): GateRecordSentence[] {
  return cs.map((s) => ({ i: s.i, surface: s.surface, class: s.class, claim_types: s.claim_types, item_ids: s.item_ids, reason: s.reason,
    ...(s.verdict ? { fast_class: s.fast_class, strong_class: s.strong_class, verdict: s.verdict } : {}) }))
}

export function verdictCounts(cs: readonly ClassifiedSentence[]): { review: number; block: number } {
  return { review: cs.filter((s) => s.verdict === 'review').length, block: cs.filter((s) => s.verdict === 'block').length }
}
export function reviewLines(cs: readonly ClassifiedSentence[]): Array<{ i: number; surface: Surface }> {
  return cs.filter((s) => s.verdict === 'review').map((s) => ({ i: s.i, surface: s.surface }))
}

/** Outcome after the last round: an unrepaired I never ships as final. A G
 *  (unsourced low-risk general claim) is flagged for sourcing and never blocks. */
export function decideOutcome(after: readonly ClassifiedSentence[], asked: number, fallback: number): GateOutcome {
  if (fallback > 0) return 'general'
  if (after.some((s) => s.class === 'I')) return asked > 0 ? 'needs_answers' : 'general'
  return asked > 0 ? 'needs_answers' : 'final'
}

/** Owner amendment g: the batch lines, from records alone. */
export function summarizeGateRecords(records: ReadonlyArray<InventionGateRecord | null | undefined>) {
  const rs = records.filter((r): r is InventionGateRecord => !!r && typeof r === 'object' && !!r.before)
  const factual = (c: ClassCounts) => c.S + c.E + c.I + (c.G ?? 0)
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
  /** The fast judge (task class `read`), one call per chunk. Returns the model's raw text. */
  judge: (prompt: string) => Promise<string>
  /** The stronger judge (task class `extract`): judges every sentence too, in parallel. */
  judgeStrong?: (prompt: string) => Promise<string>
  /** Step events ('judging' with chunk counts, 'repairing'). */
  onProgress?: (p: GateProgress) => void
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
  chunkSize?: number
  concurrency?: number
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


/** Classes for a repaired blueprint WITHOUT a new judge call: no new text was
 *  written (only drops, asks and placeholders), so each surviving sentence
 *  keeps the class it already had; a placeholder carries no claim (N). */
export function carryClasses(prev: { sentences: readonly GateSentence[]; classified: readonly ClassifiedSentence[] }, next: readonly GateSentence[]): ClassifiedSentence[] {
  const pool = prev.classified.map((c) => ({ c, text: prev.sentences[c.i]?.text ?? '', used: false }))
  return next.map((s) => {
    if (isPlaceholder(s.text)) {
      return { i: s.i, surface: s.surface, at: s.at, k: s.k, class: 'N' as const, claim_types: [], item_ids: [], reason: 'no_claim' as const, near: [], judged: false, fast_class: 'N' as const, strong_class: 'N' as const, verdict: 'pass' as const }
    }
    const hit = pool.find((p) => !p.used && p.c.surface === s.surface && p.text === s.text)
    if (hit) { hit.used = true; return { ...hit.c, i: s.i, at: s.at, k: s.k } }
    return { i: s.i, surface: s.surface, at: s.at, k: s.k, class: 'I' as const, claim_types: [], item_ids: [], reason: 'judge_missing' as const, near: [], judged: false, fast_class: 'I' as const, strong_class: 'I' as const, verdict: 'block' as const }
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
  const perf = emptyPerf()
  const cache = new Map<string, JudgeVerdict>()
  const cacheStrong = new Map<string, JudgeVerdict>()
  const progress = (step: GateStep, d = 0, t = 0) => { try { deps.onProgress?.(gateProgress(step, d, t, now())) } catch { /* progress never fails a gate */ } }
  type State = { sentences: GateSentence[]; classified: ClassifiedSentence[] }
  const classify = async (bp: GateBlueprint): Promise<State> => {
    const sentences = extractSentences(bp)
    let fastV: Map<number, JudgeVerdict> | null = null
    let strongV: Map<number, JudgeVerdict> | null = null
    if (sentences.length) {
      progress('judging')
      const j = await judgeSentences({ sentences, ledger: input.ledger, products, targetProductId: target, cache, cacheStrong,
        ...(input.chunkSize ? { chunkSize: input.chunkSize } : {}), ...(input.concurrency ? { concurrency: input.concurrency } : {}) }, {
        judge: deps.judge,
        ...(deps.judgeStrong ? { judgeStrong: deps.judgeStrong } : {}),
        onChunk: (d, t) => progress('judging', d, t),
        now, wrap: race,
      })
      malformed += j.malformed
      perf.chunk_ms.push(...j.perf.chunk_ms)
      perf.judge_calls += j.perf.judge_calls
      perf.escalations += j.perf.escalations
      if (j.perf.strong_calls) perf.strong_calls = (perf.strong_calls ?? 0) + j.perf.strong_calls
      if (j.perf.strong_failed) perf.strong_failed = (perf.strong_failed ?? 0) + j.perf.strong_failed
      if (j.perf.unjudged) perf.unjudged = (perf.unjudged ?? 0) + j.perf.unjudged
      if (j.perf.fast_failed) perf.fast_failed = (perf.fast_failed ?? 0) + j.perf.fast_failed
      if (j.perf.errors?.length) perf.errors = [...(perf.errors ?? []), ...j.perf.errors]
      perf.prefiltered += j.perf.prefiltered
      perf.judged += j.perf.judged
      fastV = j.fast
      strongV = j.strong
    }
    return { sentences, classified: classifyTwoJudges({ sentences, ledger: input.ledger, products, targetProductId: target, fast: fastV, strong: strongV }) }
  }
  const empty: ClassCounts = { S: 0, E: 0, I: 0, N: 0, G: 0 }
  const base = (): InventionGateRecord => ({
    version: INVENTION_GATE_VERSION, model: input.model ?? null, sentences: [], before: { ...empty }, after: { ...empty },
    repaired: { replaced: 0, asked: 0, dropped: 0 }, rounds: 0, outcome: 'measure_only', e_flags: [], ms: 0, timed_out: false,
  })
  let first: State | null = null
  try {
    first = await classify(input.blueprint)
    const before = countClasses(first.classified)
    if (input.measureOnly) {
      // Measure only: verdicts recorded, nothing repaired, review lines as classified.
      return { blueprint: input.blueprint, questions: [], record: { ...base(), sentences: recordSentences(first.classified), before, after: before, ms: now() - t0, judge_malformed: malformed, perf: { ...perf, ms_total: now() - t0 },
        verdicts: verdictCounts(first.classified), review_lines: reviewLines(first.classified) } }
    }
    let bp = input.blueprint
    let cur: State = first
    let rounds = 0
    const repaired = { replaced: 0, asked: 0, dropped: 0 }
    let fallback = 0
    const questions: GateQuestion[] = []
    const declined = declinedSlots(input.ledger)
    // ⚠️ A PLACEHOLDER ALREADY IN THE SCRIPT IS AN OPEN QUESTION (a template
    // slot asked before the writer ran, quality sprint stage 2). It counts
    // toward the 3-question cap and the script is never 'final' while it stands.
    const preAsked = first.sentences.filter((s) => s.surface === 'script' && isPlaceholder(s.text)).length
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
      const steps = planRepairs({ classified: cur.classified, sentences: cur.sentences, overBudget: over, spokenBeats: spokenBeats(bp), asksSoFar: questions.length + preAsked, declined })
      const replaceSteps = steps.filter((s) => s.action === 'replace')
      if (!replaceSteps.length) {
        // Nothing new written: no re-judge needed.
        const prev = cur
        apply(steps)
        const sentences = extractSentences(bp)
        cur = { sentences, classified: carryClasses(prev, sentences) }
        continue
      }
      progress('repairing')
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
      const steps = planRepairs({ classified: cur.classified, sentences: cur.sentences, overBudget: overLast, spokenBeats: spokenBeats(bp), finalRound: true, asksSoFar: questions.length + preAsked, declined })
      apply(steps)
      const sentences = extractSentences(bp)
      cur = { sentences, classified: carryClasses(prev, sentences) }
    }
    const ebudget = eBudget(spokenWords(bp))
    const record: InventionGateRecord = {
      ...base(),
      sentences: recordSentences(first.classified),
      before, after: countClasses(cur.classified), repaired, rounds,
      outcome: decideOutcome(cur.classified, repaired.asked + preAsked, fallback),
      e_flags: cur.classified.filter((s) => s.class === 'E').slice(0, ebudget).map((s) => ({ i: s.i, surface: s.surface, item_ids: s.item_ids })),
      ms: now() - t0,
      judge_malformed: malformed,
      perf: { ...perf, ms_total: now() - t0 },
      verdicts: verdictCounts(first.classified),
      review_lines: reviewLines(cur.classified),
    }
    // A declined slot that fell back to the general version is not offered again.
    return { blueprint: bp, record, questions: questions.filter((q) => !declined.has(q.writes_to)) }
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
        ms: now() - t0, timed_out: timedOut, judge_malformed: malformed, perf: mergeFailedPerf(perf, (e as { perf?: GatePerf } | null)?.perf, now() - t0),
        ...(first ? { verdicts: verdictCounts(first.classified) } : {}),
        ...(timedOut ? {} : { error: errorClass(e) }),
      },
    }
  }
}
