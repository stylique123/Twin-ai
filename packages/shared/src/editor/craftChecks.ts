// §7c — CRAFT RULES AS CHECKS, and the line they must never cross.
//
// §7c names seven craft rules and then says exactly how they may be expressed:
//
//   "These are stated as CHECKS WITH REASONS, never as scores:
//    'Your hook takes 6 seconds to reach its point; the reference reached its
//     point in 2.' — checkable, arguable, honest."
//
// And it draws the line this whole module exists to respect:
//
//   "THE HONESTY LINE: Twin may say what it CHECKED. It may never say what will
//    PERFORM. The moment it predicts a number it has not measured, it becomes
//    the thing §1.2 exists to prevent."
//
// ── THREE STATUSES, AND WHY `fail` IS NOT ONE OF THEM ─────────────────────
//
//   pass         the measurement is inside the bound
//   attention    it is outside; the reason states BOTH numbers so it is arguable
//   not_checked  nothing here measured it — said out loud, never omitted
//
// There is deliberately no `fail`. A craft rule is a general observation about
// short-form video, not a law about this creator's video: a six-second hook is
// unusual and may be exactly right, and a checker that says "FAIL" has stopped
// being arguable. `attention` invites the creator to disagree, which §7c's own
// example sentence does.
//
// ── `not_checked` IS THE MOST IMPORTANT STATUS HERE ───────────────────────
//
// One of §7c's seven rules — "ends on a reason to act" — is not mechanically
// checkable at all. It is a claim about meaning, and nothing in this pipeline
// measures meaning.
//
// A checker that silently omitted it would imply the other six were the whole
// list, and the creator would read a clean report as "everything was checked".
// So it is REPORTED, with `not_checked` and a reason saying why. The same
// applies to any rule whose facts are missing on a particular render: absence
// of a measurement is never reported as a passing measurement.

export const CRAFT_CHECK_IDS = [
  'hook_timing',
  'dead_air_before_first_word',
  'visual_change_rate',
  'caption_safe_area',
  'audio_loudness',
  'vertical_frame',
  'ends_on_reason_to_act',
] as const
export type CraftCheckId = (typeof CRAFT_CHECK_IDS)[number]

export type CraftStatus = 'pass' | 'attention' | 'not_checked'

export interface CraftCheck {
  id: CraftCheckId
  status: CraftStatus
  /** One sentence, stating the MEASUREMENT and the bound it was compared to.
   *  Never a score, never a prediction. */
  reason: string
}

/**
 * What a render actually measured. Every field optional, because a field that
 * is missing must produce `not_checked` rather than a guess — and a caller
 * assembling these from a plan will legitimately have some and not others.
 */
export interface CraftFacts {
  /** Output ms before the first spoken word. */
  firstWordAtMs?: number | null
  /** Output ms at which the hook reaches its point — the first caption cue's
   *  end, or a Director-chosen hook boundary. */
  hookLandsAtMs?: number | null
  /** Cuts per minute, in milli-units, as the compiler recorded them. */
  cutsPerMinuteMilli?: number | null
  outputDurationMs?: number | null
  /** The delivered integrated loudness, MEASURED from the encoded file. */
  measuredLufsMilli?: number | null
  targetLufsMilli?: number | null
  toleranceLuMilli?: number | null
  /** Frame geometry, from the plan's output profile. */
  widthPx?: number | null
  heightPx?: number | null
  /** Whether every caption cue sat inside the frozen safe area. Computed by
   *  whoever has the cues; this module does not re-derive geometry. */
  captionsInsideSafeArea?: boolean | null
}

export interface CraftBounds {
  /** §7c: "hook lands in the first 2-3 seconds". */
  hookLandsByMs: number
  /** Dead air before the first word. The edge trim already removes most of it;
   *  this catches a render where it did not. */
  maxLeadingSilenceMs: number
  /** "Visual change often enough to hold attention" — a floor, not a target. */
  minCutsPerMinuteMilli: number
  /** Below this there is not enough video for a cut rate to mean anything. */
  minDurationForCutRateMs: number
}

/**
 * CHOSEN, NOT MEASURED — stated plainly because §7c is the section that forbids
 * confident numbers, and it would be absurd for its own checker to smuggle some
 * in.
 *
 * 3000ms is §7c's own "first 2-3 seconds", taken at the generous end.
 * 400ms of leading silence is roughly where a viewer notices nothing happening.
 * 6 cuts/min is a floor for "something changes"; short-form routinely runs many
 * times that, so only a genuinely static video falls under it.
 *
 * They are loose on purpose. A check that fires on a good video teaches the
 * creator to ignore checks, which costs more than the check was ever worth.
 */
export const DEFAULT_CRAFT_BOUNDS: CraftBounds = {
  hookLandsByMs: 3000,
  maxLeadingSilenceMs: 400,
  minCutsPerMinuteMilli: 6000,
  minDurationForCutRateMs: 10000,
}

const ms = (v: number): string => `${(v / 1000).toFixed(1)}s`
const real = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Run every craft check §7c names, and report the ones that could not run.
 *
 * ALWAYS RETURNS ALL SEVEN, in a stable order. A report whose length varies
 * with what happened to be measurable is a report a reader cannot compare
 * across two videos, and — worse — one where a missing check is invisible.
 */
