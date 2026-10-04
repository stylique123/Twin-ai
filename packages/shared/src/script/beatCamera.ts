/**
 * WHICH CAMERA FILMS THIS BEAT — DECIDED, NOT SUGGESTED.
 *
 * ⚠️ AUDIT 2026-10-03 (12-part batch, Part 12). The writer is asked for a
 * `camera` on every beat, and the label was effectively always `front`: only
 * 45% of spoken beats carried one at all, and 30 of 34 demonstration beats
 * ("Turn the bag slowly to show the side profile") said `front`. A label that
 * never changes carries no information, so the creator flipped nothing.
 *
 * ⚖️ SO THE LABEL IS NOW DERIVED FROM WHAT THE BEAT DOES, AFTER WRITING, THE
 * SAME WAY EVERY TIME. The writer's own label is not trusted either way:
 *   - hook, talking and close beats are `front` (her face carries them);
 *   - a demonstration, a screen, a process, her hands at work or a close-up of
 *     the product is `back` (she flips to the rear camera for it);
 *   - a missing label is derived by the same rule;
 *   - exactly one label per scene: a beat is filmed with one camera, never
 *     "front, then back" inside one take.
 *
 * Pure: no model call, no I/O. Shared by the writer (edge) and the test-viewer
 * rewrite (worker), generated into both.
 */

export type BeatCamera = 'front' | 'back'

export interface CameraBeat {
  section?: unknown
  line?: unknown
  action_posing?: unknown
  direction?: unknown
  cuts_info?: unknown
  shown_job?: unknown
  camera?: unknown
}

/** Sections that are always her face: the opening, the talk, the ask. */
const FRONT_SECTION = /\b(hook|re-?hook|cta|call to action|close|closing|outro|ask|sign[- ]?off)\b/i

/** Shown jobs that are a showing of the thing itself (same set as shownJob's SHOWING_JOBS). */
const BACK_JOBS = new Set(['demo', 'sensory', 'process', 'app_payoff'])

// ⚠️ "HANDS" ALONE IS NOT A DEMONSTRATION — "hands open, palms up" is a talking
// gesture. A hand counts only when it is the subject of the shot or is doing
// a process verb. Same for "turn": "turn to the lens" is talk, "turn the bag" is not.
const BACK_ACTION = new RegExp([
  // a screen in shot
  String.raw`\b(?:screen|laptop|monitor|dashboard|desktop|browser|tablet|keyboard)\b`,
  String.raw`\b(?:scroll(?:s|ing)?|tap(?:s|ping)?|click(?:s|ing)?)\b`,
  // a close-up / the back camera named outright
  String.raw`\bclose[- ]?ups?\b`, String.raw`\bclose (?:on|in on)\b`, String.raw`\bmacro\b`, String.raw`\bback camera\b`, String.raw`\brear camera\b`, String.raw`\boverhead\b`, String.raw`\bpov\b`,
  // hands as the subject
  String.raw`\b(?:her|your|my|the) hands (?:pour|grind|pack|scoop|stir|mix|work|press|fold|measure|weigh|open|show|turn|hold the)`,
  String.raw`\bhands in (?:frame|shot)\b`, String.raw`\bon (?:her|your|my|the) hands\b`,
  // a process verb
  String.raw`\b(?:pour|pours|pouring|grind|grinds|grinding|scoop|scoops|scooping|stir|stirs|stirring|whisk|whisking|weigh|weighs|weighing|measur(?:e|es|ing)|chop|chops|chopping|slic(?:e|es|ing)|knead(?:s|ing)?|plat(?:e|es|ing) (?:the|it|up)|pack(?:s|ing)? (?:the|a|it)|roast(?:s|ing)? (?:the|a)|brew(?:s|ing)?|tamp(?:s|ing)?|demonstrat\w*|unbox\w*|assembl\w*)\b`,
  // showing the product's detail
  String.raw`\b(?:turn|turns|turning|rotate|rotates|rotating|tilt|tilts|tilting|open|opens|opening|flip|flips|flipping) (?:the|it|this|her|a) (?!camera|lens|phone camera)\w+`,
  String.raw`\bshow(?:s|ing)? (?:the|how|it|this|what|off) (?!camera|lens)`,
  String.raw`\b(?:texture|label|side profile|the beans|the grounds|the ingredients)\b`,
].join('|'), 'i')

const FACE_TO_LENS = /\b(?:eye contact|to (?:the )?(?:lens|camera)|into (?:the )?(?:lens|camera)|at (?:the )?(?:lens|camera)|lean(?:s|ing)? in|open palms?|talking head|nods?|smiles? at)\b/i

const text = (v: unknown) => (typeof v === 'string' ? v : '')

/**
 * The one camera for this beat. `index`/`total` let the first and last spoken
 * beats count as hook and close when the section name says neither.
 */
export function cameraForBeat(beat: CameraBeat, index = -1, total = -1): BeatCamera {
  const section = text(beat.section)
  if (FRONT_SECTION.test(section)) return 'front'
  if (index === 0) return 'front'
  if (total > 0 && index === total - 1) return 'front'
  const job = text(beat.shown_job).trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (job === 'cta') return 'front'
  // ⚖️ THE ACTION OUTRANKS A 'talk' JOB: the audit's "turn the bag slowly"
  // beats were filed as talk too. What her hands do is what the lens needs.
  const doing = [beat.action_posing, beat.direction, beat.cuts_info].map(text).join(' • ')
  // ⚠️ BATCH PART-13 (2026-10-04): the reviewer's most repeated camera note was
  // a beat marked back camera while its direction is her face ("hold eye
  // contact", "lean in to the lens", open palms). Her face to the lens with no
  // product action is the front camera, whatever the job says.
  if (FACE_TO_LENS.test(doing) && !BACK_ACTION.test(doing)) return 'front'
  if (/\b(?:demo|demonstration|process|how it works|in use|step)\b/i.test(section)) return 'back'
  if (BACK_JOBS.has(job)) return 'back'
  return BACK_ACTION.test(doing) ? 'back' : 'front'
}

export interface CameraDecision<T> {
  script: T[]
  /** Beats whose label changed (including a missing label filled in). */
  changed: number
  /** Beats that had no usable label at all. */
  missing: number
  front: number
  back: number
}

/** Decide every spoken beat's camera. Returns new beat objects; never mutates. */
export function decideBeatCameras<T extends CameraBeat>(script: readonly T[]): CameraDecision<T> {
  const spoken = script.map((b, i) => (text(b?.line).trim() ? i : -1)).filter((i) => i >= 0)
  let changed = 0, missing = 0, front = 0, back = 0
  const out = script.map((b, i) => {
    const pos = spoken.indexOf(i)
    if (pos < 0 || !b || typeof b !== 'object') return b
    const cam = cameraForBeat(b, pos, spoken.length)
    const had = text(b.camera).trim().toLowerCase()
    if (had !== 'front' && had !== 'back') missing += 1
    if (had !== cam) changed += 1
    if (cam === 'back') back += 1; else front += 1
    return had === cam && b.camera === cam ? b : { ...b, camera: cam }
  })
  return { script: out, changed, missing, front, back }
}
