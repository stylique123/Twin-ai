// THE VISUAL PASS RAN ON 940 REFERENCES AND THE SCREEN SAID WE NEVER LOOKED.
//
// ⚠️ THE OWNER'S REPORT, FROM THE SCREEN: the framing, camera and pacing rows on
// a reference read "not observed", and the question was the right one — "if
// everything is already picked up and extracted why can't you just put them
// there?"
//
// ⚠️⚠️ BECAUSE `MISSING_EVIDENCE_TYPES` IS A HARD-CODED LIST AND NOTHING EVER
// REVISITED IT. `transferRows` emits every type on that list as `unknown` with
// "We did not analyse the video — your brand default is used instead.",
// unconditionally, because the evidence set never contained them.
// `creativeTransferRows.ts` says so in its own header: the nine things "we never
// look at". That was TRUE when it was written. The visual pass shipped after it.
//
// MEASURED ON PRODUCTION 2026-09-15:
//   reference_content_profiles rows .............. 2,140
//   carrying a visual_profile .....................  940
//   frames sampled ................................  940
//   newest assessment ............................. today
//   a real row's own tally ........... fieldsObserved 14, fieldsUnreadable 2
//
// Fourteen fields, each carrying the frame numbers it was read from, while the
// creator-facing screen said we had not analysed the video.
//
// ⚖️ AND ONLY THREE OF THE SIX GAPS CAN HONESTLY BE FILLED. This is the part
// worth being exact about, because filling all six would be the fabrication
// `creativeTransferRows` exists to prevent:
//
//   camera_distance_movement ... YES — camera.shotType + camera.positionChanges
//   subject_framing ............ YES — camera.framingChanges + camera.shotType
//   shot_semantics ............. YES — primaryMode + performance.*
//   zoom_frequency_intensity ... NO. There is no zoom field. The owner named
//                                zooms specifically and the honest answer is
//                                that nothing measures them; inventing a value
//                                from shotType changes would be a guess wearing
//                                a citation.
//   music_energy_beat_alignment  NO. Frames carry no audio.
//   silence_and_visual_waste ... NO. Never measured.
//
// ⚠️⚠️ AND THESE ARE `interpreted`, NOT `observed`. A model reading four frames
// and calling the shot "close" is a READING, not a measurement — the exact
// distinction `creativeTransferRows` refuses to collapse: "only the platform and
// language are `observed`... collapsing it back would UPGRADE 'a model read the
// transcript this way' to 'we observed this'." Same rule, same reason, one
// medium over. `creativeTransferPlan` still refuses to let an `interpreted` row
// carry a transfer on its own, which is correct and unchanged.

import type { EvidenceItem, EvidenceType } from './referenceEvidence'

/** One readable field of the stored visual profile. */
interface VisualField {
  value?: unknown
  evidence?: { frames?: unknown }
}

const fieldOf = (o: unknown, key: string): VisualField | null => {
  if (!o || typeof o !== 'object') return null
  const v = (o as Record<string, unknown>)[key]
  return v && typeof v === 'object' ? (v as VisualField) : null
}

const framesOf = (f: VisualField | null): number[] => {
  const raw = f?.evidence?.frames
  return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number') : []
}

/** A field counts only when it carries a real value. `null` is the visual pass's
 *  own word for "I looked and could not tell", which must stay unknown. */
const readable = (f: VisualField | null): boolean =>
  !!f && f.value !== null && f.value !== undefined

/**
 * What the creator is told, with the frames it came from.
 *
 * ⚖️ THE FRAME NUMBERS ARE THE WHOLE POINT. §1.1's rule is that every row
 * carries its evidence and "a row with no source sentence is the fabricated
 * row". The visual profile stores the frames per field, so the citation is real
 * and checkable rather than a claim that a pass happened.
 */
export function visualSourceSentence(frames: readonly number[], framesSampled: number | null): string {
  const n = typeof framesSampled === 'number' && framesSampled > 0 ? framesSampled : null
  if (frames.length === 0) {
    return n === null
      ? 'Read from the video’s frames.'
      : `Read from the ${n} frames we sampled.`
  }
  const list = frames.length === 1
    ? `frame ${frames[0]}`
    : `frames ${frames.slice(0, -1).join(', ')} and ${frames[frames.length - 1]}`
  return n === null
    ? `Read from ${list}.`
    : `Read from ${list} of the ${n} we sampled.`
}

/** Human-readable value for a camera/framing/mode reading. */
function describe(parts: ReadonlyArray<[string, unknown]>): string {
  return parts
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([label, v]) => (typeof v === 'boolean' ? (v ? label : `no ${label}`) : `${label} ${String(v)}`))
    .join(', ')
}

