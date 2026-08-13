// HOW LONG A BEAT IS MEANT TO BE, DECIDED RATHER THAN DERIVED.
//
// ── THE DEFECT ────────────────────────────────────────────────────────────
//
// `recordingScriptAdapter` makes ONE scene per `script[]` entry, and each
// scene's length is `estimateDurationSec(line, wpm)` — the words in that entry
// divided by a speaking rate. So the chain is:
//
//   the model decides how much text goes in an entry
//     → the adapter turns every entry into exactly one take
//       → length is computed from the word count AFTERWARDS
//
// Nothing anywhere reasons about how long a beat SHOULD be. A six-word line and
// a forty-word line each become one scene and one take, which is exactly the
// "sometimes one line, sometimes twice as long" a creator feels while filming.
// It is not the model misbehaving. No rule exists for it to follow.
//
// ── THE FIX, AND WHY IT LIVES IN THE SAME MODEL CALL ──────────────────────
//
// The blueprint response now carries a `beat_plan`: what each beat is FOR, how
// long it is meant to run, what kind of shot it is, and what makes it
// believable. The writer writes TO those targets, so `duration_sec` becomes a
// length the words were written to fit instead of a number computed after the
// fact.
//
// It is a field of the EXISTING call rather than a separate planning call, and
// that is a deliberate trade. `generate-blueprint`'s own comments record a real
// outage: a slow model ran 60-90s, timed out on both attempts, and a paying
// creator saw "We hit a snag" with their credit spent. The two attempts are
// sized 75s + 55s to fit under the edge ceiling. Spending another round trip on
// planning would put that ceiling back in play to buy an ordering the schema
// can express for free — a required field the model fills before it writes.
//
// ── WHY A MISMATCHED PLAN IS REFUSED WHOLE ────────────────────────────────
//
// The plan is only usable if it lines up with the script one-to-one. If the
// model returns 5 beats and 7 script entries, there is no honest way to know
// WHICH beat each entry belongs to, and guessing means silently giving a line
// the wrong target — a creator told to speak for six seconds on a beat planned
// for sixteen, with nothing indicating anything went wrong.
//
// So a misaligned plan is discarded ENTIRELY and every scene falls back to the
// estimator. Today's behaviour is a known quantity; a half-applied plan is not.
// Same rule as the renderer refusing a clip-count mismatch rather than
// truncating to the shorter of the two.

/** One planned beat, as the model returns it. Every field arrives as a string:
 *  the blueprint schema is Gemini's OpenAPI subset, which this repo uses with
 *  STRING throughout (see `b_roll_stats`, whose counts are strings too). */
export interface RawBeat {
  beat?: unknown
  target_sec?: unknown
  proof?: unknown
}

export interface PlannedBeat {
  /** Plain-language purpose. What this beat is FOR. */
  beat: string
  /** The decided length. Null when the model gave something unusable — and null
   *  is NOT zero: it means "no target", so the estimator answers instead. */
  targetSec: number | null
  // ⚠️ `sceneType` WAS HERE AND IS DELIBERATELY GONE. It was required of the
  // model on every generation, parsed into this shape, and read by nothing. The
  // comment that stood in its place explained exactly why no reader was ever
  // written: "deliberately not an enum. The teleprompter already routes on the
  // script's own structure, and a content-type enum is the retired archetype
  // trap; this is a hint for the shoot plan, not a router."
  //
  // ⚖️ SO IT WAS REMOVED RATHER THAN WIRED. That comment is a documented
  // decision not to branch on it, and inventing a router now to satisfy the
  // every-field-needs-a-reader rule would be obeying the rule by breaking the
  // reason for it. The remaining honest option is to stop asking the model for
  // a value nobody may act on. `RecordingScene.scene_type` still exists and is
  // still derived where it always was.
  /** What makes this beat believable: a screen, an object, a number, a story. */
  proof: string
}

/** A beat shorter than this cannot be spoken; longer than this is not a beat.
 *  Bounds exist so one absurd number cannot pace a whole take — a "0.2" or a
 *  "600" reaches the teleprompter as a countdown the creator cannot act on. */
export const MIN_BEAT_SEC = 1.5
export const MAX_BEAT_SEC = 90

/**
 * Read a target length from whatever the model returned.
 *
 * Accepts "8", "8s", "8 sec", "~8", "8-10" (takes the FIRST number, because the
 * lower bound of a range is the one a creator can actually hit). Returns null
 * for prose, for a missing value, and for anything outside the bounds.
 *
 * NULL IS NOT ZERO. A beat with no readable target is a beat the estimator
 * handles, not a beat of length zero — and a zero would reach `sceneTimeCapSec`
 * as a recording cap that stops the take instantly.
 */
