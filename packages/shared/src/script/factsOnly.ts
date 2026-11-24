// FACTS-ONLY WRITER (panel 13c → panel 14; FACTS_ONLY_WRITER, default OFF,
// turned on nowhere until the owner says so). Pure; no I/O.
//
// ⚠️ WHY. Panel 13c trace (#1361): 9 of the 12 invented lines were already in
// the writer's FIRST DRAFT, and the writer was handed only 0–4 of the 7–11
// items her account stores. So, with the flag on:
//   1. the writer is handed ALL of her material (no caps; only rows she
//      excluded, or sensitive rows, stay out);
//   2. every line names the ledger ids it used, and a line that rests on
//      nothing she gave is dropped (hook, CTA and plain connecting sentences
//      excepted); a number, effect or scene added beyond its source is cut;
//      unearned first person is cut; there is no word budget;
//   3. when too little of her material fits the request, nothing is written:
//      the existing NEEDS_STORY stop asks up to 3 specific questions, never one
//      she already answered (by key or by meaning), and her answers are saved
//      under the question key so later scripts reuse them.
//
// ⚖️ ONE LEDGER, ONE TRACER. The items are the invention gate's ledger
// (`buildLedger`, ids included); the per-sentence match is `traceLines`; the
// meaning check is the question engine's `overlap`. Nothing here is a second
// copy of any of them.
import { normalizeNumbers, type LedgerItem } from './inventionGate.js'
import { traceLines, type LineSourceInput } from './lineSources.js'
import { overlap } from './meaningOverlap.js'

export const FACTS_ONLY_MAX_QUESTIONS = 3
/** Fewer relevant items than this, and the request is too thin to write honestly. */
export const FACTS_ONLY_MIN_ITEMS = 2

/** The switch: exactly 'on', and only for test/panel accounts (trialOn). Default off. */
export function factsOnlyWriterOn(flag: unknown, trialOn: boolean): boolean {
  return trialOn === true && String(flag ?? '').trim() === 'on'
}

/**
 * With the flag on, a stored row is handed to the writer unless she excluded
 * it or it is sensitive. Purpose and relevance filters do not apply.
 */
export function factsOnlyKeepsRow(row: { id?: unknown; sensitive?: unknown; creator_excluded_at?: unknown }, excludedIds: ReadonlySet<string> = new Set()): boolean {
  return row?.sensitive !== true && !row?.creator_excluded_at && !excludedIds.has(String(row?.id ?? ''))
}

// ── 1. FOUR LAYERS (owner, 12 Nov) ─────────────────────────────────────────
// THE RULE: only the FACTS layer can supply what happened. Storytelling shapes
// wording and order; background guides angle and framing; neither can be
// cited for an event, a number, a result or a consequence. A thin facts layer
// means stop and ask (the GAP layer), never borrow from another layer.
export type Layer = 'fact' | 'style' | 'background'
/** Ledger origins in the facts layer. */
const FACT_ORIGINS = new Set(['her_story', 'her_fact', 'her_answer', 'product_fact', 'offer', 'urgency'])
/** Saved profile and niche answers: background notes about her, never spoken. */
export const PROFILE_FIELDS = /^(?:audience|niche|profile|about|who|bio|identity|summary|sub_niche)$/i
/** Ledger kinds that are her stated opinions: background, citable only as `opinion`. */
const OPINION_FIELDS = new Set(['opinion', 'belief', 'stance', 'take'])
export interface WriterItem { ref: string; id: string; origin: string; text: string; layer: Layer; opinion?: boolean; productId?: string | null; field?: string | null; profile?: boolean }

/** Her facts layer (refs F1…) plus her stated opinions (background refs B…, opinion only). */
export function writerItems(ledger: readonly LedgerItem[]): WriterItem[] {
  const seen = new Set<string>()
  const out: WriterItem[] = []
  let f = 0
  let b = 0
  for (const it of ledger) {
    const text = String(it?.text ?? '').replace(/\s+/g, ' ').trim()
    // Unconfirmed product facts (first_party false) are not hers to say yet.
    if (!text || seen.has(it.id) || (it.first_party === false && it.origin !== 'outside_research' && it.origin !== 'outside_moment' && it.origin !== 'niche_note' && it.origin !== 'audience_question')) continue
    seen.add(it.id)
    const opinion = it.origin === 'her_fact' && OPINION_FIELDS.has(String(it.field ?? '').toLowerCase())
    const pid = it.product_id ? { productId: String(it.product_id), ...(it.field ? { field: String(it.field) } : {}) } : it.field ? { field: String(it.field) } : {}
    // compare-1 follow-up (owner, 22 Nov): a saved profile or niche answer is a
    // background note about her, never a script line.
    if ((it.origin === 'her_answer' || it.origin === 'her_fact') && PROFILE_FIELDS.test(String(it.field ?? ''))) {
      out.push({ ref: `B${++b}`, id: it.id, origin: String(it.origin), text, layer: 'background', profile: true, ...pid })
      continue
    }
    if (FACT_ORIGINS.has(String(it.origin)) && !opinion) out.push({ ref: `F${++f}`, id: it.id, origin: String(it.origin), text, layer: 'fact', ...pid })
    else out.push({ ref: `B${++b}`, id: it.id, origin: String(it.origin), text, layer: 'background', ...(opinion ? { opinion: true } : {}), ...pid })
  }
  return out
}

/** Storytelling layer items (refs T1…): her lines, style note, connecting and power words. Never a source. */
export function styleItems(lines: readonly string[]): WriterItem[] {
  return lines.map((t) => String(t ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)
    .map((text, i) => ({ ref: `T${i + 1}`, id: `style:${i}`, origin: 'style', text, layer: 'style' as const }))
}

/** Background items that are not opinions (refs continue after the ledger's B refs): scan, niche, audience, Reddit themes. */
export function backgroundItems(texts: readonly string[], startAt = 1): WriterItem[] {
  return texts.map((t) => String(t ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)
    .map((text, i) => ({ ref: `B${startAt + i}`, id: `bg:${i}`, origin: 'background', text, layer: 'background' as const }))
}

export const LINE_TAGS = ['fact', 'style', 'opinion', 'link'] as const
export type LineTag = typeof LINE_TAGS[number]

/** The four labelled blocks placed in the writer brief. */
export function renderFactsOnlyBlock(items: readonly WriterItem[], style: readonly WriterItem[] = [], background: readonly WriterItem[] = []): string {
  const facts = items.filter((it) => it.layer === 'fact')
  const bg = [...items.filter((it) => it.layer === 'background'), ...background]
  const list = (xs: readonly WriterItem[]) => xs.map((it) => `[${it.ref}]${it.opinion ? ' (her stated opinion)' : ''} ${it.text}`).join('\n') || '(none)'
  return [
    'FOUR LAYERS. Only LAYER 1 can supply what happened. Layers 2 and 3 shape HOW it is told; they never supply an event, a number, a result or a consequence, and never fill a gap in a story.',
    `<<<LAYER 1: FACTS (the only source of events, numbers, results, product claims and consequences)\n${list(facts)}\n>>>`,
    `<<<LAYER 2: STORYTELLING (her rhythm, openings, connecting words, phrases, how she lands a line; wording and order only, never cite)\n${list(style)}\n>>>`,
    `<<<LAYER 3: BACKGROUND (who she is and what her audience says; angle and framing only. An audience problem is something THEY say, never something that happened to her. A line marked "her stated opinion" may be said as her opinion, citing its ref)\n${list(bg)}\n>>>`,
    'For EVERY script beat return `layer_tag` and `source_ids`:',
    '- "fact": states something from layer 1; source_ids = the F refs it uses.',
    '- "opinion": her stated opinion; source_ids = its B ref.',
    '- "link": ties to another of her real stored stories that genuinely fits; source_ids = that story\'s F ref.',
    '- "style": wording only (hook, transition, call to action) with no new claim; source_ids = [].',
    'Quote her facts faithfully. Never add an effect, a scene, a number, a consequence or a detail that is not in the F item you cite.',
    'There is no word count. Write as much as layer 1 supports and stop. Do not pad.',
  ].join('\n')
}

/** The writer's refs (or ledger ids) for one beat → ledger ids. Unknown refs are ignored. */
export function resolveSourceIds(raw: unknown, items: readonly WriterItem[]): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\s]+/) : []
  const out: string[] = []
  for (const r of list) {
    const k = String(r ?? '').trim().replace(/^\[|\]$/g, '')
    const hit = items.find((it) => it.ref.toLowerCase() === k.toLowerCase() || it.id === k)
    if (hit && !out.includes(hit.id)) out.push(hit.id)
  }
  return out
}

