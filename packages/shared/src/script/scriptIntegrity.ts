// THE LAST PASS OVER A FINISHED SCRIPT: EVERY BEAT HAS A HEADER AND WHOLE
// WORDS, NO STORY IS TOLD TWICE, NO NUMBER DISAGREES WITH ITSELF OR WITH WHAT
// SHE TOLD US, NO PRODUCT NAME IS INVENTED, AND THE LENGTH FITS THE TARGET.
//
// ⚠️ EACH RULE IS A REPORTED DEFECT, NOT A TASTE:
//   - a scene with no beat header, starting mid-sentence, that was a fragment
//     of a later scene (item 35);
//   - one stored story told twice in consecutive scenes with different numbers,
//     and two versions of one fact in one script (items 34, 36);
//   - a product-line name ("the … Collection") that appears nowhere in anything
//     the creator gave us (item 33);
//   - spoken length far from the length she picked (item 38).
//
// ⚖️ REPAIR, NEVER INVENT. Every repair here REMOVES or RESTORES: a duplicate
// beat is dropped, a conflicting number is replaced by the one in her own
// evidence, an invented name is reduced to its common noun, an overlong script
// loses whole trailing sentences. Nothing here writes a new claim — so a script
// that comes out SHORT is reported short, never padded here (owner's ruling in
// `durationContract.ts`: "never asks for padding"). Below 80% of the budget the
// edge may run ONE grounded extension pass (bottom of this file), which is
// re-validated by this same function and discarded if it invents anything.
//
// Deno copy is GENERATED (scripts/ci/generate_shared_pilot_core.mjs); no imports.

export interface IntegrityBeat {
  section?: unknown
  line?: unknown
  ask?: unknown
  substance?: unknown
  substance_evidence?: unknown
  /** Ids of the stored stories this beat tells (`tagStorySources`). Two beats
   *  that share one are two tellings of one story, however they are worded. */
  source_story_ids?: unknown
  [key: string]: unknown
}

export interface IntegrityOptions {
  /** Everything the creator actually supplied — product and brand names,
   *  offers, summaries, knowledge rows, evidence. Names are grounded against it. */
  knownText?: string | null
  /** The decided target length in seconds, or null to skip the budget. */
  targetSec?: number | null
  /** The creator's measured speaking rate, when one is stored. */
  wpm?: number | null
}

export interface IntegrityReport {
  headersFilled: number
  fragmentsDropped: number
  terminalsAdded: number
  inventedNames: string[]
  namesStripped: number
  duplicatesDropped: number
  numbersRestored: number
  numberConflicts: string[]
  words: number
  budget: { target: number; min: number; max: number; wpm: number } | null
  trimmedWords: number
  underBy: number
  /** Original indices of beats removed, ascending — so a parallel array
   *  (`beat_plan`) can be kept aligned by the caller. */
  droppedIndices: number[]
}

/** The recorder's natural rate (`recordingScript.ts` WPM_PRESETS.natural). */
export const DEFAULT_SPEAKING_WPM = 150
/** Same tolerance as `durationContract.ts`. */
export const BUDGET_TOLERANCE = 0.2
const MIN_WPM = 100
const MAX_WPM = 220

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const wordsOf = (s: string): number => (s.trim() === '' ? 0 : s.trim().split(/\s+/).length)
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** The speaking rate to budget with: the measured one when plausible. */
export function budgetWpm(wpm: number | null | undefined): number {
  return typeof wpm === 'number' && Number.isFinite(wpm) && wpm >= MIN_WPM && wpm <= MAX_WPM
    ? wpm : DEFAULT_SPEAKING_WPM
}

/** Word budget for a target duration. */
export function wordBudget(targetSec: number, wpm?: number | null): { target: number; min: number; max: number; wpm: number } {
  const rate = budgetWpm(wpm)
  const target = Math.round((targetSec / 60) * rate)
  return {
    target,
    min: Math.round(target * (1 - BUDGET_TOLERANCE)),
    max: Math.round(target * (1 + BUDGET_TOLERANCE)),
    wpm: rate,
  }
}

const ABBREV = /\b(?:dr|mr|mrs|ms|st|vs|etc|e\.g|i\.e|approx|no)\.$/i

