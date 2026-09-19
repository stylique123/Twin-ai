// CONFIRM WHAT THE SCAN ALREADY FOUND, INSTEAD OF ASKING FOR IT AGAIN.
//
// ── THE PROBLEM ───────────────────────────────────────────────────────────
//
// Every creator reaching the story step sees three blank boxes, including the
// creator whose transcripts already yielded the answer. That is asking for
// something Twin already has. Where an extracted item genuinely fills a slot,
// the creator should be shown it and asked to confirm — one tap instead of
// three paragraphs — and only the slots the scan could NOT fill stay blank.
//
// ── WHAT THE STORE ACTUALLY RECORDS, AND WHAT IT DOES NOT ─────────────────
//
// `creator_knowledge` rows carry: kind, text, basis, source, confidence,
// times_seen, source_ref, source_url, last_observed_at, surface_forms. That is
// the whole vocabulary available here.
//
// ⚠️ NONE OF THOSE FIELDS RECORDS WHAT THE THREE QUESTIONS ACTUALLY ASK FOR.
// `kind` separates opinion from experience from claim; `basis` says how well
// attested; `source` says which pipeline. Nothing anywhere records "this went
// against what everyone believes", "this cost me something", or "this was MY
// result". The three slots are distinctions the extractor never drew, so any
// mapping from a stored item to a slot is a heuristic over free text — and a
// heuristic is only allowed here if it is measurably precise, because the
// failure mode is not a missing suggestion. It is a creator confirming a
// mis-slotted sentence without reading it, after which the writer treats
// somebody else's claim as this creator's own lived experience. A wrong
// prefill is strictly worse than a blank box.
//
// ── WHAT WAS MEASURED, ON THE REAL STORE (930 rows, 22 creators) ──────────
//
// 539 caption rows, 391 transcript rows, ZERO `asked` rows.
//
//   expensive_lesson  NOT PREFILLABLE. Of 69 stated `experience` items, ONE
//                     carries any cost/mistake/loss/regret marker at all. The
//                     extractor writes experiences as flat biography —
//                     "Currently works at Microsoft", "Admits to not having a
//                     personal skincare routine" — not as lessons with a price
//                     attached. There is nothing here to confirm.
//
//   contrarian        NOT PREFILLABLE. Of 129 stated `opinion` items, ZERO name
//                     a consensus and contradict it ("most people think…",
//                     "conventional wisdom…", "the myth that…"). The extractor
//                     flattens stances into bare assertions — "Believes
//                     Pakistani chai is better than coffee" — which drops
//                     exactly the half of the sentence this question asks for.
//                     A loose marker ("rather than", "instead of") does hit 20
//                     rows, but reading them shows they are comparisons, not
//                     contrasts with a belief: "True success is inner peace
//                     rather than accumulating wealth". Prefilling from those
//                     would put a mild preference in the creator's mouth as a
//                     fighting position.
//
//   best_result       PREFILLABLE, NARROWLY. An achievement verb co-occurring
//                     with a figure hits 7 rows across 3 of 22 creators, and
//                     reading all 7 they are mostly the creator's own result:
//                     "Sold a black Birkin bag for £13,500 in roughly 40
//                     seconds" — which is, verbatim, the shape the question's
//                     own hint asks for.
//
// ⚖️ SO THIS SUGGESTS ONE SLOT, NOT THREE, AND THAT IS THE HONEST CEILING OF
// THE DATA rather than a first cut to be widened later. Widening it means
// finding a marker that is actually discriminating; it does not mean relaxing
// these. A caption-only creator still sees all three blank boxes — and that is
// exactly the creator who most needs to be asked.
//
// ── WHAT CHANGED, AND WHAT DID NOT ────────────────────────────────────────
//
// The measurement above stands and is reproduced: on the live store today,
// 69 stated `experience` rows still yield ONE cost marker and 129 stated
// `opinion` rows still yield ZERO named consensuses. Nothing about those rows
// improved, and this module still refuses to mine them.
//
// ⚖️ WHAT CHANGED IS THE EXTRACTOR, NOT THE HEURISTIC. `creator_knowledge` now
// carries two recorded fields — `cost` (what a thing took from them) and
// `consensus` (the belief they named and argued against) — because the
// extraction prompt now asks for them. Both are written ONLY from speech and
// only when the creator said the thing outright.
//
// That is why `expensive_lesson` and `contrarian` become fillable here without
// loosening anything. The old objection was that slotting them meant a
// heuristic over free text, and "a wrong prefill is strictly worse than a blank
// box". These two slots are no longer filled by a heuristic at all: they are
// filled by a field the extractor was asked for and either recorded or left
// null. `best_result` still has no such field and still uses its measured
// ACHIEVEMENT + FIGURE regex, unchanged.
//
// ⚠️ AND EVERY EXISTING GUARD STILL APPLIES TO ALL THREE. Transcript-and-stated
// only, never re-offering an `asked:` row, `SOMEONE_ELSES` on every slot, and
// storable-as-typed. A row whose `cost` is null is not a lesson with a small
// price; it is a row nobody recorded a price for, and it is not offered.
//
// ⚠️ UNMEASURED, SAID PLAINLY: no row in production carries `cost` or
// `consensus` yet, because no scan has run against the new prompt. Until one
// does, these two branches are correct code over an empty column and the yield
// is UNKNOWN — not zero, and certainly not the improvement it is designed to
// be. The frozen fixture test pins the contract; only a real scan can pin the
// rate.
import { ANSWER_MAX, ANSWER_MIN, type CreatorQuestion } from './creatorQuestions'

