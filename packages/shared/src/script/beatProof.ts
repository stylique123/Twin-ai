/**
 * THE SHOOTING NOTE THAT WAS THROWN AWAY.
 *
 * ⚠️ THE THIRD FIELD FOUND WRITTEN-BUT-UNREAD, and the pattern is now a class.
 * `beat_plan[].proof` is required by the writer's schema, and 20 of the 20
 * planned beats in production carry one. `proofAt()` exists in beatPlan.ts,
 * is tested, and HAS ZERO CALLERS. The Plan screen never sees the field at all,
 * because its normaliser rebuilds the blueprint field by field and does not
 * name `beat_plan` — the same discard that hid `visual_hook`.
 *
 * What is being thrown away is real direction:
 *
 *   "Creator stepping closer to the camera, lowering their voice slightly
 *    for a serious, coaching tone."
 *
 * ⚠️⚠️ AND IT CANNOT SIMPLY BE RENDERED, WHICH IS THE WHOLE JUDGMENT. Of the
 * same 20, two say this:
 *
 *   "Screen recording of a finger deleting a social media draft."
 *   "B-roll of a boring, generic office cubicle setting."
 *
 * Those are the two things this product has decided it does NOT make. Showing
 * the field raw would hand a creator an instruction to shoot footage Twin will
 * not produce and they may not be able to supply — turning a silent discard
 * into a loud broken promise, which is worse.
 *
 * ⚖️ SO THE RULE IS: SHOW WHAT THE CREATOR PERFORMS, NEVER WHAT SOMEBODY ELSE
 * WOULD HAVE TO FILM. A note qualifies only when it describes the person in
 * front of the camera, and never when it asks for separate footage. On the 20
 * real proofs this shows 12 and withholds 8, and every one of the 20 is pinned
 * in the tests.
 *
 * ⚖️ WITHHELD IS NOT WRONG. A footage request is not a defect in the writer —
 * it is a good idea this product has scoped out. Nothing is flagged, corrected
 * or reported to the creator about it; the note is simply absent, exactly as it
 * was before, and the creator loses nothing they had.
 */

/**
 * ⚠️ CHECKED FIRST, AND IT WINS. A note may describe BOTH a performance and a
 * cutaway ("straight to camera, then b-roll of the office"). If the footage
 * test ran second, that note would show and the b-roll instruction would ride
 * in on the back of a legitimate one.
 */
const SOMEBODY_ELSE_FILMS_IT = [
  'b-roll',
  'broll',
  'b roll',
  'stock footage',
  'stock clip',
  'visuals of',
  'footage of',
  'montage',
  'graph showing',
  'chart',
  'screen recording',
  'screen capture',
  'screencast',
  'clip of',
]

/**
 * ⚠️ THE CREATOR'S OWN BODY, VOICE AND FRAMING. Every entry names something the
 * person being filmed does or how they are shot — never a separate asset.
 */
const THE_CREATOR_PERFORMS_IT = [
  'camera',
  'lens',
  'eye contact',
  'gesture',
  'voice',
  'tone',
  'expression',
  'framing',
  'angle',
  'direct address',
  'pointing',
  'leaning',
  'stepping',
]

function has(hay: string, needles: readonly string[]): boolean {
  return needles.some((n) => hay.includes(n))
}

/**
 * The shooting note to show beside a beat, or `null` when there is nothing this
 * creator can act on.
 *
 * ⚠️ `unknown` IN, because this is persisted jsonb written by older builds, and
 * THE TYPE CHECK PRECEDES EVERYTHING: a non-string can never be lowercased into
 * a match.
 */
export function shootingNote(proof: unknown): string | null {
  if (typeof proof !== 'string') return null
  const text = proof.trim()
  if (!text) return null
  const hay = text.toLowerCase()
  // ⚠️ ORDER IS THE RULE. Out-of-scope wins over a performance mention.
  if (has(hay, SOMEBODY_ELSE_FILMS_IT)) return null
  if (!has(hay, THE_CREATOR_PERFORMS_IT)) return null
  return text
}

/** Read the proof for one beat out of a stored `beat_plan`, already filtered. */
export function shootingNoteAt(beatPlan: unknown, index: number): string | null {
  if (!Array.isArray(beatPlan)) return null
  const beat = beatPlan[index]
  if (!beat || typeof beat !== 'object' || Array.isArray(beat)) return null
  return shootingNote((beat as Record<string, unknown>).proof)
}
