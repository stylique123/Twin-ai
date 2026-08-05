// FEEDING §7c's CRAFT CHECKS FROM WHAT A RENDER ACTUALLY PRODUCED.
//
// `craftChecks.ts` is deliberately a pure function over a plain facts object,
// so that the plan, the render evidence or an API could each supply it. This is
// the adapter that does: it reads the PINNED PLAN (owner-readable, `edit_plans`)
// and the DURABLE EVENT TRAIL (`edit_events`), and fills in only what those two
// genuinely contain.
//
// ── WHAT IT REFUSES TO SUPPLY ────────────────────────────────────────────
//
// Every field is optional in `CraftFacts` for one reason: a missing measurement
// must reach the checker AS MISSING, so it reports `not_checked` rather than a
// pass. So this adapter never substitutes, never defaults, and never derives a
// number from a different number that happens to be nearby. If the plan does
// not carry a fact, the fact does not arrive.
//
// ── THE LOUDNESS IS REAL, AND THAT IS THE INTERESTING PART ───────────────
//
// `audio_loudness` is the only check backed by a measurement of the ENCODED
// FILE rather than of the plan's intentions. Phase 9 item 4 measures what the
// encoder actually delivered and appends it to the event trail as
// `audio_measured` — so it is readable, and this check runs on evidence rather
// than on what the plan asked for. Everything else compares the plan to itself,
// which is worth less and is not pretended otherwise.
import type { CraftFacts } from './craftChecks'

/** The parts of a pinned EditPlan this reads. Typed structurally rather than
 *  imported: the plan contract lives in the worker, and the client's copy of
 *  it would be a second authority on a hashed document. */
export interface PlanLike {
  output?: { durationMs?: unknown; width?: unknown; height?: unknown } | null
  timeline?: { cutsPerMinuteMilli?: unknown } | null
  audio?: { targetLufsMilli?: unknown; toleranceLuMilli?: unknown } | null
  captions?: {
    marginVerticalPx?: unknown
    cues?: Array<{ outputStartMs?: unknown; outputEndMs?: unknown }> | null
  } | null
  video?: {
    framing?: {
      safeTopPx?: unknown; safeBottomPx?: unknown
      safeLeftPx?: unknown; safeRightPx?: unknown
    } | null
  } | null
  hook?: { title?: { outputEndMs?: unknown } | null } | null
}

export interface EventLike {
  message_code?: unknown
  details?: unknown
}

const int = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) ? v : null

/**
 * The delivered loudness, from the event trail.
 *
 * READS THE LAST `audio_measured`, because a project can be re-rendered and the
 * newest measurement is the one describing the file that exists. Reading the
 * first would report a number about bytes that have been replaced.
 */
export function measuredLufsFromEvents(events: readonly EventLike[]): number | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]?.message_code !== 'audio_measured') continue
    const d = events[i].details as Record<string, unknown> | null | undefined
    const v = int(d?.integratedLufsMilli)
    if (v !== null) return v
  }
  return null
}

/**
 * Turn a plan (and optionally its events) into craft facts.
 *
 * `firstWordAtMs` and `hookLandsAtMs` are read from the CAPTION CUES, which is
 * the honest available proxy and is labelled as one:
 *
 *   - the first cue's START is when words first appear, which is when the
 *     viewer stops waiting. It is not literally the first phoneme, and the
 *     difference is a few tens of milliseconds against a 400 ms bound.
 *   - the first cue's END is when the opening line has finished landing. §7c
 *     asks when the hook "reaches its point", and the end of the first spoken
 *     line is the closest thing a render measures. Where the plan carries a
 *     hook TITLE, its end is used instead — that is the actual hook, not a
 *     proxy for one.
 *
 * A plan with NO CUES supplies neither, so both checks report `not_checked`
 * rather than reporting 0 — a silent video is not a video whose hook lands
 * instantly.
 */
export function craftFactsFromPlan(
  plan: PlanLike | null | undefined, events: readonly EventLike[] = [],
): CraftFacts {
  const cues = Array.isArray(plan?.captions?.cues) ? plan!.captions!.cues! : []
  const firstCue = cues.length > 0 ? cues[0] : null
  const firstWordAtMs = firstCue ? int(firstCue.outputStartMs) : null
  const hookTitleEnd = int(plan?.hook?.title?.outputEndMs)
  const hookLandsAtMs = hookTitleEnd ?? (firstCue ? int(firstCue.outputEndMs) : null)

  return {
    firstWordAtMs,
    hookLandsAtMs,
    cutsPerMinuteMilli: int(plan?.timeline?.cutsPerMinuteMilli),
    outputDurationMs: int(plan?.output?.durationMs),
    measuredLufsMilli: measuredLufsFromEvents(events),
    targetLufsMilli: int(plan?.audio?.targetLufsMilli),
    toleranceLuMilli: int(plan?.audio?.toleranceLuMilli),
    widthPx: int(plan?.output?.width),
    heightPx: int(plan?.output?.height),
    captionsInsideSafeArea: captionsInsideSafeArea(plan),
  }
}

/**
 * Did every caption sit clear of the platform's own buttons?
 *
 * Compares the caption block's bottom margin to the frozen safe-area inset the
 * plan carries. Returns NULL — not `false` — when either number is absent: "we
 * did not check where your captions sit" and "your captions are in the wrong
 * place" are different sentences, and only one of them is an accusation.
 *
 * Deliberately checks the BOTTOM only. Phase 9's measurement established that
 * the collision is the horizontal ACTION RAIL and was never a vertical problem,
 * and the fix was made by width — so a vertical-only check here would be
 * re-asserting the thing that measurement disproved. The horizontal case is not
 * derivable from the plan alone (it needs the rendered line widths), so it is
 * absent rather than approximated.
 */
export function captionsInsideSafeArea(plan: PlanLike | null | undefined): boolean | null {
  const margin = int(plan?.captions?.marginVerticalPx)
  const safeBottom = int(plan?.video?.framing?.safeBottomPx)
  if (margin === null || safeBottom === null) return null
  return margin >= safeBottom
}