/** The subset of a stored row this module reads. Deliberately narrow: anything
 *  it does not name, it cannot accidentally come to depend on. */
export interface StoredKnowledgeItem {
  /** The row's id, so a confirmation can mark THIS row rather than create one. */
  id?: string | null
  kind: string
  text: string
  basis?: string | null
  source?: string | null
  source_ref?: string | null
  /** What it cost them, as the extractor recorded it. Null/absent means nobody
   *  recorded a cost — never "it was cheap". */
  cost?: string | null
  /** The belief they named and argued against. Null/absent means they never
   *  named one — never "they argue with nobody". */
  consensus?: string | null
  /** ONE sentence of her own speech supporting this row (0216 on main). Absent
   *  on rows written before it, and on every caption row by construction. */
  evidence?: string | null
  /** 0219. When she personally confirmed it. A confirmed row is not offered
   *  again — she has already told us it is right, and asking twice wastes the
   *  one screen where her attention is cheap. */
  creator_confirmed_at?: string | null
}

/** One extracted item shown back to her.
 *
 * ⚠️⚠️ IT IS NOT AN ANSWER TO THE QUESTION AND MUST NOT BE TREATED AS ONE. See
 * 0219: the row already exists, so confirming it adds no supply, and letting it
 * close the question would mean she is never asked for the story we DO NOT have.
 * It is shown for two reasons, both of which survive that rule — it jogs the
 * memory the blank box was asking her to search cold, and it says what NOT to
 * repeat. */
export interface StorySuggestion {
  /** Which of the three slots it was matched against. */
  questionId: string
  /** The row it came from, so confirming marks THAT row. Absent on a row stored
   *  before ids were selected here, and then confirmation is simply not offered
   *  — a confirmation that cannot be attributed is not worth collecting. */
  id?: string | null
  /** The creator's own material, as the store holds it. */
  text: string
  /** The sentence she was heard saying it in, when one was recorded (0216).
   *
   *  ⚖️ THIS IS WHAT MAKES THE CARD CREDIBLE RATHER THAN UNCANNY. A distillate
   *  offered back cold — "charges £400 because cheap rebinds fail" — reads as a
   *  thing the machine decided about her. The same line under her own sentence
   *  is a quote she can check in one glance. */
  evidence?: string | null
}

/** The slots this module can fill. `best_result` from the measured regex over
 *  free text; the other two ONLY from a recorded field. See the note above. */
export const SUGGESTIBLE_SLOTS: readonly string[] = Object.freeze([
  'best_result', 'expensive_lesson', 'contrarian',
])

/** How many already-known lines one slot may show.
 *
 * ⚠️ IT WAS ONE, AND ONE IS THE WRONG NUMBER FOR BOTH JOBS THIS CARD NOW DOES.
 * As a memory aid, a single line barely jogs anything; as a statement of what we
 * already have — which is what stops her re-telling a story the store holds —
 * one line understates it and she repeats something we already had.
 *
 * ⚖️ THREE, NOT MORE. Past three the screen becomes a reading task, which is the
 * failure mode this is trying to leave, pointing the other way. */
export const MAX_SUGGESTIONS_PER_SLOT = 3

