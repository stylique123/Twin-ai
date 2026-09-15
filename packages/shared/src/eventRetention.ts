// THE SCRIPT KEPT THE ARGUMENT AND DROPPED THE EVENT.
//
// ⚠️ MEASURED BY THE CREATOR, ON HIS OWN PARAGRAPH. He wrote: "a factory one
// splits and it's rubbish, mine comes back and I fix it." The script kept the
// ARGUMENT — that his binding can be repaired — and dropped the EVENT, the
// thing that happens. Then scene 3 asked him for the story it had just
// discarded.
//
// ⚖️ THIS IS NOT THE SAME QUESTION `paragraphDecomposition` ANSWERS, and the
// leather run is exactly why both are needed. That module measures IDEA
// retention: how many ideas her note held and which one the writer took. On
// this run it would report the idea kept — "repairability" IS the idea. The
// event was still gone. An idea can survive as a claim; an event survives only
// as a moment.
//
// ⚖️ THE WRITER NAMES THE EVENT; THIS DERIVES WHETHER IT SURVIVED. Asking the
// writer "did you keep it?" invites a yes, and a self-graded retention rate
// measures nothing. So the ask is for the event VERBATIM from her note — a
// reading question the writer already did — and survival is then a decidable
// text question answered here, the same division `reference_phrase_overlap`
// already uses: the model supplies the material, we compute the overlap.
//
// ⚠️⚠️ AND IT MEASURES ABSENCE, WHICH IS THE ONLY DIRECTION THAT IS SOUND. If
// none of the event's content words appear anywhere in the script, the event is
// gone — that is certain. The converse is NOT: the argument drawn from an event
// reuses its nouns ("factory", "splits", "repair"), so shared words cannot prove
// the moment survived. So this reports how much of the event is ABSENT and never
// claims the event was kept. A one-directional signal stated as one-directional
// is worth more than a two-directional one that is wrong half the time.
//
// ⚠️ NO DATA EXISTS YET, SO NO RATE IS QUOTED HERE. Nothing has ever asked the
// writer to name the event, exactly as `paragraphDecomposition` shipped against
// "zero of 134 generations carry any decomposition". This is the instrument. The
// rate it produces decides whether anything stronger is earned — and this
// rejects nothing.
import { STOPWORDS } from './script/hookContract.js'

/** ⚠️ A CAP, BECAUSE THIS LANDS IN A ROW. A model asked for one moment can
 *  return a paragraph; unbounded, that is an audit column that grows without
 *  limit. Truncation is recorded rather than silent. */
export const MAX_EVENT_CHARS = 300

/** Below this the "event" is a fragment, not a moment, and its overlap is
 *  noise. Two content words cannot describe something happening. */
export const MIN_EVENT_CONTENT_WORDS = 3

/** How many leading characters of a content word must appear for it to count as
 *  present. Five keeps "splits" / "splitting" together without pairing
 *  everything that starts with "re". See the note in `eventRetention`. */
export const EVENT_STEM_CHARS = 5

export interface EventRetention {
  /** The event the writer found in her note, trimmed. Empty string is never
   *  stored — a note with no event reads as `null` at the call site. */
  readonly event: string
  /** Content words in the event, after stopwords. */
  readonly eventWords: number
  /** How many of those appear NOWHERE in the script. */
  readonly absentWords: number
  /** The absent ones, so a panel can say which. Bounded with the event. */
  readonly absent: readonly string[]
  /** ⚠️ TRUE ONLY WHEN EVERY CONTENT WORD IS GONE. That is the one verdict this
   *  can state with certainty; anything less is reported as a count and left
   *  uninterpreted. */
  readonly whollyAbsent: boolean
  /** Whether `event` was cut at MAX_EVENT_CHARS. */
  readonly truncated: boolean
}

/**
 * Content words, lowercased, de-duplicated, stopwords and short tokens out.
 *
 * ⚠️ THE APOSTROPHE COMES OUT BEFORE THE STOPWORD CHECK, and a test is why. My
 * first version tokenised "it's" whole; `STOPWORDS` holds `it` and `its` but not
 * `it's`, so a contraction of a stopword survived as a CONTENT word and then
 * read as absent from a script that contained the event in full. Normalising
 * first is also what `phraseOverlap.contentSkeleton` already does — one
 * convention for "what counts as a word", not a second one invented here.
 */
export function eventContentWords(text: unknown): string[] {
  if (typeof text !== 'string') return []
  const out = new Set<string>()
  for (const raw of text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) {
    const w = raw.replace(/'/g, '')
    if (w.length < 3) continue
    if (!STOPWORDS.has(w)) out.add(w)
  }
  return [...out]
}

/**
 * How much of the event the writer named is missing from the script it wrote.
 *
 * ⚠️ RETURNS NULL WHEN THERE IS NOTHING TO MEASURE, and the three cases are
 * deliberately not distinguished in the return: no event named, an event too
 * short to be a moment, or a script with no lines. All three mean "this run
 * cannot answer the question", and a zero would read as "the event survived
 * intact" — the confident answer this module exists to avoid.
 */
export function eventRetention(
  eventFromNote: unknown,
  scriptLines: readonly unknown[],
): EventRetention | null {
  // ⚠️ THE NULL CHECK PRECEDES THE COERCION.
  if (typeof eventFromNote !== 'string') return null
  const raw = eventFromNote.trim()
  if (raw === '') return null
  const truncated = raw.length > MAX_EVENT_CHARS
  const event = truncated ? raw.slice(0, MAX_EVENT_CHARS) : raw

  const eventWords = eventContentWords(event)
  if (eventWords.length < MIN_EVENT_CONTENT_WORDS) return null

  const haystack = scriptLines
    .map((l) => (typeof l === 'string' ? l : ''))
    .join(' \n ')
    .toLowerCase()
  if (haystack.trim() === '') return null

  // ⚠️⚠️ A PREFIX MATCH, AND A TEST IS WHY. My first version compared whole
  // words and claimed in a comment that "an inflection counts as present" — it
  // does not: "splits" is NOT a substring of "splitting", they diverge after
  // "split". Two fixtures caught it. That mattered more than a cosmetic miss,
  // because `whollyAbsent` is the one verdict this module states as certain, and
  // an inflection reading as absent would make it fire FALSELY on an event the
  // script kept.
  //
  // ⚖️ PREFIX TOLERANCE, NOT MORPHOLOGY, AND DELIBERATELY SO. A hand-rolled
  // stemmer is what flagged 65% of 60 real scripts when the nominalisation rule
  // first tried it — "sentence" from "send", "comment" from "comes". Five
  // characters of a word is a blunt instrument with a knowable failure mode
  // (it will pair "binding" with "binder", and "factory" with "factor") rather
  // than a clever one with an unbounded set of them.
  //
  // ⚖️ AND IT ERRS TOWARD PRESENT. Every collision makes the absence count
  // SMALLER, never larger, so the only firm verdict stays conservative: when
  // this says the event is wholly gone, a blunt matcher looking for it in five
  // different ways still could not find it.
  const present = (w: string): boolean =>
    haystack.includes(w.length >= EVENT_STEM_CHARS ? w.slice(0, EVENT_STEM_CHARS) : w)
  const absent = eventWords.filter((w) => !present(w))

  return {
    event,
    eventWords: eventWords.length,
    absentWords: absent.length,
    absent,
    whollyAbsent: absent.length === eventWords.length,
    truncated,
  }
}