export function parseTargetSec(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= MIN_BEAT_SEC && value <= MAX_BEAT_SEC
      ? Math.round(value * 10) / 10
      : null
  }
  if (typeof value !== 'string') return null
  const m = value.match(/\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  if (!Number.isFinite(n) || n < MIN_BEAT_SEC || n > MAX_BEAT_SEC) return null
  return Math.round(n * 10) / 10
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Turn the raw beats into planned ones, or return null.
 *
 * `scriptLength` is what the plan must agree with. The one-to-one requirement is
 * the whole safety property: it is what lets the adapter map beat *i* to script
 * entry *i* without inventing an association.
 */
export function readBeatPlan(raw: unknown, scriptLength: number): PlannedBeat[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  // A plan that does not line up is refused whole rather than applied in part.
  if (raw.length !== scriptLength) return null

  const beats: PlannedBeat[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const b = item as RawBeat
    beats.push({
      beat: text(b.beat),
      targetSec: parseTargetSec(b.target_sec),
      proof: text(b.proof),
    })
  }
  // A plan where NOTHING parsed is not a plan. It would pass every beat through
  // to the estimator while claiming a plan was applied, so the surfaces that
  // show "planned length" would show the derived one and call it planned.
  if (beats.every((b) => b.targetSec === null)) return null
  return beats
}

/**
 * The length a scene should use.
 *
 * The estimator stays the fallback rather than being replaced, because a plan
 * is a target and the words are the thing that actually gets spoken. When the
 * model gave no usable target for this beat, the words still have to be paced.
 */
export function beatDurationSec(
  plan: PlannedBeat[] | null,
  index: number,
  fallback: number,
): number {
  const target = plan?.[index]?.targetSec
  return typeof target === 'number' ? target : fallback
}

/** Proof that is worth showing a creator who is about to film.
 *
 *  ⚠️ A MODEL ASKED FOR A REQUIRED FIELD ALWAYS FILLS IT. `proof` is mandatory in
 *  the blueprint schema, so a beat that genuinely needs no proof still comes back
 *  with something in the slot — "n/a", "none", "-", or the word "proof" itself.
 *  Rendering those puts a row reading "What makes this land: N/A" on the card a
 *  person is holding while filming, which is worse than the row being absent: it
 *  trains them to skip the row that sometimes says something real.
 *
 *  ⚖️ REJECTED, NOT REWRITTEN. There is no honest way to invent the proof the
 *  model did not give, and an empty string here means exactly what an absent
 *  `proof` means downstream — nothing to show — which keeps one meaning for one
 *  absence.
 *
 *  A bracketed token is a failed field for the same reason it is a failed script
 *  line: it is a stand-in that reached the creator instead of a value. */
const NON_PROOF = /^(?:n\/?a|none|nil|null|no(?:ne)? needed|not applicable|proof|tbd|-+|\.+)$/i

/** ⚠️ THE MODEL ANSWERS A DIFFERENT QUESTION, MEASURED ON 192 REAL PROOFS ACROSS
 *  206 BEATS. `proof` is documented as what makes the beat believable — a screen,
 *  the object in hand, a number. What came back:
 *
 *      23  the `substance` enum verbatim ("creator_knowledge", "general")
 *     107  source prose ("Creator's stated knowledge of wealth paths")
 *      18  the beat's PURPOSE restated ("Establishes the problem")
 *      ~6  something a person could actually film
 *
 *  Two of those three wrong answers are questions the blueprint asks ELSEWHERE —
 *  `substance` records where the substance came from, `beat` records what the
 *  beat is for — so `proof` was collapsing into a duplicate of its neighbours.
 *
 *  ⚖️ DECIDABLE, SO CHECKED RATHER THAN ONLY ASKED. The prompt now forbids all
 *  three shapes by name, but a prompt rule is a request and this defect is
 *  decidable from the string: an enum member is exact, a source is a prefix, and
 *  a purpose opens with an effect verb. The classifier is what will say whether
 *  the prompt fix worked, on real generations, without anybody re-reading 192
 *  strings by hand. */
const SUBSTANCE_ENUM = /^(?:creator_knowledge|creator_experience|creator_opinion|product_dna|general|needs_user)$/i
const NAMES_A_SOURCE = /^(?:the\s+)?(?:creator'\s?s?\b|creators'\b|creator\s+(?:experience|knowledge|expertise|opinion)\b|general (?:knowledge|observation)\b|product_dna\b|reference structure\b|specific knowledge\b)/i
const NAMES_AN_EFFECT = /^(?:establishes?|sets? up|provides?|guides?|engages?|introduces?|explains?|concludes?|reinforces?|builds?|creates?|delivers?|summari[sz]es?|transitions?|highlights?|emphasi[sz]es?)\b/i

export type ProofQuality = 'shootable' | 'substance_enum' | 'names_a_source' | 'names_an_effect' | 'absent'

/** What KIND of answer the model gave. A measurement, not a gate — nothing is
 *  refused on it, because a wrong proof costs a row on a card and refusing a
 *  whole generation over one would be wildly out of proportion. */
export function proofQuality(value: string | null | undefined): ProofQuality {
  const t = (value ?? '').trim()
  if (!t || NON_PROOF.test(t) || /^\[[^\]]*\]$/.test(t)) return 'absent'
  if (SUBSTANCE_ENUM.test(t)) return 'substance_enum'
  if (NAMES_A_SOURCE.test(t)) return 'names_a_source'
  if (NAMES_AN_EFFECT.test(t)) return 'names_an_effect'
  return 'shootable'
}