/** ⚠️ ONLY SPOKEN MATERIAL MAY BE OFFERED BACK. A caption proves a video was
 *  made, never what it concluded, which is why caption extraction is clamped to
 *  `demonstrated`. Offering a caption-derived line as "we found this in your
 *  videos — is this right?" would invite the creator to attest to a sentence
 *  nobody ever said out loud. */
function isSpokenAndStated(item: StoredKnowledgeItem): boolean {
  return item.source === 'transcript' && item.basis === 'stated'
}

/** ⚠️ NEVER RE-OFFER WHAT THE CREATOR ALREADY STATED. A row whose `source_ref`
 *  is `asked:<id>` came from this very question; handing it back for
 *  confirmation would be the product asking someone to agree with themselves. */
function isAlreadyAsked(item: StoredKnowledgeItem): boolean {
  return typeof item.source_ref === 'string' && item.source_ref.startsWith('asked:')
}

/** An achievement the creator can reasonably claim, carrying a figure.
 *
 *  ⚖️ BOTH HALVES ARE REQUIRED. A figure alone catches "Worked in a liquor store
 *  at the age of 33"; an achievement verb alone catches every opinion about
 *  building things. Together they caught 7 rows on the real store and 5 of the
 *  7 read as the creator's own result. */
const ACHIEVEMENT = /\b(scaled|grew|generated|earned|sold|hit|reached|went from|took .+ from)\b/i
const FIGURE = /\d/

/** ⚠️ AND A NAMED THIRD PARTY DISQUALIFIES IT. The two misses in the measured
 *  seven were both other people's numbers — "The Early app grew from zero to
 *  over $50,000 a month", "Invested $500,000 in an 18-year-old entrepreneur who
 *  had built a $30 million business". Confirmed, either would hand the writer
 *  somebody else's result as this creator's proof, which is the precise failure
 *  ("a famous influencer's framework in the creator's mouth") this whole column
 *  exists to prevent. */
const SOMEONE_ELSES = /\b(invested in|invested \$?[\d,]+ in|on behalf of|his client|her client|their client|a client named|the .{2,30} app\b|works? with over)\b/i

/** A non-empty recorded field, normalised. Absent, null, blank and
 *  whitespace-only all collapse to null — the extractor emitting "" for a field
 *  it had nothing for must not read as a recorded value. */
function recorded(v: string | null | undefined): string | null {
  const t = String(v ?? '').trim().replace(/\s+/g, ' ')
  return t === '' ? null : t
}

/** ⚠️ THE COST MAKES THE LESSON, SO A ROW WITHOUT ONE IS NOT ONE. This is the
 *  whole reason the field was added: an `experience` with no recorded cost is
 *  the flat biography the old store was full of ("Currently works at
 *  Microsoft"), and offering that under "what did you learn the expensive way"
 *  would ask a creator to confirm a lesson they never described. */
function fillsExpensiveLesson(item: StoredKnowledgeItem): string | null {
  if (item.kind !== 'experience') return null
  const cost = recorded(item.cost)
  if (cost === null) return null
  if (SOMEONE_ELSES.test(item.text ?? '') || SOMEONE_ELSES.test(cost)) return null
  const text = recorded(item.text)
  return text === null ? null : `${text} — it cost ${cost}`
}

/** ⚠️ AND THE CONSENSUS MAKES THE STANCE. An `opinion` with no named consensus
 *  is a bare assertion, which is what 129 of 129 stored opinions are. */
function fillsContrarian(item: StoredKnowledgeItem): string | null {
  if (item.kind !== 'opinion') return null
  const consensus = recorded(item.consensus)
  if (consensus === null) return null
  if (SOMEONE_ELSES.test(item.text ?? '') || SOMEONE_ELSES.test(consensus)) return null
  const text = recorded(item.text)
  // ⚖️ WHAT THEY BELIEVE, THEN WHAT THE CREATOR BELIEVES INSTEAD — the order
  // the question itself asks for ("Name what they believe, then what you
  // believe instead"). A suggestion carrying only the creator's half answers
  // half a question.
  return text === null ? null : `Most people think ${consensus}. ${text}`
}