export function runCraftChecks(
  facts: CraftFacts, bounds: CraftBounds = DEFAULT_CRAFT_BOUNDS,
): CraftCheck[] {
  const out: CraftCheck[] = []
  const add = (id: CraftCheckId, status: CraftStatus, reason: string): void => {
    out.push({ id, status, reason })
  }

  // 1. the hook lands in the first 2-3 seconds
  if (!real(facts.hookLandsAtMs)) {
    add('hook_timing', 'not_checked', 'We did not measure when your hook reaches its point.')
  } else if (facts.hookLandsAtMs <= bounds.hookLandsByMs) {
    add('hook_timing', 'pass',
      `Your hook reaches its point at ${ms(facts.hookLandsAtMs)}, inside the first ${ms(bounds.hookLandsByMs)}.`)
  } else {
    // §7c's own example sentence: both numbers, so it is arguable.
    add('hook_timing', 'attention',
      `Your hook takes ${ms(facts.hookLandsAtMs)} to reach its point; short videos usually get there within ${ms(bounds.hookLandsByMs)}.`)
  }

  // 2. no dead air before the first word
  if (!real(facts.firstWordAtMs)) {
    add('dead_air_before_first_word', 'not_checked', 'We did not measure the silence before your first word.')
  } else if (facts.firstWordAtMs <= bounds.maxLeadingSilenceMs) {
    add('dead_air_before_first_word', 'pass',
      `You start speaking at ${ms(facts.firstWordAtMs)}.`)
  } else {
    add('dead_air_before_first_word', 'attention',
      `There is ${ms(facts.firstWordAtMs)} of silence before your first word.`)
  }

  // 3. visual change often enough to hold attention
  if (!real(facts.cutsPerMinuteMilli) || !real(facts.outputDurationMs)) {
    add('visual_change_rate', 'not_checked', 'We did not measure how often the picture changes.')
  } else if (facts.outputDurationMs < bounds.minDurationForCutRateMs) {
    // A rate over three seconds of video is not a rate. Saying so beats
    // reporting a number that means nothing.
    add('visual_change_rate', 'not_checked',
      `This video is ${ms(facts.outputDurationMs)} long — too short for a cut rate to mean anything.`)
  } else if (facts.cutsPerMinuteMilli >= bounds.minCutsPerMinuteMilli) {
    add('visual_change_rate', 'pass',
      `The picture changes about ${Math.round(facts.cutsPerMinuteMilli / 1000)} times a minute.`)
  } else {
    add('visual_change_rate', 'attention',
      `The picture changes about ${Math.round(facts.cutsPerMinuteMilli / 1000)} times a minute, which is less than most short videos.`)
  }

  // 4. captions legible muted and clear of the platform UI
  if (facts.captionsInsideSafeArea === null || facts.captionsInsideSafeArea === undefined) {
    add('caption_safe_area', 'not_checked', 'We did not check where your captions sit in the frame.')
  } else if (facts.captionsInsideSafeArea) {
    add('caption_safe_area', 'pass', 'Your captions sit clear of the platform buttons.')
  } else {
    add('caption_safe_area', 'attention', 'Some captions sit where the platform draws its own buttons.')
  }

  // 5. audio at platform loudness — the one check backed by a REAL measurement
  // of the encoded file rather than by a plan value (loudness.ts, Phase 9).
  if (!real(facts.measuredLufsMilli) || !real(facts.targetLufsMilli) || !real(facts.toleranceLuMilli)) {
    add('audio_loudness', 'not_checked', 'We did not measure your delivered loudness.')
  } else {
    const deltaMilli = Math.abs(facts.measuredLufsMilli - facts.targetLufsMilli)
    const measured = (facts.measuredLufsMilli / 1000).toFixed(1)
    const target = (facts.targetLufsMilli / 1000).toFixed(1)
    if (deltaMilli <= facts.toleranceLuMilli) {
      add('audio_loudness', 'pass', `Your audio came out at ${measured} LUFS, at the ${target} platforms expect.`)
    } else {
      add('audio_loudness', 'attention',
        `Your audio came out at ${measured} LUFS; platforms expect about ${target}.`)
    }
  }

  // 6. vertical, safe-area respected
  if (!real(facts.widthPx) || !real(facts.heightPx) || facts.widthPx <= 0 || facts.heightPx <= 0) {
    add('vertical_frame', 'not_checked', 'We did not check the shape of your frame.')
  } else if (facts.heightPx > facts.widthPx) {
    add('vertical_frame', 'pass', `Your video is ${facts.widthPx}x${facts.heightPx} — upright, as phones show it.`)
  } else {
    add('vertical_frame', 'attention',
      `Your video is ${facts.widthPx}x${facts.heightPx}, which is not upright.`)
  }

  // 7. ends on a reason to act — NOT CHECKABLE, AND SAID SO.
  //
  // This is a claim about MEANING, and nothing in this pipeline measures
  // meaning. Omitting it would let a clean report imply the whole list was
  // checked; guessing at it — "your last sentence contains a verb" — would be
  // a confident number about something nobody measured, which is precisely
  // what §7c forbids two paragraphs above.
  add('ends_on_reason_to_act', 'not_checked',
    'Whether your ending gives someone a reason to act is not something we can measure — that one is yours to judge.')

  return out
}

/**
 * A one-line summary that STILL cannot claim performance.
 *
 * Counts, never a score. "5 of 7 checked, 1 wants a look" is arithmetic about
 * what was examined; "quality: 71%" is a number nobody measured, and the
 * distance between those two sentences is the entire point of §7c.
 */
export function summarizeCraftChecks(checks: readonly CraftCheck[]): string {
  const checked = checks.filter((c) => c.status !== 'not_checked').length
  const attention = checks.filter((c) => c.status === 'attention').length
  const head = `${checked} of ${checks.length} things checked`
  if (checked === 0) return `${head} — nothing here could be measured.`
  if (attention === 0) return `${head}, and all of them look right.`
  return `${head}; ${attention} ${attention === 1 ? 'wants' : 'want'} a look.`
}