export interface VisualEvidenceRow {
  type: EvidenceType
  value: string
  frames: number[]
}

/**
 * The gap rows the stored visual profile can honestly answer.
 *
 * Returns ONLY the three it can. A profile that failed, never ran, or read
 * nothing usable returns an empty list, and every row stays "not observed" —
 * which is the truthful state and the one this screen exists to show.
 */
export function visualEvidenceRows(visualProfile: unknown): VisualEvidenceRow[] {
  if (!visualProfile || typeof visualProfile !== 'object') return []
  const vp = visualProfile as Record<string, unknown>
  // ⚠️ `visualPassRan` IS NOT A SYNONYM FOR "there is something to say". A pass
  // that ran and read nothing must not turn six honest gaps into six rows
  // citing frames that told us nothing.
  if (vp.visualPassRan !== true) return []

  const camera = vp.camera
  const shotType = fieldOf(camera, 'shotType')
  const positionChanges = fieldOf(camera, 'positionChanges')
  const framingChanges = fieldOf(camera, 'framingChanges')
  const primaryMode = fieldOf(vp, 'primaryMode')
  const perf = vp.performance
  const talkingHead = fieldOf(perf, 'talkingHead')
  const productInteraction = fieldOf(perf, 'productInteraction')

  const out: VisualEvidenceRow[] = []

  // Distance AND movement, which is what the type is called.
  if (readable(shotType) || readable(positionChanges)) {
    out.push({
      type: 'camera_distance_movement',
      value: describe([
        ['shot', readable(shotType) ? shotType!.value : null],
        ['camera moves', readable(positionChanges) ? positionChanges!.value : null],
      ]),
      frames: [...new Set([...framesOf(shotType), ...framesOf(positionChanges)])].sort((a, b) => a - b),
    })
  }

  if (readable(framingChanges) || readable(shotType)) {
    out.push({
      type: 'subject_framing',
      value: describe([
        ['framing', readable(shotType) ? shotType!.value : null],
        ['framing changes', readable(framingChanges) ? framingChanges!.value : null],
      ]),
      frames: [...new Set([...framesOf(framingChanges), ...framesOf(shotType)])].sort((a, b) => a - b),
    })
  }

  if (readable(primaryMode) || readable(talkingHead)) {
    out.push({
      type: 'shot_semantics',
      value: describe([
        ['mode', readable(primaryMode) ? String(primaryMode!.value).replace(/_/g, ' ') : null],
        ['product handled', readable(productInteraction) ? productInteraction!.value : null],
      ]),
      frames: [...new Set([...framesOf(primaryMode), ...framesOf(talkingHead)])].sort((a, b) => a - b),
    })
  }

  return out.filter((r) => r.value !== '')
}

/**
 * Those rows as `EvidenceItem`s, so `transferRows` can consume them exactly like
 * any other evidence rather than growing a second path.
 *
 * ⚠️ `interpreted`, NEVER `observed`. See the header: a model reading frames is
 * a reading.
 */
export function visualEvidenceItems(
  visualProfile: unknown,
  ids: { referenceId: string; analysisId: string },
): EvidenceItem[] {
  // ⚖️ THE FRAME SENTENCE IS BUILT BY THE CALLER, NOT HERE. `transferRows` owns
  // the row's `source` text and already has `framesSampled`; computing it twice
  // is how two sentences about one reading come to disagree. `tsc` caught the
  // leftover local, which is the compiler earning its place.
  return visualEvidenceRows(visualProfile).map((r) => ({
    evidenceId: `${ids.analysisId}:${r.type}:0`,
    referenceId: ids.referenceId,
    analysisId: ids.analysisId,
    type: r.type,
    kind: 'interpreted' as const,
    value: r.value,
    sourcePath: `visual_profile.${r.type === 'shot_semantics' ? 'primaryMode' : 'camera'}`,
    // ⚠️ THE FRAMES ARE NOT SECONDS. A frame index is an ordinal into what we
    // sampled, not a timestamp into the video, and `reference_frames` stores
    // `at_seconds` separately. Writing the index here would put "4" in a field
    // every other row means as a time.
    atSec: null,
    // ⚖️ NON-NULL EXACTLY WHEN kind === 'unknown', which these are not. The
    // frame citation rides `sourcePath` and `visualSourceSentence`, because
    // `unknownReason` means "why there is no value" and there IS a value.
    unknownReason: null,
  }))
}