/** Sentences, not split inside decimals ("3.5") or after common abbreviations. */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch !== '.' && ch !== '!' && ch !== '?') continue
    let end = i
    while (end + 1 < text.length && '.!?'.includes(text[end + 1]!)) end++
    const next = text[end + 1]
    if (next !== undefined && /\S/.test(next) && !/["'”’)]/.test(next)) { i = end; continue }
    if (ch === '.' && ABBREV.test(text.slice(start, end + 1))) { i = end; continue }
    let close = end
    while (close + 1 < text.length && /["'”’)]/.test(text[close + 1]!)) close++
    const piece = text.slice(start, close + 1).trim()
    if (piece !== '') out.push(piece)
    start = close + 1
    i = close
  }
  const tail = text.slice(start).trim()
  if (tail !== '') out.push(tail)
  return out
}

const STOP: ReadonlySet<string> = new Set([
  'this', 'that', 'with', 'your', 'from', 'have', 'they', 'them', 'their', 'what',
  'when', 'were', 'will', 'just', 'like', 'more', 'most', 'into', 'over', 'about',
  'because', 'there', 'here', 'which', 'would', 'could', 'should', 'every', 'each',
  'than', 'then', 'only', 'also', 'very', 'really', 'people', 'think', 'thing',
])

function terms(s: string): Set<string> {
  const out = new Set<string>()
  for (const w of norm(s).split(' ')) {
    if (w.length <= 3 || STOP.has(w) || /^\d+$/.test(w)) continue
    out.add(w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)
  }
  return out
}

// ── DISTINCTIVE CONTENT (items 34/36, second pass) ────────────────────────
// ⚠️ WORD OVERLAP ALONE MISSED A PARAPHRASE. Production generation 8ce1290d
// told the snap-fastener story twice — "Replacing bad snap fasteners cost me 30
// free orders" (Setup) and "faulty batches taught me…" (Durability Proof) —
// with only two surface words in common. What two tellings of one story share
// is its CONTENT: numbers, named things, and the stems of its content words —
// and, when a stored story was supplied, the story itself (`source_story_ids`).
const DISTINCT_STOP: ReadonlySet<string> = new Set([
  ...STOP, 'used', 'even', 'still', 'always', 'never', 'much', 'many', 'some', 'these',
  'those', 'being', 'been', 'where', 'while', 'until', 'after', 'before', 'again', 'first',
  'right', 'know', 'make', 'made', 'want', 'does', 'doing', 'done', 'going', 'said', 'says',
  'that’s', 'it’s', 'dont', 'didnt', 'cant', 'thats', 'youre', 'something', 'anything',
])

/** A deliberately small stemmer: enough to meet "fasteners"/"fastener",
 *  "replacing"/"replace", "batches"/"batch". */
export function stem(w: string): string {
  let s = w.toLowerCase()
  for (const suf of ['ing', 'es', 'ed', 's', 'e']) {
    if (s.endsWith(suf) && s.length - suf.length >= 4) { s = s.slice(0, -suf.length); break }
  }
  return s
}

/** Numbers, named things and stemmed content words of a text. */
export function distinctiveContent(text: string): Set<string> {
  const out = new Set<string>()
  const raw = String(text ?? '')
  for (const m of raw.matchAll(/\d+(?:[.,]\d+)?/g)) out.add(`#${m[0]!.replace(',', '')}`)
  for (const w of raw.split(/[^A-Za-z']+/)) {
    const lw = w.toLowerCase().replace(/'s?$/, '').replace(/'/g, '')
    if (lw.length < 4 || DISTINCT_STOP.has(lw)) continue
    out.add(stem(lw))
  }
  return out
}

function sharedCount(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let n = 0
  for (const w of a) if (b.has(w)) n++
  return n
}

/** Two lines retell one story when enough distinctive content is shared. */
export function sharesDistinctiveContent(a: string, b: string): boolean {
  const da = distinctiveContent(a)
  const db = distinctiveContent(b)
  const shared = sharedCount(da, db)
  const smaller = Math.min(da.size, db.size)
  const numberShared = [...da].some((w) => w.startsWith('#') && db.has(w))
  return smaller > 0 && ((shared >= 4 && shared / smaller >= 0.4) || (numberShared && shared >= 3))
}

export interface StorySource { id?: unknown; text?: unknown; evidence?: unknown }

/** Distinctive items a beat must share with a stored story to be tagged with it. */
export const STORY_TAG_MIN_SHARED = 2

/**
 * Tag each spoken beat with the ids of the supplied stories it tells — matched
 * on its line, or on cited evidence that quotes the story. Beats that gain a
 * tag are shallow-copied; the rest pass through by reference.
 */
export function tagStorySources(
  beats: readonly IntegrityBeat[] | null | undefined,
  stories: readonly StorySource[] | null | undefined,
): IntegrityBeat[] {
  const list = Array.isArray(beats) ? beats : []
  const src = (Array.isArray(stories) ? stories : [])
    .map((s) => ({ id: String(s?.id ?? '').trim(), text: `${str(s?.text)} ${str(s?.evidence)}`.trim() }))
    .filter((s) => s.id !== '' && s.text !== '')
    .map((s) => ({ ...s, d: distinctiveContent(s.text), n: norm(s.text) }))
  if (src.length === 0) return [...list]
  return list.map((b) => {
    if (!b || typeof b !== 'object' || str(b.line).trim() === '' || str(b.ask).trim() !== '') return b
    const lineD = distinctiveContent(str(b.line))
    const ev = norm(str(b.substance_evidence))
    const ids: string[] = []
    for (const s of src) {
      const quoted = ev.length > 12 && (s.n.includes(ev) || ev.includes(s.n))
      if (quoted || sharedCount(lineD, s.d) >= STORY_TAG_MIN_SHARED) ids.push(s.id)
    }
    if (ids.length === 0) return b
    const prior = Array.isArray(b.source_story_ids) ? (b.source_story_ids as unknown[]).map(String) : []
    return { ...b, source_story_ids: [...new Set([...prior, ...ids])] }
  })
}

function storyIds(b: IntegrityBeat): Set<string> {
  return new Set(Array.isArray(b.source_story_ids)
    ? (b.source_story_ids as unknown[]).map(String).filter((x) => x !== '') : [])
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
}

interface Quantity { value: number; unit: string; raw: string }

/** "$200", "30 free orders", "three customers" → value + the next content word. */
export function quantities(s: string): Quantity[] {
  const out: Quantity[] = []
  const re = /(\$|£|€)?\b(\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred)\b(%?)((?:\s+[A-Za-z'-]+){1,3})?/gi
  for (const m of s.matchAll(re)) {
    const token = m[2]!.toLowerCase()
    const value = token in NUMBER_WORDS ? NUMBER_WORDS[token]! : Number(token.replace(',', ''))
    if (!Number.isFinite(value)) continue
    // A bare "one" is almost always a pronoun ("the one thing") — not a quantity.
    if (token === 'one' && !m[1]) continue
    let unit = m[1] ? 'money' : m[3] ? 'percent' : ''
    if (unit === '') {
      for (const w of String(m[4] ?? '').trim().split(/\s+/)) {
        const lw = w.toLowerCase().replace(/[^a-z]/g, '')
        if (lw.length > 3 && !STOP.has(lw) && !['free', 'more', 'less', 'extra', 'whole', 'full', 'brand', 'new'].includes(lw)) {
          unit = lw.endsWith('s') && lw.length > 4 ? lw.slice(0, -1) : lw
          break
        }
      }
    }
    if (unit === '') continue
    out.push({ value, unit, raw: m[0]! })
  }
  return out
}

const LINE_NOUN = '(?:Collection|Line|Series|Edition|Range|Bundle|Kit|Blend|Formula|Drop|Capsule)'
const NAME_WORD = "[A-Z][A-Za-z0-9'&-]+"
const NOT_A_NAME: ReadonlySet<string> = new Set([
  'The', 'Our', 'My', 'This', 'That', 'These', 'Those', 'A', 'An', 'I', 'Every', 'New', 'Each', 'Your', 'Its',
])

/** Product-line-shaped proper names in a line: "the Autumn Glow Collection". */
export function productLineNames(line: string): string[] {
  const re = new RegExp(`((?:${NAME_WORD}\\s+){1,3})(${LINE_NOUN})\\b`, 'g')
  const out: string[] = []
  for (const m of line.matchAll(re)) {
    const words = m[1]!.trim().split(/\s+/).filter((w) => !NOT_A_NAME.has(w))
    if (words.length === 0) continue
    out.push(`${words.join(' ')} ${m[2]}`)
  }
  return out
}

function isGrounded(name: string, known: string): boolean {
  const k = norm(known)
  if (k === '') return false
  const n = norm(name)
  if (k.includes(n)) return true
  // The descriptive part alone ("Autumn Glow") is enough if she used it.
  const head = norm(name.replace(new RegExp(`\\s+${LINE_NOUN}$`), ''))
  return head !== '' && ` ${k} `.includes(` ${head} `)
}

function isSpoken(b: IntegrityBeat): boolean {
  return str(b.line).trim() !== ''
}
function isAsk(b: IntegrityBeat): boolean {
  return str(b.ask).trim() !== ''
}
const PROTECTED_SECTION = /hook|cta|call to action|outro|sign.?off/i

/**
 * Run every integrity rule. Returns a NEW array; beat objects that change are
 * shallow-copied, untouched ones are passed through by reference.
 */
export function repairScriptIntegrity(
  input: readonly IntegrityBeat[] | null | undefined,
  opts: IntegrityOptions = {},
): { beats: IntegrityBeat[]; report: IntegrityReport } {
  const report: IntegrityReport = {
    headersFilled: 0, fragmentsDropped: 0, terminalsAdded: 0,
    inventedNames: [], namesStripped: 0, duplicatesDropped: 0,
    numbersRestored: 0, numberConflicts: [],
    words: 0, budget: null, trimmedWords: 0, underBy: 0, droppedIndices: [],
  }
  const source = Array.isArray(input) ? input : []
  let origin: number[] = []
  let beats: IntegrityBeat[] = []
  source.forEach((b, i) => { if (b && typeof b === 'object') { beats.push(b); origin.push(i) } else report.droppedIndices.push(i) })

  // ── 1. HEADERS AND WHOLE TEXT ─────────────────────────────────────────────
  // A beat with no section that is only a piece of another beat is a split or a
  // duplicated fragment, never a scene: dropped. Any other headerless beat gets
  // a positional header so no scene can render without one.
  const fullNorm = beats.map((b) => norm(str(b.line)))
  const keep1 = beats.map((b, i) => {
    const line = str(b.line).trim()
    if (line === '' || isAsk(b)) return true
    const headerless = str(b.section).trim() === ''
    const startsMid = /^[a-z,;:—–-]/.test(line)
    if (!headerless && !startsMid) return true
    const me = fullNorm[i]!
    const containedElsewhere = me.length > 0 && fullNorm.some((o, j) => j !== i && o.length > me.length && o.includes(me))
    if (containedElsewhere) { report.fragmentsDropped++; return false }
    return true
  })
  keep1.forEach((k, i) => { if (!k) report.droppedIndices.push(origin[i]!) })
  beats = beats.filter((_, i) => keep1[i])
  origin = origin.filter((_, i) => keep1[i])
  beats = beats.map((b, i) => {
    let next = b
    if (str(b.section).trim() === '') {
      next = { ...next, section: `Beat ${i + 1}` }
      report.headersFilled++
    }
    const line = str(next.line).trim()
    if (line !== '' && !/[.!?…"'”’)]$/.test(line)) {
      next = { ...next, line: `${line}.` }
      report.terminalsAdded++
    }
    return next
  })

  // ── 2. NO INVENTED PRODUCT-LINE NAMES ─────────────────────────────────────
  const known = String(opts.knownText ?? '')
  beats = beats.map((b) => {
    let line = str(b.line)
    if (line === '') return b
    let changed = false
    for (const name of productLineNames(line)) {
      if (isGrounded(name, known)) continue
      report.inventedNames.push(name)
      const noun = name.split(/\s+/).pop()!.toLowerCase()
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`\\b(?:(the|our|my|this|a|an)\\s+)?(?:new\\s+)?${esc}\\b`, 'i')
      line = line.replace(re, (_m, det: string | undefined) => {
        const d = det ? det.toLowerCase() : 'my'
        return `${d === 'a' || d === 'an' ? 'this' : d} ${noun}`
      })
      // Restore sentence-initial capitalisation if the name opened the line.
      line = line.replace(/^([a-z])/, (c) => c.toUpperCase())
      changed = true
      report.namesStripped++
    }
    return changed ? { ...b, line } : b
  })

  // ── 3. A NUMBER THAT DISAGREES WITH HER OWN EVIDENCE TAKES HERS ───────────
  beats = beats.map((b) => {
    const ev = str(b.substance_evidence)
    let line = str(b.line)
    if (ev === '' || line === '') return b
    const evQ = quantities(ev)
    let changed = false
    for (const q of quantities(line)) {
      const hers = evQ.filter((e) => e.unit === q.unit)
      if (hers.length !== 1 || hers[0]!.value === q.value) continue
      const fixed = q.raw.replace(/(\d+(?:[.,]\d+)?|[a-z]+)/i, String(hers[0]!.value))
      line = line.replace(q.raw, fixed)
      report.numbersRestored++
      changed = true
    }
    return changed ? { ...b, line } : b
  })

  // ── 4. ONE STORY, ONE TELLING; ONE FACT, ONE NUMBER ───────────────────────
  const drop = new Set<number>()
  const info = beats.map((b) => ({
    t: terms(str(b.line)),
    q: quantities(str(b.line)),
    ev: norm(str(b.substance_evidence)),
    d: distinctiveContent(str(b.line)),
    stories: storyIds(b),
    spoken: isSpoken(b) && !isAsk(b),
    protectedBeat: PROTECTED_SECTION.test(str(b.section)),
  }))
  for (let i = 0; i < beats.length; i++) {
    if (!info[i]!.spoken || drop.has(i)) continue
    for (let j = i + 1; j < beats.length; j++) {
      if (!info[j]!.spoken || drop.has(j)) continue
      const a = info[i]!
      const b = info[j]!
      let shared = 0
      for (const w of a.t) if (b.t.has(w)) shared++
      const smaller = Math.min(a.t.size, b.t.size)
      const sameEvidence = a.ev !== '' && a.ev.length > 20 && a.ev === b.ev
      // ⚖️ THE SAME STORED STORY in both beats, provided the two lines also
      // share some distinctive content of their own.
      let sameStory = false
      for (const id of a.stories) if (b.stories.has(id)) { sameStory = true; break }
      sameStory = sameStory && sharedCount(a.d, b.d) >= 1
      const paraphrased = sharesDistinctiveContent(str(beats[i]!.line), str(beats[j]!.line))
      const retold = sameEvidence || sameStory || paraphrased
        || (shared >= 4 && smaller > 0 && shared / smaller >= 0.6)
      const conflicts: string[] = []
      for (const qa of a.q) {
        for (const qb of b.q) {
          if (qa.unit === qb.unit && qa.value !== qb.value) conflicts.push(`${qa.raw.trim()} vs ${qb.raw.trim()}`)
        }
      }
      const sameStoryDifferentNumbers = conflicts.length > 0 && (retold || shared >= 2)
      if (!retold && !sameStoryDifferentNumbers) continue
      if (sameStoryDifferentNumbers) report.numberConflicts.push(...conflicts)
      // Drop the later telling unless it carries the hook or the close; then
      // drop the earlier one instead, unless that is protected too.
      const victim = !b.protectedBeat ? j : !a.protectedBeat ? i : -1
      if (victim >= 0) { drop.add(victim); report.duplicatesDropped++ }
      if (victim === i) break
    }
  }
  if (drop.size) {
    for (const i of drop) report.droppedIndices.push(origin[i]!)
    beats = beats.filter((_, i) => !drop.has(i))
    origin = origin.filter((_, i) => !drop.has(i))
  }
  report.droppedIndices.sort((a, b) => a - b)

  // ── 5. THE WORD BUDGET ────────────────────────────────────────────────────
  const count = () => beats.reduce((n, b) => n + wordsOf(str(b.line)), 0)
  report.words = count()
  if (typeof opts.targetSec === 'number' && Number.isFinite(opts.targetSec) && opts.targetSec > 0) {
    const budget = wordBudget(opts.targetSec, opts.wpm)
    report.budget = budget
    let guard = 0
    while (report.words > budget.max && guard++ < 200) {
      // The longest trimmable beat loses its LAST sentence; hook, close and
      // asks are never trimmed, and no beat is trimmed to nothing.
      let best = -1
      let bestWords = 0
      beats.forEach((b, i) => {
        if (i === 0 || i === beats.length - 1 || isAsk(b) || PROTECTED_SECTION.test(str(b.section))) return
        const parts = splitSentences(str(b.line))
        if (parts.length < 2) return
        const w = wordsOf(str(b.line))
        if (w > bestWords) { best = i; bestWords = w }
      })
      if (best < 0) break
      const parts = splitSentences(str(beats[best]!.line))
      const kept = parts.slice(0, -1).join(' ')
      report.trimmedWords += wordsOf(parts[parts.length - 1]!)
      beats = beats.map((b, i) => (i === best ? { ...b, line: kept } : b))
      report.words = count()
    }
    report.underBy = Math.max(0, budget.min - report.words)
  }

  return { beats, report }
}

// ── ITEM 38, THE OTHER DIRECTION: ONE GROUNDED EXTENSION PASS ──────────────
//
// ⚠️ A SHORT SCRIPT WAS ONLY LOGGED. Trimming handles the long side; below 80%
// of the budget the creator got a video far shorter than the length she chose.
//
// ⚖️ LENGTHEN, NEVER INVENT. The edge asks the writer ONCE to lengthen the
// middle beats using only facts already in the prompt. The answer is accepted
// only if (a) it adds no number, and no capitalised name, that is in neither the
// beat it replaces nor the creator's own material, and (b) the whole integrity
// pass run again removes nothing — no duplicate, no invented line name, no
// conflicting number. Otherwise the original stands. Padding with a fabricated
// claim is worse than a short video.

/** Extend when the spoken words are below this share of the target budget. */
export const EXTEND_BELOW_SHARE = 0.8

export interface ExtensionDecision {
  extend: boolean
  words: number
  target: number
  /** Words to add to reach the target (0 when no extension). */
  wordsWanted: number
  /** Indices of the beats the writer may lengthen. */
  indices: number[]
}

/** The middle, spoken, non-ask, non-protected beats — the only ones a pass may touch. */
export function extendableIndices(beats: readonly IntegrityBeat[]): number[] {
  const out: number[] = []
  beats.forEach((b, i) => {
    if (i === 0 || i === beats.length - 1) return
    if (!b || !isSpoken(b) || isAsk(b) || PROTECTED_SECTION.test(str(b.section))) return
    out.push(i)
  })
  return out
}

/** Should the edge run its one extension pass? */
export function shouldExtendScript(
  beats: readonly IntegrityBeat[] | null | undefined,
  targetSec: number | null | undefined,
  wpm?: number | null,
): ExtensionDecision {
  const list = Array.isArray(beats) ? beats.filter((b) => b && typeof b === 'object') : []
  const words = list.reduce((n, b) => n + wordsOf(str(b.line)), 0)
  if (typeof targetSec !== 'number' || !Number.isFinite(targetSec) || targetSec <= 0) {
    return { extend: false, words, target: 0, wordsWanted: 0, indices: [] }
  }
  const target = wordBudget(targetSec, wpm).target
  const indices = extendableIndices(list)
  const extend = words > 0 && words < target * EXTEND_BELOW_SHARE && indices.length > 0
  return { extend, words, target, wordsWanted: extend ? target - words : 0, indices: extend ? indices : [] }
}

/** The instruction for the writer. Facts are exactly what the prompt already supplied. */
export function buildExtensionPrompt(
  beats: readonly IntegrityBeat[],
  decision: ExtensionDecision,
  facts: string,
): string {
  return 'This finished short-form script is too short for the length the creator chose'
    + ` (${decision.words} spoken words; about ${decision.target} are needed).`
    + ` Lengthen ONLY the beats listed below, adding about ${decision.wordsWanted} words in total,`
    + ' spread across them. Use ONLY the facts in SUPPLIED FACTS: say more about what is already'
    + ' there — how, why, what it looked like, what it meant. NEVER add a new number, name, product,'
    + ' customer, result or claim. Keep each beat\'s purpose, voice and position; do not repeat'
    + ' another beat\'s story. Return JSON: {"rewrites":[{"index":<number>,"line":"<new line>"}]}\n\n'
    + `SUPPLIED FACTS:\n${facts.slice(0, 6000)}\n\nBEATS:\n`
    + decision.indices.map((i) => `index ${i}\nSECTION: ${str(beats[i]?.section)}\nLINE: ${str(beats[i]?.line)}`).join('\n\n')
}

const NUM_TOKEN = /\$?\d+(?:[.,]\d+)?%?|\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred)\b/gi

function numberTokens(s: string): Set<string> {
  return new Set([...s.matchAll(NUM_TOKEN)].map((m) => {
    const t = m[0]!.toLowerCase().replace(/[$%,]/g, '')
    return t in NUMBER_WORDS ? String(NUMBER_WORDS[t]) : t
  }))
}

/** Capitalised words that are not sentence-initial ("Etsy", "Gucci"). */
function namedWords(s: string): Set<string> {
  const out = new Set<string>()
  for (const sentence of splitSentences(s)) {
    sentence.split(/\s+/).forEach((w, k) => {
      const clean = w.replace(/[^A-Za-z0-9'-]/g, '')
      if (k === 0 || clean === '' || clean === 'I' || /^I'/.test(clean)) return
      if (/^[A-Z]/.test(clean)) out.add(clean.toLowerCase())
    })
  }
  return out
}

/** What a rewrite introduced that neither its original beat nor the facts contain. */
export function inventedByExtension(original: string, rewrite: string, facts: string): string[] {
  const allowedNums = new Set([...numberTokens(original), ...numberTokens(facts)])
  const known = ` ${norm(facts)} ${norm(original)} `
  const out: string[] = []
  for (const n of numberTokens(rewrite)) if (!allowedNums.has(n)) out.push(n)
  for (const w of namedWords(rewrite)) if (!known.includes(` ${norm(w)} `)) out.push(w)
  return out
}

export interface ExtensionResult {
  accepted: boolean
  reason: 'accepted' | 'no_rewrites' | 'invented' | 'not_longer' | 'integrity_removed'
  beats: IntegrityBeat[]
  report: IntegrityReport | null
  wordsBefore: number
  wordsAfter: number
  invented: string[]
}

/**
 * Apply the writer's rewrites, then RE-VALIDATE: nothing invented, the script
 * actually longer, and a second full integrity pass that has nothing to remove
 * or correct. Any failure returns the original beats untouched.
 */
export function acceptExtension(
  original: readonly IntegrityBeat[],
  rewrites: ReadonlyArray<{ index?: unknown; line?: unknown }> | null | undefined,
  decision: ExtensionDecision,
  opts: IntegrityOptions,
): ExtensionResult {
  const before = original.reduce((n, b) => n + wordsOf(str(b?.line)), 0)
  const keep = (reason: ExtensionResult['reason'], invented: string[] = []): ExtensionResult =>
    ({ accepted: false, reason, beats: [...original], report: null, wordsBefore: before, wordsAfter: before, invented })
  const allowed = new Set(decision.indices)
  const facts = String(opts.knownText ?? '')
  const next = [...original]
  const invented: string[] = []
  let applied = 0
  for (const r of Array.isArray(rewrites) ? rewrites : []) {
    const i = Number(r?.index)
    const line = typeof r?.line === 'string' ? r.line.trim() : ''
    if (!Number.isInteger(i) || !allowed.has(i) || line === '' || !next[i]) continue
    invented.push(...inventedByExtension(str(next[i]!.line), line, facts))
    next[i] = { ...next[i]!, line }
    applied++
  }
  if (applied === 0) return keep('no_rewrites')
  if (invented.length) return keep('invented', [...new Set(invented)])
  const again = repairScriptIntegrity(next, opts)
  const r = again.report
  if (r.droppedIndices.length || r.inventedNames.length || r.numberConflicts.length || r.numbersRestored) {
    return keep('integrity_removed')
  }
  if (r.words <= before) return keep('not_longer')
  return { accepted: true, reason: 'accepted', beats: again.beats, report: r, wordsBefore: before, wordsAfter: r.words, invented: [] }
}
