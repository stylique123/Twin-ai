// WHAT THE CREATOR CHANGED, AND WHAT IT SAYS ABOUT THEM.
//
// ── THE RICHEST SIGNAL IN THE PRODUCT, THROWN AWAY AT THE SEAM ───────────
//
// `applyDialogueEdit` holds both texts for exactly one expression:
//
//     if (next === normalizeDialogueEdit(scene.dialogue)) return { reason: 'unchanged' }
//
// and then returns only the new script. The BEFORE is discarded. So when a
// creator rewrites
//
//     "This tool dramatically improves productivity."
//   → "This saves me doing the same edit six times."
//
// the product stores the second sentence and forgets that the first one was
// rejected — which is the half that carries the information.
//
// ⚠️ MEASURED: THE SYSTEM HAS 13 REAL CREATOR DECISIONS TO LEARN FROM, and they
// are all hook picks. Every judge, reranker and calibration idea downstream is
// waiting on preference data the product generates continuously and has never
// written down.
//
// ── WHY THIS DESCRIBES THE EDIT RATHER THAN RECORDING IT ─────────────────
//
// ⚖️ `scriptEdit.ts` IS PURE AND STAYS PURE. A database write inside it would
// make every edit path depend on a network call, and an edit that fails to
// record must still change the script — the creator's words are the product,
// the telemetry is not. So this returns a DESCRIPTION and the caller decides
// what to do with it.
//
// ── WHAT IS RECORDED, AND WHAT IS DELIBERATELY NOT ───────────────────────
//
// ⚠️ "generic → concrete" IS A JUDGEMENT AND IS NOT STORED AS ONE. It is the
// interpretation everyone wants, and interpretation recorded at capture time is
// interpretation that cannot be revised when it turns out to be wrong — this
// session produced four broken metrics that would each have been frozen into the
// data. So the pair is stored raw, alongside facts that are decidable from the
// two strings, and the reading is left to whoever analyses it later.

/** One thing a creator changed before filming it. */
export interface ScriptEditRecord {
  /** `hook` or `dialogue` — the two things a creator can rewrite. */
  target: 'hook' | 'dialogue'
  /** Which scene, for dialogue edits. Null for the hook. */
  sceneNumber: number | null
  before: string
  after: string
  /** Decidable facts about the change. See the warning above about judgement. */
  facts: ScriptEditFacts
}

export interface ScriptEditFacts {
  beforeChars: number
  afterChars: number
  beforeWords: number
  afterWords: number
  /** Negative when the creator cut. Creators cutting is itself a finding. */
  wordDelta: number
  /** A measured value present after and absent before — the "concrete" move. */
  addedFigure: boolean
  /** A measured value lost. Rarer, and worth seeing separately. */
  removedFigure: boolean
  /** First person appearing where it was absent: the creator claiming it. */
  addedFirstPerson: boolean
  /** How much of the original survived, 0 to 1. A near-1 edit is a tweak; a
   *  near-0 edit is a rejection, and they should not be averaged together. */
  keptShare: number
}

const FIGURE = /\d[\d,.]*\s*(?:x\b|×|%|k\b|m\b|hours?|minutes?|days?|weeks?|months?|years?|dollars?|subscribers?|followers?|customers?|users?|views?|clients?)|[$£€]\s?\d/i
const FIRST_PERSON = /\b(i|my|me|we|our|us)\b/i

const words = (s: string) => String(s ?? '').toLowerCase()
  .replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean)

/** What is true of this change, from the two strings alone. */
export function describeEditFacts(before: string, after: string): ScriptEditFacts {
  const b = words(before)
  const a = words(after)
  // ⚖️ SHARE OF THE ORIGINAL THAT SURVIVED, not similarity. A creator who keeps
  // every word and appends a clause has kept 100% and changed the line; the two
  // questions are different and only this one is about what was DISCARDED.
  const kept = new Set(a)
  const survived = b.length === 0 ? 0 : b.filter((w) => kept.has(w)).length / b.length
  return {
    beforeChars: String(before ?? '').length,
    afterChars: String(after ?? '').length,
    beforeWords: b.length,
    afterWords: a.length,
    wordDelta: a.length - b.length,
    addedFigure: !FIGURE.test(String(before ?? '')) && FIGURE.test(String(after ?? '')),
    removedFigure: FIGURE.test(String(before ?? '')) && !FIGURE.test(String(after ?? '')),
    addedFirstPerson: !FIRST_PERSON.test(String(before ?? '')) && FIRST_PERSON.test(String(after ?? '')),
    keptShare: Number(survived.toFixed(3)),
  }
}

/**
 * Describe an edit, or return null when there is nothing to learn from.
 *
 * ⚠️ AN EMPTY OR IDENTICAL PAIR IS NOT AN EDIT. `applyDialogueEdit` already
 * rejects those, but this is called from more than one place and a log full of
 * no-op rows is a log nobody trusts.
 */
export function describeEdit(
  target: 'hook' | 'dialogue',
  sceneNumber: number | null,
  before: unknown,
  after: unknown,
): ScriptEditRecord | null {
  const b = typeof before === 'string' ? before.trim() : ''
  const a = typeof after === 'string' ? after.trim() : ''
  if (a === '' || a === b) return null
  return {
    target,
    sceneNumber: target === 'hook' ? null : (typeof sceneNumber === 'number' ? sceneNumber : null),
    before: b,
    after: a,
    facts: describeEditFacts(b, a),
  }
}

/** Roll a set of edits up into the shape a person would read.
 *
 *  ⚖️ COUNTS, NOT AVERAGES. "Mean words removed" across a tweak and a total
 *  rewrite is a number describing neither. */
export function editSummary(records: readonly ScriptEditRecord[]): {
  edits: number; cuts: number; expansions: number
  addedFigure: number; addedFirstPerson: number; rewrites: number
} {
  return {
    edits: records.length,
    cuts: records.filter((r) => r.facts.wordDelta < 0).length,
    expansions: records.filter((r) => r.facts.wordDelta > 0).length,
    addedFigure: records.filter((r) => r.facts.addedFigure).length,
    addedFirstPerson: records.filter((r) => r.facts.addedFirstPerson).length,
    // A rewrite keeps less than a third of the original words: the creator did
    // not adjust the line, they replaced it.
    rewrites: records.filter((r) => r.facts.keptShare < 0.34).length,
  }
}