// ── 2. ENOUGH MATERIAL? STOP AND ASK ───────────────────────────────────────
export type NeedKind = 'story' | 'number' | 'proof' | 'product_fact' | 'steps' | 'opinion'
export interface FoQuestion { key: string; kind: NeedKind; question: string }
export interface FoRequest { note: string; goal?: string | null; product?: { id: string; name: string } | null }
export type FoDecision =
  | { action: 'write'; relevant: string[]; questions: [] }
  | { action: 'ask'; relevant: string[]; questions: FoQuestion[]; reason: 'too_little_material' | 'missing_need' }
  | { action: 'stop'; relevant: string[]; questions: []; reason: 'too_little_material_all_asked' }

const slug = (t: string) => [...new Set(String(t ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4))].sort().slice(0, 5).join('-') || 'general'
const STORY_ORIGINS = new Set(['her_story', 'her_answer'])
const quote = (t: string) => `"${t.replace(/\s+/g, ' ').trim().slice(0, 80)}"`

/** What this request needs before an honest script exists, each worded for THIS request. */
export function needsFor(req: FoRequest): FoQuestion[] {
  const note = String(req.note ?? '').trim()
  const t = slug(note)
  const out: FoQuestion[] = []
  const p = req.product
  const topic = quote(note || p?.name || 'this video')
  if (/\b(?:story|the day|the time|when i|how i (?:started|got|made|built)|went wrong|mistake|first time|nearly|almost|confession|before and after)\b/i.test(note)) {
    out.push({ key: `mn:fo:story:${t}`, kind: 'story', question: `For ${topic}: what actually happened? One real moment in your own words: when it was, what went on, and what you did.` })
  }
  if (/\b(?:how many|how much|how long|numbers?|stats?|results?|percent|%|\d)\b/i.test(note)) {
    out.push({ key: `mn:fo:number:${t}`, kind: 'number', question: `For ${topic}: what is the exact number you can stand behind, and where does it come from?` })
  }
  if (/\b(?:proof|prove|works?|worth it|results?|review|before and after|does it)\b/i.test(note)) {
    out.push({ key: `mn:fo:proof:${t}`, kind: 'proof', question: `For ${topic}: what result have you or a customer actually seen? Say what happened, not what usually happens.` })
  }
  if (/\b(?:how to|steps?|routine|guide|tell if|know if|choose|fix)\b/i.test(note)) {
    out.push({ key: `mn:fo:steps:${t}`, kind: 'steps', question: `For ${topic}: what are the exact steps you follow, in order?` })
  }
  if (/\b(?:why|my take|myth|hot take|gets? wrong|should(?:n'?t)?)\b/i.test(note)) {
    out.push({ key: `mn:fo:opinion:${t}`, kind: 'opinion', question: `For ${topic}: what is your own view, and what made you think that?` })
  }
  if (p?.id) {
    out.push({ key: `mn:fo:product_fact:${p.id}`, kind: 'product_fact', question: `What is the one fact about ${p.name} this video should say: what it is, what it does, or what it costs?` })
  }
  if (!out.length) out.push({ key: `mn:fo:story:${t}`, kind: 'story', question: `What is the moment behind ${topic}? Say when it happened${p?.name ? ` with ${p.name}` : ''} and what you did.` })
  return out
}

/** Items that share meaning with this request (or belong to its product). */
export function relevantItems(req: FoRequest, items: readonly WriterItem[], ledger: readonly LedgerItem[] = []): WriterItem[] {
  const ask = `${req.note ?? ''} ${req.product?.name ?? ''}`
  const productOf = new Map(ledger.map((l) => [l.id, l.product_id]))
  // The request note is the ask itself, never material for it.
  return items.filter((it) => it.layer === 'fact' && it.id !== 'note' && ((req.product?.id && productOf.get(it.id) === req.product.id) || overlap(it.text, ask) > 0))
}

/** True when a need is covered by an item of the right kind that fits the request. */
function covered(n: FoQuestion, rel: readonly WriterItem[], all: readonly WriterItem[], opinions: readonly WriterItem[] = []): boolean {
  if (all.some((it) => it.layer === 'fact' && it.id === `answer:${n.key}`)) return true
  switch (n.kind) {
    case 'story': return rel.some((it) => STORY_ORIGINS.has(it.origin))
    case 'number': return rel.some((it) => /\d/.test(it.text))
    case 'proof': return rel.some((it) => STORY_ORIGINS.has(it.origin) || it.origin === 'her_fact')
    case 'product_fact': return rel.some((it) => it.origin === 'product_fact' || it.origin === 'offer')
    case 'steps': return rel.some((it) => /\b(?:first|then|step|next|after)\b/i.test(it.text) || it.origin === 'her_answer')
    case 'opinion': return opinions.length > 0 || rel.some((it) => it.origin === 'her_answer' || /\bi (?:think|believe)\b/i.test(it.text))
  }
}

/**
 * The keys that are closed for this creator: every key in question_asks she
 * answered, skipped or gave filler to, and every key one of her saved answers
 * is stored under (source_ref 'asked:<key>'). The saved row alone closes the
 * key: when an answer is saved at the start of a request and the build then
 * fails, the same request does not ask again.
 */
export function closedKeysFrom(asks: ReadonlyArray<{ slot_id?: unknown; outcome?: unknown }>, saved: ReadonlyArray<{ source_ref?: unknown }>): string[] {
  const keys = [
    ...asks.filter((r) => ['answered', 'skipped', 'filler'].includes(String(r.outcome ?? ''))).map((r) => String(r.slot_id ?? '')),
    ...saved.map((r) => String(r.source_ref ?? '')).filter((x) => x.startsWith('asked:')).map((x) => x.slice('asked:'.length)),
  ]
  return [...new Set(keys.filter(Boolean))]
}

/**
 * Write, or stop and ask. A question is never asked when its key is closed
 * (answered, skipped or filler in question_asks, or saved under that key) or
 * when one of her saved answers already says it (meaning overlap ≥ 0.6, the
 * question engine's rule). At most 3.
 */
export function decideFactsOnly(req: FoRequest, items: readonly WriterItem[], opts: { ledger?: readonly LedgerItem[]; closedKeys?: readonly string[]; savedAnswers?: readonly string[]; minItems?: number } = {}): FoDecision {
  const rel = relevantItems(req, items, opts.ledger ?? [])
  const relevant = rel.map((r) => r.id)
  const ask = `${req.note ?? ''} ${req.product?.name ?? ''}`
  const opinions = items.filter((it) => it.opinion && overlap(it.text, ask) > 0)
  const missing = needsFor(req).filter((n) => !covered(n, rel, items, opinions))
  // compare-1 (advisor): a creator with no stories on file (none stored, none
  // answered) gets no confident script: ask for one real story first, and stop
  // if every story question is already closed.
  const hasStory = items.some((it) => it.layer === 'fact' && it.id !== 'note' && STORY_ORIGINS.has(it.origin))
  if (!hasStory) {
    const closedNS = new Set(opts.closedKeys ?? [])
    const savedNS = opts.savedAnswers ?? []
    const general: FoQuestion = { key: `mn:fo:story:first:${slug(String(req.note ?? '') || req.product?.name || 'general')}`, kind: 'story', question: `What is the moment behind ${quote(String(req.note ?? '').trim() || req.product?.name || 'this video')}? Say when it happened${req.product?.name ? ` with ${req.product.name}` : ''} and what you did.` }
    const storyNeeds = needsFor(req).filter((n) => n.kind === 'story')
    const q = (storyNeeds.length ? storyNeeds : [general]).find((n) => !closedNS.has(n.key) && !savedNS.some((a) => overlap(a, n.question) >= 0.6))
    return q ? { action: 'ask', relevant, questions: [q], reason: 'too_little_material' } : { action: 'stop', relevant, questions: [], reason: 'too_little_material_all_asked' }
  }
  // Thin: nothing fits, or fewer than the minimum and none of them is one of her stories or answers.
  const thin = rel.length === 0 || (rel.length < (opts.minItems ?? FACTS_ONLY_MIN_ITEMS) && !rel.some((it) => STORY_ORIGINS.has(it.origin)))
  if (!missing.length && !thin) return { action: 'write', relevant, questions: [] }
  const closed = new Set(opts.closedKeys ?? [])
  const saved = opts.savedAnswers ?? []
  const pool = missing.length ? missing : needsFor(req)
  const questions: FoQuestion[] = []
  for (const n of pool) {
    if (questions.length >= FACTS_ONLY_MAX_QUESTIONS) break
    if (closed.has(n.key) || saved.some((a) => overlap(a, n.question) >= 0.6)) continue
    questions.push(n)
  }
  if (questions.length) return { action: 'ask', relevant, questions, reason: thin ? 'too_little_material' : 'missing_need' }
  // Everything worth asking was already asked. Thin → no script; otherwise write from what she gave.
  return thin ? { action: 'stop', relevant, questions: [], reason: 'too_little_material_all_asked' } : { action: 'write', relevant, questions: [] }
}

// ── 3. EVERY LINE TRACED ───────────────────────────────────────────────────
const FEELING = /\b(?:love[ds]?|hate[ds]?|felt|feel|scared|afraid|proud|terrified|nervous|excited|thrilled|angry|cried|happy|sad|worried|relieved|embarrass\w*)\b/i
/** A first-person event, habit or origin (the substance check's "personal history"). */
export const FIRST_PERSON_HISTORY = /\b(?:i|we)\s+(?:\w+\s+){0,2}(?:was|were|had|did|made|built|lost|found|tried|started|threw|sold|spent|learned|realised|realized|bought|opened|fixed|glazed|roasted|answered|got|went|used to|grew up|quit|moved|stood|watched|remember|noticed|decided|switched)\b|\b(?:i|we)\s+(?:just\s+|once\s+|finally\s+)?[a-z]{3,}ed\b|\bmy (?:first|last) \w+|\b(?:my|our)\s+(?:\w+\s+){0,2}(?:went|was|were|got|came|fell|broke|ran|sat|[a-z]{3,}ed)\b/i
/** Feeling and outcome words, by stem (compare-1: "terrifying" moved from one story onto another). */
const FEELING_WORDS = /\b(terrif\w*|scar(?:ed|y|iest)|afraid|panic\w*|nervous|anxious|devastat\w*|heartbr\w*|thrill\w*|excit\w*|proud|ashamed|embarrass\w*|humiliat\w*|overwhelm\w*|exhaust\w*|reliev\w*|relief|delight\w*|frustrat\w*|furious|angry|cried|crying|tears|nightmare|disaster\w*|heartbreak\w*|ruin\w*|magic\w*|life[- ]chang\w*|changed everything|hated|loved|worst|horrib\w*|awful)\b/gi
export const feelingsOf = (t: string): string[] => [...new Set((String(t ?? '').match(FEELING_WORDS) ?? []).map((w) => w.toLowerCase().replace(/[- ]/g, '').slice(0, 5)))]
const RESULT = /\b(?:so that|which means|that means|until|resulting|now|suddenly|never again|ever since|that(?:'s| is) why|because of (?:that|this))\b/i
const SENTENCES = /(?<=[.!?])\s+/

/** A sentence that states something: a number, a feeling, a personal event, a result. */
export function statesAFact(s: string): boolean {
  return /\d/.test(s) || FEELING.test(s) || FIRST_PERSON_HISTORY.test(s) || RESULT.test(s)
}

const STOP = new Set('a an the and or but so to of in on at for with from by is are was were be it its this that you your i my me we our they their how what why when who do does did not no have has had just about into over more most then than there here very really can will would could should one all out up off get got'.split(' '))
const contentWords = (t: string) => [...new Set(String(t ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)))]
const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w)
// Fix B (owner, 13 Nov): numbers written in words are compared as numbers
// ("eighty five dollars" = "$85"), with the invention gate's normalizeNumbers.
const numbersOf = (t: string) => (normalizeNumbers(t).match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'))
const wordsOf = (t: string) => contentWords(normalizeNumbers(t).replace(/\d+(?:[.,]\d+)?/g, ' '))

/**
 * Rule E (owner, 13 Nov): common connecting and framing words never count as
 * added detail. A FIXED list; her own storytelling-layer words are added per
 * script (`ignore`). Numbers are never ignored.
 */
export const FRAMING_WORDS: readonly string[] = [
  'here', 'thing', 'things', 'part', 'parts', 'point', 'whole', 'truth', 'honestly', 'basically', 'actually', 'literally', 'simply',
  'first', 'second', 'third', 'fourth', 'last', 'next', 'then', 'finally', 'also', 'still', 'even', 'every', 'everyone', 'everything',
  'option', 'options', 'step', 'steps', 'habit', 'habits', 'check', 'checks', 'reason', 'reasons', 'rule', 'rules', 'trick', 'tricks', 'tip', 'tips', 'way', 'ways',
  'most', 'people', 'many', 'some', 'always', 'never', 'often', 'usually', 'really', 'pretty', 'kind', 'sort', 'mean', 'means', 'meant',
  'what', 'which', 'when', 'where', 'while', 'because', 'since', 'though', 'although', 'however', 'anyway', 'okay', 'yeah', 'right', 'well',
  'think', 'know', 'notice', 'remember', 'imagine', 'guess', 'feel', 'look', 'looks', 'see', 'seen', 'let', 'lets', 'tell', 'told', 'said', 'says', 'call',
  'today', 'video', 'story', 'nobody', 'somebody', 'someone', 'anyone', 'something', 'anything', 'nothing', 'exactly', 'crucial', 'key', 'important', 'matter', 'matters',
]
const FRAMING = new Set(FRAMING_WORDS.map((w) => stem(w)))

/** Words the sentence adds beyond its sources (stems), and numbers not in them. `ignore` adds words that never count (her storytelling words). */
export function addedBeyond(sentence: string, sources: readonly string[], ignore: ReadonlySet<string> = new Set()): { words: string[]; numbers: string[]; share: number } {
  const src = new Set(wordsOf(sources.join(' ')).map(stem))
  const srcNums = new Set(numbersOf(sources.join(' ')))
  const ws = wordsOf(sentence).filter((w) => !FRAMING.has(stem(w)) && !ignore.has(stem(w)))
  const words = ws.filter((w) => !src.has(stem(w)))
  return { words, numbers: numbersOf(sentence).filter((n) => !srcNums.has(n)), share: ws.length ? words.length / ws.length : 0 }
}

/**
 * Fix A (owner, 13 Nov): the item across ALL her facts (and stated opinions)
 * that the sentence adds least to: fewest new numbers, then fewest new words,
 * then most shared meaning. Not limited to the tracer's first three hits.
 */
export function bestItem(sentence: string, pool: readonly WriterItem[], ignore: ReadonlySet<string> = new Set()): { item: WriterItem; added: ReturnType<typeof addedBeyond>; meaning: number } | null {
  let best: { item: WriterItem; added: ReturnType<typeof addedBeyond>; meaning: number } | null = null
  for (const item of pool) {
    const added = addedBeyond(sentence, [item.text], ignore)
    const meaning = overlap(sentence, item.text)
    const better = !best || added.numbers.length < best.added.numbers.length
      || (added.numbers.length === best.added.numbers.length && (added.words.length < best.added.words.length
        || (added.words.length === best.added.words.length && meaning > best.meaning)))
    if (better) best = { item, added, meaning }
  }
  return best
}

export type FoCutReason = 'no_source' | 'general_over_cap' | 'names_product' | 'first_person_no_source' | 'product_pronoun' | 'added_number' | 'added_detail' | 'unearned_first_person' | 'borrowed_layer' | 'background_as_experience' | 'link_not_stored' | 'other_product' | 'hook_untraced' | 'profile_line' | 'stock_line' | 'moved_feeling' | 'invented_cta' | 'orphan'
export interface FoTraceRecord {
  sentences: number; sourced: number; connecting: number; hook_cta_free: number; general_kept: number; viewer_questions: number; viewer_asks: number
  tags: Record<LineTag | 'untagged', number>
  cut: Record<FoCutReason, number>; beats_dropped: number
  examples: Array<{ beat: number; reason: FoCutReason; text: string }>
}
/** Added detail beyond its source: at least this many new content words AND this share of the sentence. */
export const ADDED_MIN_WORDS = 5
export const ADDED_MIN_SHARE = 0.6
/** A sentence with no source is "connecting" only if it adds at most this many new content words. */
export const CONNECT_MAX_NEW = 2
/** Rule C: unsourced general sentences (no number, first person, feeling, result, product or brand) kept per script; questions to the viewer are not counted. */
export const GENERAL_MAX = 3

// ── The free pass (owner, 13 Nov, second review) ──────────────────────────
// A no-source sentence passes as connecting, as Rule C, or as a hook/CTA
// with no fact ONLY when none of these apply:
/** 1. First-person pronouns: such a sentence needs a source. */
export const FIRST_PERSON_PRONOUN = /\b(?:i|me|my|mine|we|us|our|ours)\b/i
/** 3. With a product in the request, a sentence starting with one of these is a product claim in disguise. */
export const PRODUCT_PRONOUN_START = /^\s*(?:it|this|that|these|they)\b/i
const NAME_STOP = new Set(['The', 'And', 'Of', 'For', 'With', 'A', 'An', 'To', 'In', 'On', 'At', 'By', 'My', 'Our', 'Your'])
/** 2. Every capitalised word of her product and brand names (Pip, Sprocket, Live…). */
export function nameTokens(names: readonly string[]): string[] {
  const out = new Set<string>()
  for (const n of names) for (const w of String(n ?? '').split(/[^A-Za-z0-9'’]+/)) if (/^[A-Z]/.test(w) && w.length >= 2 && !NAME_STOP.has(w)) out.add(w.replace(/['’]s$/, ''))
  return [...out]
}
/**
 * Viewer asks (owner, 14 Nov): a CTA-shaped sentence ("Tell me in the
 * comments", "Send me a message", "Comment below", "Follow", "DM me", "link in
 * bio") is never cut by the first-person pronoun rule or by Rule C. With a
 * number or a product claim in it, the normal rules apply.
 */
export const VIEWER_ASK = /\b(?:tell me|let me know|send me|dm me|message me|drop (?:me|a comment|it)|comment(?:s)?(?: below| down below)?|in the comments|follow(?: me| along| for)?|link in (?:my |the )?bio|subscribe|save this|share (?:this|your|it)|hit (?:follow|subscribe|the link)|tap the link)\b/i
export const isViewerAsk = (s: string): boolean => VIEWER_ASK.test(s)
/** compare-2 constants. */
export const SELF_INTRO = /^\s*(?:i am|i'm|we are|we're)\s+(?:a|an|the|just a)\b/i
export const DM_ASK = /\b(?:dm me|message me|send me a (?:message|dm)|slide into)\b/i
export const ORPHAN_OPENER = /^\s*(?:it|this|that|these|those|and|so|but|then|because|which)\b/i
const CLOSE_WORDS = /\b(?:link in (?:my |the )?bio|in (?:the|my) shop|shop now|follow|save this|comment|subscribe|order (?:yours|now|one)|buy|grab|get yours|available (?:now|today)|drops?|try it|sign up|book)\b/i

/** The three settings tuned from the owner's fixed grid. */
export interface TraceTuning { addedMinWords: number; addedMinShare: number; generalMax: number }
export const TRACE_TUNING_GRID = { addedMinWords: [3, 4, 5], addedMinShare: [0.5, 0.6], generalMax: [2, 3] } as const
/** Fix A: a story paraphrase counts as her source for first person at this meaning overlap (the gate's HER_MIN). */
export const STORY_PARAPHRASE_MEANING = 0.34

// ── PANEL 14 FIX 2: A PRODUCT'S FACTS AND STORIES STAY WITH THAT PRODUCT ──
// In a script about one product, an item about ANOTHER product (its product
// facts, or a story that uses that product's words) is not a source, and a
// sentence that uses another product's words is cut. Panel 14: a buyer story
// about a mug told for the Moss Bowl; the moisturizer's origin story and
// "fragrance free" on the balm; mug/bowl, cream/balm, jar/tin, cleansers/creams.
// "Another product's words": its name and size/packaging words, plus words and
// word pairs from its facts that neither the target product (name, facts,
// offer, the request) nor her general material (items about no product) uses.
const pstem = (w: string) => (w.length > 4 ? w.replace(/(?:ers|er|ing|ed|es|s)$/, '') : w.length > 3 ? w.replace(/s$/, '') : w)
const ptokens = (t: string): string[] => String(t ?? '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !STOP.has(w)).map(pstem)
const pbigrams = (t: string): string[] => { const w = ptokens(t); return w.slice(1).map((x, i) => `${w[i]} ${x}`) }
export interface ProductScope { target: string; words: Set<string>; pairs: Set<string> }

/** The words that belong to products other than `target`. Null when the script has no target product. */
export function productScope(target: string | null | undefined, products: ReadonlyArray<{ id: string; name: string }>, items: readonly WriterItem[]): ProductScope | null {
  if (!target) return null
  const facts = (pid: string) => items.filter((it) => it.productId === pid && (it.origin === 'product_fact' || it.origin === 'offer')).map((it) => it.text)
  const tName = products.find((p) => p.id === target)?.name ?? ''
  const targetText = [tName, ...facts(target), ...items.filter((it) => it.id === 'note' || it.id === 'offer').map((it) => it.text)].join(' ')
  const tWords = new Set(ptokens(targetText))
  const tPairs = new Set(pbigrams(targetText))
  const others = products.filter((p) => p.id !== target)
  const nameWords = new Set([
    ...others.flatMap((p) => ptokens(p.name)),
    // Size and packaging (jar, tin, glass): the product's own container words.
    ...items.filter((it) => it.productId && it.productId !== target && it.field === 'size').flatMap((it) => ptokens(it.text)),
  ].filter((w) => !tWords.has(w)))
  // Her general material: items about no product that do not use another product's name.
  const general = items.filter((it) => !it.productId && it.id !== 'note' && !ptokens(it.text).some((w) => nameWords.has(w))).map((it) => it.text).join(' ')
  const gWords = new Set(ptokens(general))
  const gPairs = new Set(pbigrams(general))
  const words = new Set(nameWords)
  const pairs = new Set<string>()
  for (const p of others) {
    for (const f of facts(p.id)) {
      for (const w of ptokens(f)) if (!tWords.has(w) && !gWords.has(w)) words.add(w)
      for (const b of pbigrams(f)) if (!tPairs.has(b) && !gPairs.has(b)) pairs.add(b)
    }
  }
  return { target, words, pairs }
}

/** The other product's words this text uses (empty when none, or with no scope). */
export function otherProductWords(text: string, scope: ProductScope | null): string[] {
  if (!scope) return []
  return [...new Set([...ptokens(text).filter((w) => scope.words.has(w)), ...pbigrams(text).filter((b) => scope.pairs.has(b))])]
}

/** An item that belongs to another product: attached to it, or using its words. */
export function belongsElsewhere(item: WriterItem, scope: ProductScope | null): boolean {
  if (!scope || item.id === 'note') return false
  if (item.productId && item.productId !== scope.target) return true
  return otherProductWords(item.text, scope).length > 0
}

const isCtaSection = (s: unknown) => /\b(?:cta|call to action|close)\b/i.test(String(s ?? ''))
const tagOf = (v: unknown): LineTag | null => ((LINE_TAGS as readonly string[]).includes(String(v ?? '').toLowerCase()) ? String(v).toLowerCase() as LineTag : null)

/**
 * The facts-only pass, by layer. For each spoken sentence:
 *  - its sources are FACTS-layer items only (and her stated opinions, for an
 *    opinion line): the ones the writer cited that the tracer confirms, plus
 *    any the tracer finds. Storytelling and background items are never in
 *    the source map for events;
 *  - a beat that states a fact and cites only storytelling/background items
 *    is dropped (borrowed_layer);
 *  - a `link` beat must cite one of her stored stories, or it is dropped;
 *  - first-person history that rests on an audience/background item and on
 *    none of her stories is dropped (an audience problem never becomes hers);
 *    any other first-person history without one of her stories is cut too;
 *  - sources: the best-matching item across ALL her facts (Fix A), the
 *    writer's confirmed citations and the tracer's hits; numbers written in
 *    words are compared as numbers (Fix B);
 *  - first person needs one of her stories, or a paraphrase of one (Fix A);
 *  - no source → cut, unless: a connecting line (states nothing, ≤2 new
 *    words); the hook or the CTA stating no fact (rule 5); a question to the
 *    viewer; or a general sentence with no number, first person, feeling or
 *    result that does not name her product or brand, at most 2 per script
 *    (rule C);
 *  - a number not in its sources → cut, on every line; an added
 *    effect/scene/consequence (≥3 new content words making up ≥half the
 *    sentence, framing words and her storytelling words not counted, rule E)
 *    → cut.
 * Kept text is her text: nothing is reworded, only cut. A beat left with no
 * sentence is dropped. Each kept beat carries `source_ids` (facts layer).
 */
export function traceAndCut<B extends { section?: unknown; line?: unknown; source_ids?: unknown; layer_tag?: unknown }>(beats: readonly B[], items: readonly WriterItem[], extra: { style?: readonly WriterItem[]; background?: readonly WriterItem[]; names?: readonly string[]; maxExamples?: number; hasProduct?: boolean; tuning?: Partial<TraceTuning>; targetProductId?: string | null; products?: ReadonlyArray<{ id: string; name: string }>; strictHook?: boolean; profileTexts?: readonly string[]; priorLines?: readonly string[] } = {}): { beats: Array<B & { source_ids: string[] }>; record: FoTraceRecord } {
  const rec: FoTraceRecord = { sentences: 0, sourced: 0, connecting: 0, hook_cta_free: 0, general_kept: 0, viewer_questions: 0, viewer_asks: 0, tags: { fact: 0, style: 0, opinion: 0, link: 0, untagged: 0 }, cut: { no_source: 0, general_over_cap: 0, names_product: 0, first_person_no_source: 0, product_pronoun: 0, added_number: 0, added_detail: 0, unearned_first_person: 0, borrowed_layer: 0, background_as_experience: 0, link_not_stored: 0, other_product: 0, hook_untraced: 0, profile_line: 0, stock_line: 0, moved_feeling: 0, invented_cta: 0, orphan: 0 }, beats_dropped: 0, examples: [] }
  // Fix 2: with a target product, another product's items are never a source.
  const scope = productScope(extra.targetProductId, extra.products ?? [], items)
  const elsewhere = items.filter((it) => belongsElsewhere(it, scope))
  const elsewhereIds = new Set(elsewhere.map((it) => it.id))
  const facts = items.filter((it) => it.layer === 'fact' && !elsewhereIds.has(it.id))
  const opinions = items.filter((it) => it.opinion && !elsewhereIds.has(it.id))
  // compare-1 follow-up: profile notes, stock lines and their fit to this request.
  const profileTexts = [...items.filter((it) => it.profile).map((it) => it.text), ...(extra.profileTexts ?? [])].filter((t) => t.trim().split(/\s+/).length >= 4)
  const note = items.find((it) => it.id === 'note')?.text ?? ''
  const targetName = (extra.products ?? []).find((p) => p.id === extra.targetProductId)?.name ?? ''
  const stock = items.filter((it) => !elsewhereIds.has(it.id) && (it.opinion || /^(?:product_slot|tagline)$/i.test(String(it.field ?? ''))))
  const stockFits = (it: WriterItem) => it.opinion ? overlap(it.text, note) > 0 : (!!extra.targetProductId || overlap(it.text, `${note} ${targetName}`) > 0)
  const recentlyUsed = (t: string) => (extra.priorLines ?? []).some((p) => overlap(p, t) >= 0.6)
  const nonSource = [...items.filter((it) => it.layer !== 'fact' && !it.opinion), ...(extra.style ?? []), ...(extra.background ?? [])]
  const all = [...items, ...(extra.style ?? []), ...(extra.background ?? [])]
  const byId = new Map(all.map((it) => [it.id, it]))
  const allTexts = all.filter((it) => !elsewhereIds.has(it.id)).map((it) => it.text)
  const toInputs = (xs: readonly WriterItem[]): LineSourceInput[] => xs.map((it) => ({ kind: 'fact', label: it.ref, text: it.text, id: it.id }))
  const factInputs = toInputs([...facts, ...opinions])
  const factPool = [...facts, ...opinions]
  const storyPool = facts.filter((it) => STORY_ORIGINS.has(it.origin))
  // Rule E: her storytelling-layer words never count as added detail.
  const styleWords = new Set((extra.style ?? []).flatMap((it) => wordsOf(it.text)).map(stem))
  // Rule C: her product and brand names (a sentence naming them needs a source).
  const names = (extra.names ?? []).map((n) => String(n ?? '').trim().toLowerCase()).filter((n) => n.length >= 3)
  const tokens = nameTokens(extra.names ?? [])
  const tokenRe = tokens.length ? new RegExp(`\\b(?:${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`) : null
  const namesProduct = (s: string) => { const low = s.toLowerCase(); return names.some((n) => low.includes(n)) || (!!tokenRe && tokenRe.test(s)) }
  const tune: TraceTuning = { addedMinWords: extra.tuning?.addedMinWords ?? ADDED_MIN_WORDS, addedMinShare: extra.tuning?.addedMinShare ?? ADDED_MIN_SHARE, generalMax: extra.tuning?.generalMax ?? GENERAL_MAX }
  // The free pass is blocked by: first-person pronouns (1), a name token (2), or,
  // with a product in the request, an It/This/That/These/They opening (3).
  const freePassBlocked = (s: string): FoCutReason | null => FIRST_PERSON_PRONOUN.test(s) ? 'first_person_no_source'
    : namesProduct(s) ? 'names_product'
      : extra.hasProduct && PRODUCT_PRONOUN_START.test(s) ? 'product_pronoun' : null
  let generalKept = 0
  const bgInputs = toInputs(nonSource.filter((it) => it.layer === 'background'))
  const spokenIdx = beats.map((b, i) => (typeof b?.line === 'string' && b.line.trim() ? i : -1)).filter((i) => i >= 0)
  const first = spokenIdx[0] ?? -1
  const last = spokenIdx[spokenIdx.length - 1] ?? -1
  const out: Array<B & { source_ids: string[] }> = []
  const cutOne = (beat: number, reason: FoCutReason, text: string) => {
    rec.cut[reason]++
    if (rec.examples.length < (extra.maxExamples ?? 12)) rec.examples.push({ beat, reason, text: text.slice(0, 160) })
  }
  beats.forEach((b, i) => {
    const line = typeof b?.line === 'string' ? b.line.trim() : ''
    if (!line) { out.push({ ...b, source_ids: [] }); return }
    const tag = tagOf(b.layer_tag)
    rec.tags[tag ?? 'untagged']++
    // Fix 4 (Panel 14): the hook traces like any line. Only the CTA keeps the
    // free pass; a hook with no source stays only as a question, a viewer ask
    // or a plain connecting line.
    const hook = extra.strictHook === true && i === first && !isCtaSection(b.section)
    const free = !hook && (i === first || i === last || isCtaSection(b.section))
    const citedAll = resolveSourceIds(b.source_ids, all)
    const cited = citedAll.filter((id) => (byId.get(id)?.layer === 'fact' || byId.get(id)?.opinion) && !elsewhereIds.has(id))
    // Guard: an event or number resting only on storytelling/background items.
    if (citedAll.length && !cited.length && statesAFact(line)) { cutOne(i, 'borrowed_layer', line); rec.beats_dropped++; return }
    // Guard: a cross-story link must point at one of her STORED stories.
    if (tag === 'link' && !cited.some((id) => STORY_ORIGINS.has(byId.get(id)?.origin ?? '') && byId.get(id)?.layer === 'fact')) { cutOne(i, 'link_not_stored', line); rec.beats_dropped++; return }
    const kept: string[] = []
    const ids = new Set<string>()
    for (const sentence of line.split(SENTENCES).map((s) => s.trim()).filter(Boolean)) {
      rec.sentences++
      // Fix 2: a sentence using another product's words is cut.
      if (otherProductWords(sentence, scope).length) { cutOne(i, 'other_product', sentence); continue }
      // A saved profile or niche answer is never spoken.
      // compare-2 (S-85B1C6, S-C955A7): a paraphrased self-introduction is the same note.
      if (profileTexts.some((t) => overlap(sentence, t) >= 0.5 || (SELF_INTRO.test(sentence) && overlap(sentence, t) >= 0.2))) { cutOne(i, 'profile_line', sentence); continue }
      // compare-2 (S-0AA5A8): a "DM me / message me" ask she never offers is invented.
      if (DM_ASK.test(sentence) && !allTexts.some((t) => DM_ASK.test(t) || /\b(?:dm|direct message|message me)\b/i.test(t))) { cutOne(i, 'invented_cta', sentence); continue }
      // A stock opinion or product line: only when it fits this request, and
      // rested when one of her last few scripts already said it.
      const stockHit = stock.find((it) => overlap(sentence, it.text) >= 0.5)
      // compare-2 check: a stock line the request is plainly about is never rested.
      if (stockHit && (!stockFits(stockHit) || (recentlyUsed(stockHit.text) && overlap(stockHit.text, note) < STORY_PARAPHRASE_MEANING))) { cutOne(i, 'stock_line', sentence); continue }
      const traced = traceLines([{ line: sentence }], factInputs)[0]?.from.map((h) => h.id).filter((x): x is string => !!x) ?? []
      // A cited item counts when the tracer agrees, or the sentence shares meaning with it.
      const confirmed = cited.filter((id) => traced.includes(id) || overlap(sentence, byId.get(id)?.text ?? '') >= 0.5)
      // Fix A: the best-matching item across ALL her facts. It is a source when
      // the sentence adds nothing to it (a short line inside her story), or
      // shares meaning with it.
      const best = bestItem(sentence, factPool, styleWords)
      const bestIsSource = !!best && !best.added.numbers.length && (best.added.words.length === 0 || best.meaning >= 0.5 || traced.includes(best.item.id))
      const src = [...new Set([...confirmed, ...traced, ...(bestIsSource ? [best!.item.id] : [])])].map((id) => byId.get(id)).filter((x): x is WriterItem => !!x)
      const fact = statesAFact(normalizeNumbers(sentence))
      if (FIRST_PERSON_HISTORY.test(sentence)) {
        // Fix A: her story, or a paraphrase of it (shared meaning), earns first person.
        const storyBacked = src.some((it) => STORY_ORIGINS.has(it.origin) && it.layer === 'fact')
          || storyPool.some((it) => overlap(sentence, it.text) >= STORY_PARAPHRASE_MEANING)
        if (!storyBacked) {
          const fromAudience = (traceLines([{ line: sentence }], bgInputs)[0]?.from.length ?? 0) > 0
          cutOne(i, fromAudience ? 'background_as_experience' : 'unearned_first_person', sentence); continue
        }
      }
      // Fix 2: a sentence retelling another product's item in other words (closer to it than to any of its own sources).
      const otherMeaning = Math.max(0, ...elsewhere.filter((it) => it.layer === 'fact').map((it) => overlap(sentence, it.text)))
      if (otherMeaning >= STORY_PARAPHRASE_MEANING && otherMeaning > Math.max(0, ...src.map((it) => overlap(sentence, it.text)))) { cutOne(i, 'other_product', sentence); continue }
      if (!src.length) {
        if (fact) { cutOne(i, 'no_source', sentence); continue }
        // A viewer ask (no number, no fact, not naming her product) always
        // stays: not cut by the pronoun rule or by Rule C, not counted.
        if (isViewerAsk(sentence) && !namesProduct(sentence)) { rec.viewer_asks++; kept.push(sentence); continue }
        // No free pass with a first-person pronoun, a name token, or (with a
        // product in the request) an It/This/That/These/They opening.
        const blocked = freePassBlocked(sentence)
        if (blocked) { cutOne(i, blocked, sentence); continue }
        // compare-2 (S-5C7731): a no-source line that leans on what came before
        // ("It was just unclear copy.", "And this is what changes…") is an orphan.
        if (ORPHAN_OPENER.test(sentence)) { cutOne(i, 'orphan', sentence); continue }
        // compare-2 (S-4126D9): in the closing beat a no-source line is a call to
        // action or nothing (no invented sample reply, no new content).
        if (free && i !== first && !CLOSE_WORDS.test(sentence)) { cutOne(i, 'no_source', sentence); continue }
        // A plain connecting line: states nothing, adds at most 2 new words.
        if (addedBeyond(sentence, allTexts, styleWords).words.length <= CONNECT_MAX_NEW) { rec.connecting++; kept.push(sentence); continue }
        // Fix 4: a hook with no source is a question to the viewer or nothing.
        if (hook) {
          if (/\?\s*$/.test(sentence)) { rec.viewer_questions++; kept.push(sentence); continue }
          cutOne(i, 'hook_untraced', sentence); continue
        }
        // Rule 5: the hook and the CTA are exempt only when they state no fact.
        // compare-2 (S-4126D9): in the closing beat the pass covers a call to
        // action only, never new content such as an invented sample reply.
        if (free && (i === first || CLOSE_WORDS.test(sentence))) { rec.hook_cta_free++; kept.push(sentence); continue }
        // Questions to the viewer are not counted toward the cap.
        if (/\?\s*$/.test(sentence)) { rec.viewer_questions++; kept.push(sentence); continue }
        if (generalKept < tune.generalMax) { generalKept++; rec.general_kept++; kept.push(sentence); continue }
        cutOne(i, 'general_over_cap', sentence); continue
      }
      // Fix A: added detail is measured against the closest of its sources.
      const add = [addedBeyond(sentence, src.map((it) => it.text), styleWords), ...src.map((it) => addedBeyond(sentence, [it.text], styleWords))]
        .sort((x, y) => x.numbers.length - y.numbers.length || x.words.length - y.words.length)[0]!
      // Numbers stay strict, on every line.
      if (add.numbers.length) { cutOne(i, 'added_number', sentence); continue }
      // compare-1 follow-up: a feeling or outcome not in its own sources (moved
      // from another story, or added) is cut.
      // Measured against the source the sentence is closest to: a feeling that
      // belongs to a different story does not travel with it.
      const closest = [...src].sort((x, y) => overlap(sentence, y.text.replace(FEELING_WORDS, '')) - overlap(sentence, x.text.replace(FEELING_WORDS, '')))[0]
      const srcFeel = new Set(closest ? feelingsOf(closest.text) : [])
      if (feelingsOf(sentence).some((f) => !srcFeel.has(f))) { cutOne(i, 'moved_feeling', sentence); continue }
      if (add.words.length >= tune.addedMinWords && add.share >= tune.addedMinShare && !free) { cutOne(i, 'added_detail', sentence); continue }
      // compare-2 (S-339D5F, S-20D4B5): a first-person line that adds actions to
      // her source ("I pull the weft through") is an invented process.
      if (FIRST_PERSON_PRONOUN.test(sentence) && add.words.length >= 2 && add.share >= 0.34 && !isViewerAsk(sentence)) { cutOne(i, 'added_detail', sentence); continue }
      rec.sourced++
      for (const it of src) ids.add(it.id)
      kept.push(sentence)
    }
    if (!kept.length) { rec.beats_dropped++; return }
    out.push({ ...b, line: kept.join(' '), source_ids: [...ids] })
  })
  return { beats: out, record: rec }
}

/** Per layer: how many items the writer received (for the trace). */
export function layerCounts(items: readonly WriterItem[], style: readonly WriterItem[] = [], background: readonly WriterItem[] = []) {
  return { fact: items.filter((it) => it.layer === 'fact').length, style: style.length, background: items.filter((it) => it.layer === 'background').length + background.length }
}

/** Counts of what the writer is handed (for the trace and the PR report). */
export function suppliedCounts(items: readonly WriterItem[], extra: { pillars?: number; painThemes?: number; sampleLines?: number; answers?: number } = {}) {
  const by = (o: string) => items.filter((it) => it.origin === o && it.layer === 'fact').length
  return { items: items.filter((it) => it.layer === 'fact').length, opinions: items.filter((it) => it.opinion).length, stories: by('her_story'), facts: by('her_fact'), answers: by('her_answer'), product_facts: by('product_fact') + by('offer') + by('urgency'), ...extra }
}

// ── PANEL 14 FIXES (owner verdict, 18 Nov) ─────────────────────────────────

/** Fix 4: hook options trace like script lines (no free pass). A hook keeps only its traced sentences; a hook with none left is dropped. */
export function traceHooks(hooks: readonly string[], items: readonly WriterItem[], extra: Omit<Parameters<typeof traceAndCut>[2], 'strictHook'> = {}): { hooks: string[]; dropped: number } {
  const out: string[] = []
  for (const h of hooks) {
    if (typeof h !== 'string' || !h.trim()) continue
    const r = traceAndCut([{ section: 'Hook', line: h }], items, { ...extra, strictHook: true })
    const line = typeof r.beats[0]?.line === 'string' ? String(r.beats[0].line).trim() : ''
    if (line) out.push(line)
  }
  return { hooks: out, dropped: hooks.filter((h) => typeof h === 'string' && h.trim()).length - out.length }
}

/** Fix 1: a script under 40 spoken words, or under 3 spoken lines (3+ words), is thin. */
export const THIN_MIN_WORDS = 40
export const THIN_MIN_LINES = 3
// compare-1 (advisor): a link line or a call to action is not content. A
// script carried by its CTA and a URL ("Harbor Fog Scarf at https://…") is thin.
const NOT_CONTENT = (l: string) => /https?:\/\/|\b(?:[a-z0-9-]+\.)+(?:com|shop|co|net|org|store)\b/i.test(l) || isViewerAsk(l)
export function scriptThin(beats: ReadonlyArray<{ line?: unknown; section?: unknown }>): { words: number; lines: number; thin: boolean } {
  const spoken = beats.filter((b) => !isCtaSection(b?.section)).map((b) => (typeof b?.line === 'string' ? b.line.trim() : '')).filter((l) => l && !NOT_CONTENT(l))
  const words = spoken.reduce((n, l) => n + l.split(/\s+/).filter(Boolean).length, 0)
  const lines = spoken.filter((l) => l.split(/\s+/).filter(Boolean).length >= 3).length
  return { words, lines, thin: words < THIN_MIN_WORDS || lines < THIN_MIN_LINES }
}

/** Fix 1: the one question to ask instead of writing a thin script: the first open need for this request, a story first. Null when every key is closed. */
export function thinQuestion(req: FoRequest, opts: { closedKeys?: readonly string[]; savedAnswers?: readonly string[] } = {}): FoQuestion | null {
  const closed = new Set(opts.closedKeys ?? [])
  const saved = opts.savedAnswers ?? []
  const needs = needsFor(req)
  const general: FoQuestion = { key: `mn:fo:story:thin:${slug(String(req.note ?? '') || req.product?.name || 'general')}`, kind: 'story', question: `What is the moment behind ${quote(String(req.note ?? '').trim() || req.product?.name || 'this video')}? Say when it happened${req.product?.name ? ` with ${req.product.name}` : ''} and what you did.` }
  const pool = [...needs.filter((n) => n.kind === 'story'), ...needs.filter((n) => n.kind !== 'story'), general]
  return pool.find((n) => !closed.has(n.key) && !saved.some((a) => overlap(a, n.question) >= 0.6)) ?? null
}

/** Fix 3: story rows resting on the facts-only path: supplied in `restAfter` (2) of her last five scripts. */
export function restingStoryIds(rows: ReadonlyArray<{ id?: unknown; kind?: unknown }>, recent: ReadonlyMap<string, number>, storyKinds: ReadonlySet<string>, restAfter: number, keep: ReadonlySet<string> = new Set()): Set<string> {
  const out = new Set<string>()
  for (const r of rows) {
    const id = String(r?.id ?? '')
    // compare-1 (advisor): the story the request names never rests.
    if (id && !keep.has(id) && storyKinds.has(String(r?.kind ?? '')) && (recent.get(id) ?? 0) >= restAfter) out.add(id)
  }
  // compare-3: rotation never leaves her with no story at all.
  const stories = rows.filter((r) => storyKinds.has(String(r?.kind ?? '')) && String(r?.id ?? ''))
  if (stories.length && stories.every((r) => out.has(String(r.id)))) return new Set()
  return out
}

/** compare-3 (owner): stories on file that fit the request (share meaning with it) never rest. */
export function fittingStoryIds(rows: ReadonlyArray<{ id?: unknown; kind?: unknown; text?: unknown }>, note: string): Set<string> {
  return new Set(rows.filter((r) => String(r?.id ?? '') && overlap(String(r?.text ?? ''), note) > 0).map((r) => String(r.id)))
}

const normLine = (t: string) => String(t ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
/** Fix 3: the opening sentence of a script, normalised (for comparing openings across her scripts). */
export function openingOf(beats: ReadonlyArray<{ line?: unknown }>): string {
  const first = beats.map((b) => (typeof b?.line === 'string' ? b.line.trim() : '')).find(Boolean) ?? ''
  return normLine(first.split(SENTENCES)[0] ?? '')
}
const sameOpening = (a: string, b: string) => {
  if (!a || !b) return false
  if (a === b) return true
  const wa = new Set(a.split(' ').filter((w) => w.length >= 3))
  const wb = new Set(b.split(' ').filter((w) => w.length >= 3))
  const inter = [...wa].filter((w) => wb.has(w)).length
  return inter / Math.max(1, new Set([...wa, ...wb]).size) >= 0.8
}
/** Fix 3: no two scripts for the same creator open with the same line. The repeated opening sentence is cut (cuts only), until the opening is new. */
export function dropRepeatedOpening<B extends { line?: unknown }>(beats: readonly B[], priorOpenings: readonly string[]): { beats: B[]; cut: number } {
  const prior = priorOpenings.map(normLine).filter(Boolean)
  let out = beats.slice()
  let cut = 0
  for (let guard = 0; guard < 20; guard++) {
    const i = out.findIndex((b) => typeof b?.line === 'string' && b.line.trim())
    if (i < 0) break
    const sentences = String(out[i]!.line).trim().split(SENTENCES)
    if (!prior.some((p) => sameOpening(normLine(sentences[0] ?? ''), p))) break
    cut++
    const rest = sentences.slice(1).join(' ').trim()
    out = rest ? out.map((b, k) => (k === i ? { ...b, line: rest } : b)) : out.filter((_, k) => k !== i)
  }
  return { beats: out, cut }
}

// Fix 4: quality cleanup, applied after the trace. Cuts and strips only; one
// exception: an ordinal with no earlier step becomes "Another".
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth']
const ORDINAL_NOUN = '(step|steps|mistake|mistakes|check|checks|thing|things|item|items|tip|tips|rule|rules|reason|reasons|way|ways|sign|signs|lesson|lessons|habit|habits|question|questions|part|parts|point|points|option|options)'
const ORDINAL_RE = new RegExp(`\\b(?:the\\s+|my\\s+|your\\s+|a\\s+)?(${ORDINALS.join('|')})\\s+${ORDINAL_NOUN}\\b`, 'gi')
/** Spoken filler copied from her transcripts: "um", "uh", "so yeah", "like," between commas. */
export function stripFiller(sentence: string, onStrip: () => void = () => {}): string {
  const hit = (r: string) => { onStrip(); return r }
  return sentence
    .replace(/,\s*like,\s*/gi, () => hit(', '))
    .replace(/^like,\s*/i, () => hit(""))
    .replace(/\b(?:um+|uh+|erm+)\b[,.]?\s*/gi, () => hit(''))
    .replace(/\bso yeah\b[,.]?\s*/gi, () => hit(''))
    .replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').replace(/,([.!?])/g, '$1').replace(/^[\s,]+/, '').trim()
}
const EMPTY_FRAGMENT = /^(?:look|listen|okay|ok|so|right|well|honestly|anyway|yeah|now|see|alright|here|wait|and|but|um+|uh+)[.!?…,]*$/i
/** Fix 4e: a link with trailing "." or "!" (teleprompter and copy-paste). */
export const LINK_TRAILING = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*?)?)[.!]+(?=\s|$)/gi
export interface FoPolishRecord { filler: number; fragments: number; ordinals: number; links: number; beats_dropped: number }

export function polishFactsOnly<B extends { line?: unknown }>(beats: readonly B[]): { beats: B[]; record: FoPolishRecord } {
  const rec: FoPolishRecord = { filler: 0, fragments: 0, ordinals: 0, links: 0, beats_dropped: 0 }
  const counts = new Map<string, number>()
  const out: B[] = []
  for (const b of beats) {
    if (typeof b?.line !== 'string' || !b.line.trim()) { out.push(b); continue }
    const kept: string[] = []
    for (let sentence of b.line.trim().split(SENTENCES)) {
      // 4b: strip copied filler.
      const noFiller = stripFiller(sentence, () => { rec.filler++ })
      sentence = noFiller ? noFiller.charAt(0).toUpperCase() + noFiller.slice(1) : ''
      // 4c: an empty fragment ("Look.") is dropped.
      if (!sentence || EMPTY_FRAGMENT.test(sentence)) { if (sentence) rec.fragments++; continue }
      // 4a (compare-1, advisor): ordinals are numbered in the order the script
      // says them, per list noun ("second check, third check" with no first
      // becomes "first check, second check"), never a run of "Another".
      sentence = sentence.replace(ORDINAL_RE, (m, ord: string, noun: string) => {
        const key = noun.toLowerCase().replace(/s$/, '')
        const k = (counts.get(key) ?? 0) + 1
        counts.set(key, k)
        const want = ORDINALS[k - 1]
        if (!want || want === ord.toLowerCase()) return m
        rec.ordinals++
        const out = m.replace(new RegExp(`\\b${ord}\\b`), ord[0] === ord[0]!.toUpperCase() ? want[0]!.toUpperCase() + want.slice(1) : want)
        return out
      })
      // 4e: links never end in "." or "!".
      sentence = sentence.replace(LINK_TRAILING, (_m, url: string) => { rec.links++; return url })
      kept.push(sentence)
    }
    if (!kept.length) { rec.beats_dropped++; continue }
    out.push({ ...b, line: kept.join(' ') })
  }
  return { beats: out, record: rec }
}

// ── compare-3 (owner, 24 Nov): WRITE FIRST, AT MOST ONE OPTIONAL QUESTION ──
// The script is written from what she has; at most one optional question is
// attached for the thing that would make it better. A request stops with no
// script only when there is almost nothing real to use. Hard rules for that
// question (tests): never repeated for the creator, never already answered,
// always names the specific thing, never about profile, niche or audience,
// never the generic "one real thing that happened" wording.
export const QUESTION_BANNED = /\bone real thing that happened\b|\bto you or a customer\b|\b(?:audience|niche|profile|who (?:is|are) (?:this|your) (?:video )?for|who do you (?:speak|talk) to)\b/i
/** The hard rules for one question, against this request and everything already asked or answered for this creator. */
export function questionRulesOk(q: FoQuestion, req: FoRequest, ctx: { askedKeys?: readonly string[]; askedTexts?: readonly string[]; closedKeys?: readonly string[]; savedAnswers?: readonly string[] } = {}): boolean {
  if (!q?.question || QUESTION_BANNED.test(q.question)) return false
  const named = (req.product?.name && q.question.includes(req.product.name)) || (String(req.note ?? '').trim() && q.question.includes(String(req.note).trim().slice(0, 80)))
  if (!named) return false
  if ((ctx.closedKeys ?? []).includes(q.key) || (ctx.askedKeys ?? []).includes(q.key)) return false
  if ((ctx.askedTexts ?? []).some((t) => overlap(t, q.question) >= 0.6)) return false
  if ((ctx.savedAnswers ?? []).some((a) => overlap(a, q.question) >= 0.6)) return false
  return true
}
export type FoPlan = { action: 'write'; relevant: string[]; question: FoQuestion | null } | { action: 'stop'; relevant: string[]; question: FoQuestion | null }
/**
 * Write or (rarely) stop. Stop only when almost nothing real fits: no item of
 * hers relates to the request, she has no story on file, and the request's
 * product has no facts. Otherwise write, with at most one optional question
 * for the first open need that passes the rules.
 */
export function planFactsOnly(req: FoRequest, items: readonly WriterItem[], opts: { ledger?: readonly LedgerItem[]; closedKeys?: readonly string[]; savedAnswers?: readonly string[]; askedKeys?: readonly string[]; askedTexts?: readonly string[]; storiesOnFile?: number } = {}): FoPlan {
  const rel = relevantItems(req, items, opts.ledger ?? [])
  const relevant = rel.map((r) => r.id)
  const ask = `${req.note ?? ''} ${req.product?.name ?? ''}`
  const opinions = items.filter((it) => it.opinion && overlap(it.text, ask) > 0)
  const needs = needsFor(req)
  const missing = needs.filter((n) => !covered(n, rel, items, opinions))
  const ctx = { closedKeys: opts.closedKeys, savedAnswers: opts.savedAnswers, askedKeys: opts.askedKeys, askedTexts: opts.askedTexts }
  const order: NeedKind[] = ['product_fact', 'story', 'proof', 'number', 'steps', 'opinion']
  const question = [...missing].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).find((n) => questionRulesOk(n, req, ctx)) ?? null
  const stories = opts.storiesOnFile ?? items.filter((it) => it.layer === 'fact' && it.id !== 'note' && STORY_ORIGINS.has(it.origin)).length
  const productFacts = req.product?.id ? items.filter((it) => it.productId === req.product!.id && it.origin === 'product_fact').length : 0
  const almostNothing = rel.length === 0 && stories === 0 && productFacts === 0
  return { action: almostNothing ? 'stop' : 'write', relevant, question }
}
/** "Almost nothing real": a written script under this many spoken words is not shipped. */
export const STOP_MIN_WORDS = 15
