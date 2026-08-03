// THE CAPTION PREDICATES THE STAGING MATRIX CHECKS — in one place, so they can
// be run offline against a real compiled plan instead of only inside a
// ~40-minute matrix run against real Gemini and ASR.
//
// WHY THIS FILE EXISTS AT ALL. The matrix rendered videos and never looked at
// the captions. Everything phase 8 asserted about a render was structural — the
// video exists, is ready, carries a digest, lands within 250 ms of its plan —
// and every one of those holds equally for a video with NO captions, garbled
// captions, or captions running past the end. Two changes shipped in a single
// day (a narrower caption box, and captions taking the script's spelling) both
// merged with CI proving nothing whatsoever about captions. A check that runs,
// goes green, and does not examine the thing it appears to cover is the exact
// shape of the merge-gate fail-open fixed the same morning.
//
// AND WHY IT IS A MODULE RATHER THAN INLINE IN phase8.mjs. The first draft was
// inline, with a copy in a throwaway script to try it out locally. That copy
// immediately disagreed with the original — three of seven predicates were
// written against `startMs`/`endMs` when the plan's cues actually carry
// `outputStartMs`/`outputEndMs`, which would have failed the matrix and cost a
// full run to discover. Two copies of one rule is the defect this repo spent
// the day removing from the analysis-component namespace; it is not worth
// reintroducing for the sake of a shorter diff.
//
// PURE, AND BOUNDS COME FROM THE FROZEN POLICY. Nothing here restates a number:
// every ceiling is read from `worker/edit_policy_v1.json` by the caller and
// passed in, so these cannot drift away from what the compiler was told.

/**
 * @param {{captions?: {presetId?: string, cues?: unknown[]}}} plan  the edit_plans.plan JSONB
 * @param {Record<string, any>} policy  the frozen worker/edit_policy_v1.json
 * @param {number} measuredDurationMs  ffprobe's MEASUREMENT, never the plan's promise
 * @returns {Array<{name: string, ok: boolean, detail: string}>}
 */
export function captionChecks(plan, policy, measuredDurationMs) {
  const out = []
  const add = (name, ok, detail = '') => out.push({ name, ok, detail })

  const cues = Array.isArray(plan?.captions?.cues) ? plan.captions.cues : []
  add('A18a the plan carries caption cues at all', cues.length > 0, `cues=${cues.length}`)

  // Ordered, non-overlapping, positive-length. Cues out of order mean the
  // caption timeline and the video timeline came from different maps — the
  // failure the tail guard's comment already records having been bitten by.
  let ordering = 'ok'
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i]
    if (!Number.isInteger(c?.outputStartMs) || !Number.isInteger(c?.outputEndMs) || c.outputEndMs <= c.outputStartMs) {
      ordering = `cue ${i} has a bad span ${c?.outputStartMs}..${c?.outputEndMs}`; break
    }
    if (i > 0 && c.outputStartMs < cues[i - 1].outputEndMs) {
      ordering = `cue ${i} starts ${c.outputStartMs} before cue ${i - 1} ends ${cues[i - 1].outputEndMs}`; break
    }
  }
  add('A18b cues are ordered, non-overlapping and positive-length', ordering === 'ok', ordering)

  const presetId = plan?.captions?.presetId
  const preset = policy?.captions?.presets?.[presetId]
  add('A18c the plan names a caption preset that exists in the frozen policy', !!preset, `presetId=${String(presetId)}`)

  if (preset) {
    const overLines = cues.filter((c) => (c.lines ?? []).length > policy.captions.maxLinesPerCue)
    add('A18d no cue exceeds the frozen maxLinesPerCue',
      overLines.length === 0, `${overLines.length} over ${policy.captions.maxLinesPerCue}`)
    const overChars = cues.flatMap((c) => (c.lines ?? []).filter((l) => String(l).length > preset.maxCharsPerLine))
    add('A18e no caption LINE exceeds the preset maxCharsPerLine',
      overChars.length === 0, `${overChars.length} over ${preset.maxCharsPerLine}: ${overChars.slice(0, 2).join(' | ')}`)
  }

  // AGAINST THE MEASURED DURATION, never the planned one. This is the defect
  // class that already bit this project: the video stream truncates to whole
  // frames and to segment boundaries, landing 93-120 ms SHORT of the plan, so a
  // cue checked only against the promise can still fall outside the video.
  const lastEnd = cues.length ? cues[cues.length - 1].outputEndMs : 0
  add('A18f the last caption ends before the MEASURED video does',
    cues.length === 0 || lastEnd <= measuredDurationMs,
    `lastCueEnd=${lastEnd} measured=${measuredDurationMs}`)
  add('A18g …and clears the frozen tail guard against the measured duration',
    cues.length === 0 || lastEnd <= measuredDurationMs - policy.captions.tailGuardMs,
    `lastCueEnd=${lastEnd} measured=${measuredDurationMs} guard=${policy.captions.tailGuardMs}`)

  return out
}

// NOT CHECKED HERE, and named rather than left as a silent hole: "no caption
// word is invented". Since captions began taking the script's spelling, a
// caption word may legitimately come from EITHER the ASR transcript or the
// pinned script snapshot, so the check needs both sources loaded and compared.
// That is a larger read than this module is given, and it is the most valuable
// caption assertion still missing — a follow-up, not something to bolt on as a
// guess.