/**
 * ⚖️ ONE DECISION POINT PER SLOT, RETURNING THE LINE RATHER THAN A BOOLEAN.
 *
 * An earlier shape had a `fills…` predicate and a separate composer, and both
 * re-checked whether the field was recorded. Two places deciding one question
 * is how the answers start disagreeing — and it made the predicate's own guard
 * dead code, which a mutation run caught: deleting "the cost must be recorded"
 * changed nothing, because the composer refused it a second time. A guard that
 * can be deleted without breaking anything is not a guard. So each slot now has
 * exactly one function, it returns the composed line or null, and every reason
 * to refuse lives in it.
 */
function fillsBestResultLine(item: StoredKnowledgeItem): string | null {
  return fillsBestResult(item) ? recorded(item.text) : null
}

function fillsBestResult(item: StoredKnowledgeItem): boolean {
  if (item.kind !== 'experience' && item.kind !== 'claim') return false
  const text = item.text ?? ''
  if (SOMEONE_ELSES.test(text)) return false
  return ACHIEVEMENT.test(text) && FIGURE.test(text)
}

/** ⚠️ A SUGGESTION MUST BE STORABLE AS TYPED. If the creator confirms it, it
 *  goes through `answerToKnowledge`, which refuses anything outside
 *  ANSWER_MIN..ANSWER_MAX. Offering a line that would be refused on confirm
 *  turns a one-tap yes into an error message the creator cannot fix. */
function isStorable(text: string): boolean {
  const clean = text.trim().replace(/\s+/g, ' ')
  return clean.length >= ANSWER_MIN && clean.length <= ANSWER_MAX
}

/**
 * The suggestion for each of the three slots, where one exists.
 *
 * ⚠️ `discarded` AND `alreadyPut` BOTH SUPPRESS. A discarded suggestion must
 * not come straight back — that is the whole meaning of discarding it — and a
 * slot already answered or skipped is a closed decision either way.
 *
 * ⚖️ RETURNS A MAP KEYED BY QUESTION ID, AND A MISSING KEY MEANS "ASK". The
 * caller renders a blank box for every slot this does not fill, which makes the
 * no-data path — every caption-only creator — the default rather than a branch
 * somebody has to remember to write.
 */
export function suggestStoryAnswers(
  questions: readonly CreatorQuestion[],
  items: readonly StoredKnowledgeItem[],
  opts: { discarded?: readonly string[] } = {},
): Record<string, StorySuggestion[]> {
  const discarded = new Set((opts.discarded ?? []).map(String))
  const usable = (items ?? []).filter(
    (it) => it && typeof it.text === 'string' && isSpokenAndStated(it) && !isAlreadyAsked(it)
      // ⚠️ AND NOT ONE SHE HAS ALREADY CONFIRMED (0219). She has told us this
      // row is right; showing it again spends the one screen where her attention
      // is cheap on a question she has answered, and makes the product look like
      // it was not listening.
      && !recorded(it.creator_confirmed_at),
  )
  const out: Record<string, StorySuggestion[]> = {}

  for (const q of questions ?? []) {
    if (!q || discarded.has(q.id)) continue
    // ⚠️ STILL EXHAUSTIVE BY OMISSION. A slot with no predicate gets no branch
    // and therefore no suggestion — a blank box — rather than an empty branch
    // that reads as an oversight. `SUGGESTIBLE_SLOTS` names exactly the three
    // with a predicate, and the parity test holds the two in step.
    const fills = q.id === 'best_result' ? fillsBestResultLine
      : q.id === 'expensive_lesson' ? fillsExpensiveLesson
      : q.id === 'contrarian' ? fillsContrarian
      : null
    if (!fills) continue
    const found: StorySuggestion[] = []
    const seen = new Set<string>()
    for (const it of usable) {
      // ⚠️ `isStorable` IS APPLIED TO THE COMPOSED LINE, NOT TO THE TEXT ALONE.
      // The join is what gets stored on confirm, and two halves that each fit
      // can exceed ANSWER_MAX together. A blank box is the honest fallback.
      const composed = fills(it)
      if (!composed || !isStorable(composed)) continue
      // Two rows can distil to the same line — paraphrase merging collapses
      // re-wordings, not every restatement — and showing one line twice makes a
      // choice look like a bug.
      const key = composed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      found.push({
        questionId: q.id,
        id: recorded(it.id) ?? undefined,
        text: composed,
        evidence: recorded(it.evidence) ?? undefined,
      })
      if (found.length >= MAX_SUGGESTIONS_PER_SLOT) break
    }
    if (found.length > 0) out[q.id] = found
  }
  return out
}
