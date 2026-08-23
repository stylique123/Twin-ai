// THE PROJECT DECIDES ITS SHAPE. NOTHING DOWNSTREAM MAY QUIETLY DISAGREE.
//
// A creator recorded through the teleprompter, which frames them in a portrait
// 9:16 composition, and the file on their phone came back landscape. Nothing
// lied to them on purpose: capture asked for portrait with
// `width: { ideal: 1080 }, height: { ideal: 1920 }`, and `ideal` is a
// PREFERENCE. A browser that cannot satisfy it returns whatever it has —
// commonly 1280x720 — and getUserMedia still resolves successfully.
//
// ⚠️ SO THE CREATOR COMPOSED IN ONE CANVAS AND RECORDED IN ANOTHER. The
// teleprompter frame said 9:16 while the camera wrote 16:9, and every later
// stage inherited the wrong geometry from the file rather than from the intent.
//
// ⚖️ THE INTENT IS UPSTREAM OF THE FILE, ALWAYS. Orientation is never inferred
// from whichever media happened to arrive; the project states it, capture
// negotiates for it, and a capture that cannot meet it is refused BEFORE
// recording rather than cropped afterwards.
//
// ⚠️ AND CSS IS NOT A FIX. Letterboxing a landscape stream inside a portrait
// frame makes the preview agree with the intent while the recorded file still
// disagrees — which is the original defect wearing a costume.

export type AspectIntent = 'portrait_9_16' | 'landscape_16_9'

/** The mobile teleprompter flow is portrait. Stated, not inferred. */
export const DEFAULT_CAPTURE_INTENT: AspectIntent = 'portrait_9_16'

export const INTENT_RATIO: Readonly<Record<AspectIntent, number>> = Object.freeze({
  portrait_9_16: 9 / 16,
  landscape_16_9: 16 / 9,
})

/**
 * How far from the exact ratio still counts as the same shape.
 *
 * ⚖️ SMALL ENOUGH TO REJECT AN ORIENTATION FLIP, LOOSE ENOUGH FOR REAL CAMERAS.
 * 1080x1920 is exactly 0.5625; a 1170x2532 phone sensor is 0.4621 and is still
 * portrait. 1280x720 is 1.7778 and is not. The tolerance must never be widened
 * far enough to admit the second.
 */
export const RATIO_TOLERANCE = 0.12

export function ratioOf(width: unknown, height: unknown): number | null {
  const w = Number(width); const h = Number(height)
  // ⚠️ THE NULL CHECK PRECEDES THE COERCION, and zero height is not a ratio.
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
  return w / h
}

/** Does a measured geometry match what the project asked for? */
export function matchesIntent(width: unknown, height: unknown, intent: AspectIntent): boolean {
  const r = ratioOf(width, height)
  if (r === null) return false
  return Math.abs(r - INTENT_RATIO[intent]) <= RATIO_TOLERANCE
}

/**
 * What to ask the camera for.
 *
 * ⚠️ `exact` RATHER THAN `ideal`, WHICH IS THE WHOLE FIX. An `ideal` constraint
 * that cannot be met succeeds anyway and hands back the wrong shape; an `exact`
 * one rejects with OverconstrainedError, which is a thing we can tell the
 * creator about instead of a thing they discover in the finished file.
 */
export function captureConstraints(intent: AspectIntent, facingMode: string): MediaTrackConstraints {
  const portrait = intent === 'portrait_9_16'
  return {
    facingMode,
    width: { exact: portrait ? 1080 : 1920 },
    height: { exact: portrait ? 1920 : 1080 },
    aspectRatio: { exact: INTENT_RATIO[intent] },
  } as MediaTrackConstraints
}

/**
 * A softer negotiation to try when `exact` is refused outright.
 *
 * ⚖️ STILL NOT `ideal` ON THE RATIO. Some cameras cannot deliver 1080x1920 but
 * can deliver another portrait size; loosening the RESOLUTION is legitimate,
 * loosening the SHAPE is the defect. So the ratio stays exact here.
 */
export function fallbackConstraints(intent: AspectIntent, facingMode: string): MediaTrackConstraints {
  const portrait = intent === 'portrait_9_16'
  return {
    facingMode,
    width: { ideal: portrait ? 1080 : 1920 },
    height: { ideal: portrait ? 1920 : 1080 },
    aspectRatio: { exact: INTENT_RATIO[intent] },
  } as MediaTrackConstraints
}

export type CaptureVerdict =
  | { ok: true; width: number; height: number }
  | { ok: false; reason: 'wrong_shape' | 'unreadable'; message: string; width: number | null; height: number | null }

/**
 * Read back what the camera ACTUALLY gave, and refuse before recording.
 *
 * ⚠️ CHECKED AFTER getUserMedia RESOLVES, because resolving is not agreeing. The
 * old code treated a successful promise as a portrait stream and never looked
 * at videoWidth/videoHeight at all.
 */
export function verifyCapture(width: unknown, height: unknown, intent: AspectIntent): CaptureVerdict {
  const r = ratioOf(width, height)
  if (r === null) {
    return { ok: false, reason: 'unreadable', width: null, height: null,
      message: 'Twin could not tell what shape your camera is recording, so it did not start. Try again, or use a different camera.' }
  }
  if (!matchesIntent(width, height, intent)) {
    const upright = intent === 'portrait_9_16'
    return {
      ok: false, reason: 'wrong_shape', width: Number(width), height: Number(height),
      // Plain English, no ratios, no jargon: what happened and what to do.
      message: upright
        ? 'Your camera is recording a wide picture, but this video is meant to be tall. Turn your phone upright, then start again.'
        : 'Your camera is recording a tall picture, but this video is meant to be wide. Turn your phone sideways, then start again.',
    }
  }
  return { ok: true, width: Number(width), height: Number(height) }
}

/**
 * The one chain that must agree, end to end.
 *
 * ⚠️ EVERY LINK IS COMPARED TO THE INTENT, NOT TO ITS NEIGHBOUR. Comparing each
 * stage only to the one before lets a drift introduced early be ratified by
 * everything after it — which is how a landscape file teaches the whole
 * pipeline that landscape was the plan.
 */
export interface AspectChain {
  intent: AspectIntent
  capture?: { width: number; height: number } | null
  preview?: { width: number; height: number } | null
  plan?: { width: number; height: number } | null
  rendered?: { width: number; height: number } | null
}

export function verifyAspectChain(chain: AspectChain): string[] {
  const problems: string[] = []
  const stages: Array<[keyof AspectChain, string]> = [
    ['capture', 'the recording'], ['preview', 'the preview'],
    ['plan', 'the edit plan'], ['rendered', 'the finished video'],
  ]
  for (const [key, label] of stages) {
    const v = chain[key] as { width: number; height: number } | null | undefined
    // ⚠️ ABSENT IS NOT WRONG. A stage that has not happened yet cannot disagree;
    // reporting it as a mismatch would make every early check fail.
    if (v === null || v === undefined) continue
    if (!matchesIntent(v.width, v.height, chain.intent)) {
      problems.push(`${label} is ${v.width}x${v.height}, which is not the shape this video was recorded for`)
    }
  }
  return problems
}
