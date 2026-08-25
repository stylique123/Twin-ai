// GENERATED FROM packages/shared/src/script/shotLabel.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
/**
 * A SHOT CARD MUST SAY WHAT THE SHOT IS.
 *
 * ⚠️ MEASURED IN PRODUCTION, NOT INFERRED FROM THE SCREENSHOT. Across 223
 * shot-list entries, NINETY-EIGHT — 44% — carry a bare ordinal in `shot`: "1",
 * "2", "3". The card renders that field as the card's title, so a creator
 * scanning their shot list sees a card whose heading is "2".
 *
 * ⚖️ AND THE ROW IS NOT EMPTY, WHICH IS WHY THIS IS REPAIRABLE RATHER THAN A
 * REFUSAL. Every numbered row still carries `shot_type` and real `notes`
 * ("Cover frame. High contrast, serious expression."). The description was
 * always there; only the name was a number.
 *
 * ⚠️ THE OLDER ROWS NAMED THEIR SHOTS AND HAVE NO `shot_type` AT ALL — "A-roll
 * Hook", "B-roll Authority", "Medium framing". So this is not a model that
 * degraded: the schema gained `shot_type` and the naming habit went with it.
 * Which means the type is exactly what the name should be derived from.
 *
 * ⚖️ DERIVED, NEVER INVENTED. Everything below comes from fields already on the
 * row. Nothing here calls a model, and nothing describes a shot the row does not
 * already describe.
 */

/** ⚠️ PLAIN EVERYDAY ENGLISH. A creator reading their shot list should not have
 *  to learn "cover_frame" to know what to point the camera at. */
const BY_TYPE: Record<string, string> = {
  talking_head: 'You, on camera',
  cover_frame: 'The still for the thumbnail',
  b_roll: 'Cutaway',
}

/** Is this "name" actually just the shot's position in the list? */
export function isBareOrdinal(shot: unknown): boolean {
  return /^\s*\d+\s*[.)]?\s*$/.test(String(shot ?? ''))
}

/**
 * What the card should call this shot.
 *
 * ⚖️ THE ORDER IS DELIBERATE. A real name the writer chose wins; then the type,
 * which is a fact about the row; then the framing, which at least tells the
 * creator where to stand. The position in the list is the LAST resort, and it is
 * spelled as a position — "Shot 2" — rather than left as a naked "2", because a
 * heading that is a number reads as a bug and a heading that says "Shot 2" reads
 * as a list.
 */
export function shotLabel(
  shot: unknown,
  shotType?: unknown,
  framing?: unknown,
  index?: number,
): string {
  const named = String(shot ?? '').trim()
  if (named !== '' && !isBareOrdinal(named)) return named

  const t = String(shotType ?? '').trim().toLowerCase()
  if (t !== '' && BY_TYPE[t]) return BY_TYPE[t]

  // ⚠️ FRAMING IS A FALLBACK, NOT A NAME, so it is used only when it is short
  // enough to read as a heading. "Medium close-up" is a heading; a sentence
  // about lighting is not.
  const f = String(framing ?? '').trim()
  if (f !== '' && f.length <= 28 && !f.includes('.')) return f

  // ⚖️ THE POSITION, SPELLED OUT. Prefers the number the writer already put in
  // the field over the render index, so the card agrees with whatever the
  // creator saw elsewhere.
  const fromField = named.replace(/[^\d]/g, '')
  const n = fromField !== '' ? Number(fromField) : (typeof index === 'number' ? index + 1 : null)
  return n === null || !Number.isFinite(n) ? 'Shot' : `Shot ${n}`
}
