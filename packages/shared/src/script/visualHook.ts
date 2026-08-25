/**
 * THE FIRST SECOND, DELIVERED TO THE PERSON WHO HAS TO SHOOT IT.
 *
 * ⚠️ MEASURED BEFORE ANY OF THIS WAS WRITTEN. The writer has been producing a
 * `visual_hook` — `opening_frame` plus `why_it_interrupts` — and 4 of the 4
 * generations that carry one carry it COMPLETE. Nothing was wrong with the
 * field. What was wrong is that NOTHING READ IT: zero references in the web
 * app, the shared package or the worker, and the Plan screen's normaliser
 * rebuilds the blueprint field by field, so it was discarded on arrival. The
 * model was asked what the first second looks like, answered, and the answer
 * was thrown away every time.
 *
 * ⚖️ THIS IS WHY THE SPEC'S PREMISE WAS DROPPED. The fix was written up as
 * "visual_hook completeness". Completeness is not the defect — 4 of 4 are
 * complete. Delivery is.
 *
 * ⚠️ ABSENT IS NOT EMPTY. 37 of 41 generations predate the field entirely.
 * Those creators were never promised a first-second plan, and rendering "none"
 * or "not specified" at them would report a gap that does not exist. An absent
 * visual hook means the card is not there at all.
 */

export interface VisualHook {
  /** What is on screen in the first second. */
  openingFrame: string
  /** Why that interrupts a scroll. */
  whyItInterrupts: string
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Read a stored `visual_hook`. `unknown` in, because this is persisted jsonb
 * written by older builds and a structured parameter type would invite callers
 * to trust a shape nobody validated.
 *
 * ⚠️ HALF A VISUAL HOOK IS NOT A VISUAL HOOK. A frame with no reason is a
 * direction the creator cannot judge; a reason with no frame is a claim about
 * a shot that was never described. Either alone reads as a finished plan on a
 * card, so both are required and a half one is treated as absent.
 */
export function readVisualHook(value: unknown): VisualHook | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  const openingFrame = text(v.opening_frame)
  const whyItInterrupts = text(v.why_it_interrupts)
  if (!openingFrame || !whyItInterrupts) return null
  return { openingFrame, whyItInterrupts }
}