export function readProof(value: string | null | undefined): string {
  const t = (value ?? '').trim()
  if (!t) return ''
  if (NON_PROOF.test(t)) return ''
  // A wholly bracketed value is a placeholder, never a proof.
  if (/^\[[^\]]*\]$/.test(t)) return ''
  return t
}

/**
 * The proof for a beat, by SOURCE index into the script.
 *
 * Indexed exactly like `beatDurationSec`, and for the same reason: the plan is
 * aligned to `blueprint.script`, not to whatever survived a caller's filter.
 * Pairing a proof with the wrong beat would tell a creator to hold up the object
 * during the beat that has no object in it.
 */
export function proofAt(plan: PlannedBeat[] | null, index: number): string {
  const p = plan?.[index]?.proof
  // Only a shootable answer is a proof. The other three shapes are the model
  // answering a neighbouring field's question, and passing one through would put
  // "creator_knowledge" on a card somebody reads with a camera up.
  return proofQuality(p) === 'shootable' ? readProof(p) : ''
}

/** How the plan's proofs came back, counted. This is `proof`'s reader until the
 *  quality supports showing it to a creator: on the corpus that exposed the
 *  defect it would report 6 shootable out of 192, and a surface fed by that is a
 *  surface that is wrong five times out of six. */
export function proofQualityCounts(
  plan: PlannedBeat[] | null,
): Record<ProofQuality, number> {
  const out: Record<ProofQuality, number> = {
    shootable: 0, substance_enum: 0, names_a_source: 0, names_an_effect: 0, absent: 0,
  }
  for (const b of plan ?? []) out[proofQuality(b.proof)]++
  return out
}

/**
 * What the beat is FOR, by source index — the plan's own sentence.
 *
 * Passed through the same non-value filter as `proof`, and for the same reason:
 * `beat` is required of the model, so a beat it had nothing to say about still
 * comes back with "n/a" in the slot, and an empty string here lets the caller
 * fall back to the section label instead of rendering "Why this scene matters:
 * N/A" on a card somebody is reading with a camera up.
 */
export function purposeAt(plan: PlannedBeat[] | null, index: number): string {
  return readProof(plan?.[index]?.beat)
}

/**
 * How far a scene's words have drifted from the length that was planned for it.
 *
 * Reads the SCENE rather than the plan, because that is where the question is
 * actually asked. `applyDialogueEdit` re-estimates `duration_sec` the moment a
 * creator edits, so by the time drift exists the plan object is long gone — the
 * scene is the only thing that still holds both numbers.
 *
 * Returns null when the scene carries no target. An unanswerable comparison
 * must not render as agreement: "no drift" and "nothing to compare" are
 * different facts, and only one of them means the line is the right length.
 */
export function sceneOverrunSec(
  scene: { duration_sec?: number | null; target_sec?: number | null },
): number | null {
  const target = scene.target_sec
  const live = scene.duration_sec
  if (typeof target !== 'number' || typeof live !== 'number') return null
  return Math.round((live - target) * 10) / 10
}

/** Drift small enough to ignore. A beat planned for 6 seconds that estimates at
 *  6.4 is not a problem a creator should be asked to solve, and flagging it
 *  would train them to ignore the indicator that matters. */
export const OVERRUN_TOLERANCE_SEC = 1.5

/** Worth telling the creator about. Deliberately one-sided: running LONG is what
 *  costs a viewer, and a beat that comes in short usually just means they were
 *  concise. */
export function overrunWorthShowing(overrunSec: number | null): boolean {
  return typeof overrunSec === 'number' && overrunSec > OVERRUN_TOLERANCE_SEC
}
