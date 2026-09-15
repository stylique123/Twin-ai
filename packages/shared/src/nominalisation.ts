// TWIN WRITES "repairability". HE SAYS "it comes back and I fix it".
//
// ⚠️ THE OWNER'S MEASUREMENT, FROM THIRTEEN RUNS ON ONE CRAFT ACCOUNT:
// nominalisation is the tell that separates the good scripts from the weak
// ones. Not a style preference — a reliable discriminator:
//
//   good                                          weak
//   "It goes in the bin. That is the              "disposability"
//    actual end of it."
//   "I stood there holding a sheet pan."          "I felt overwhelmed"
//   "A glued binding is disposable."              "Consistency is the
//                                                  foundation of success"
//
// Every weak one is a thing a report says and a person does not.
//
// ⚖️ THIS DETECTS, IT DOES NOT REWRITE. The owner asked twice how a
// replacement would be chosen — a curated synonym map or a model call — and
// that question is unanswered, so nothing here answers it. Detection needs no
// answer: naming the word is enough for a prompt instruction and for a guard,
// and a rewriter built on a guess would put our verb where her sentence was.
//
// ⚠️ THE FAILURE MODE THAT MATTERS IS A FALSE POSITIVE ON HER OWN CRAFT. The
// owner's condition, verbatim: "validate against the eight good scripts before
// merging — if it flags anything in those, the rule is wrong. Oxford hollow,
// saddle stitch and signatures have no verb form and must survive." A rule that
// flags a bookbinder's vocabulary would delete the exact technical accuracy
// Part 9 records as working, so precision beats recall here and the suffix set
// is deliberately narrow.

/**
 * ⚖️ ONLY THE SUFFIXES THAT ARE ALMOST ALWAYS DERIVED FROM A VERB OR AN
 * ADJECTIVE THAT HAS ONE. `-ability`/`-ibility` are the strongest: they are
 * built from `-able`/`-ible`, which is itself built from a verb, so a word
 * ending in them nearly always has a verb form to go back to — repairability →
 * can be repaired, disposability → goes in the bin.
 *
 * ⚠️ `-ure`, `-age`, `-al` AND `-ing` ARE DELIBERATELY ABSENT. `signature`,
 * `binding`, `stitching` and `material` are objects and processes a
 * bookbinder names, not abstractions standing in for verbs. Including them is
 * how this rule would flag "I sew the pages into signatures" — a sentence the
 * owner's report quotes as among the best Twin has written.
 */
export const NOMINALISING_SUFFIXES = Object.freeze([
  'ability', 'ibility',
] as const)

/**
 * The abstractions measured in real output, each with the verb it displaced.
 *
 * ⚠️ THESE ARE OBSERVED, NOT IMAGINED. Every entry was written by Twin into a
 * script or a panel the owner read. A speculative list would be a vocabulary
 * we invented for a problem we had not seen.
 *
 * ⚖️ THE VERB IS RECORDED FOR THE READER, NEVER APPLIED. It says WHY the word
 * is flagged — "there is a verb here" is the whole claim — and gives a human
 * something to work from. Nothing in this module substitutes it.
 */
export const OBSERVED_NOMINALISATIONS: Readonly<Record<string, string>> = Object.freeze({
  repairability: 'it can be repaired',
  durability: 'it lasts',
  disposability: 'it goes in the bin',
  consistency: 'it is the same every time',
  reliability: 'it does not let you down',
  // ⚠️ TWO WORDS, AND THE SECOND IS THE NOMINALISED ONE. "nutrient density"
  // reads as a compound, so a per-word check misses it unless the head noun is
  // listed on its own.
  density: 'how much is in it',
  // From the panel text, not a script: "the reasoning remains unclear".
  reasoning: 'why',
})

/**
 * Words that LOOK abstract and are not, because they name a thing or an act
 * with no verb behind them.
 *
 * ⚠️ THE OWNER NAMED THREE AND THEY ARE THE TEST, NOT THE LIST. `Oxford
 * hollow`, `saddle stitch` and `signatures` must survive. They survive here by
 * construction — none carries a listed suffix and none is a listed word — so
 * this set exists for the cases that WOULD collide, and it is checked before
 * anything else so a domain term can never be flagged by a later rule.
 */
export const CRAFT_EXEMPT: ReadonlySet<string> = Object.freeze(new Set([
  // Bookbinding, from the measured session.
  'signature', 'signatures', 'hollow', 'stitch', 'stitching', 'binding',
  'tapes', 'boards', 'endpapers', 'headband', 'gilding',
  // Terms of art whose -ability IS the accepted name of the thing, where no
  // plainer verb phrase exists. Kept explicitly rather than by suffix, so
  // adding one is a decision somebody makes on purpose.
  'accessibility', 'availability',
]))

export interface NominalisationHit {
  /** The word as it appeared, lowercased. */
  readonly word: string
  /** The verb it displaced, when the word is one of the observed set. */
  readonly verb: string | null
  /** Why it was flagged: a listed word, or a suffix rule. */
  readonly by: 'observed' | 'suffix'
}

/** Words, lowercased, punctuation stripped, hyphens kept as separators. */
function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[^a-z']+/).filter((w) => w.length > 2)
}

/**
 * Every nominalised abstraction in a piece of script text.
 *
 * ⚠️ THE EXEMPT CHECK COMES FIRST AND THE NULL CHECK BEFORE THE COERCION.
 * A non-string is not an empty script: it is a caller passing something this
 * cannot judge, and returning "no problems found" for it would report a clean
 * result for text nobody read.
 */
export function nominalisationsIn(text: unknown): NominalisationHit[] {
  if (typeof text !== 'string' || text.trim() === '') return []
  const seen = new Set<string>()
  const hits: NominalisationHit[] = []
  for (const w of wordsOf(text)) {
    if (seen.has(w) || CRAFT_EXEMPT.has(w)) continue
    const observed = Object.prototype.hasOwnProperty.call(OBSERVED_NOMINALISATIONS, w)
    if (observed) {
      seen.add(w)
      hits.push({ word: w, verb: OBSERVED_NOMINALISATIONS[w], by: 'observed' })
      continue
    }
    if (NOMINALISING_SUFFIXES.some((s) => w.endsWith(s) && w.length > s.length + 2)) {
      seen.add(w)
      hits.push({ word: w, verb: null, by: 'suffix' })
    }
  }
  return hits
}

/** Does this text read like a report rather than a person? */
export function hasNominalisation(text: unknown): boolean {
  return nominalisationsIn(text).length > 0
}
