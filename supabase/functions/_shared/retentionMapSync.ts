// GENERATED FROM packages/shared/src/script/retentionMapSync.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
/**
 * A COACHING PANEL MAY NOT DESCRIBE A BEAT THE CREATOR'S SCRIPT DOESN'T HAVE.
 *
 * ⚠️ MEASURED ACROSS THE FOUR-RUN REGRESSION HARNESS (Wave 0, assertion 5).
 * `reference_read.retention_map` is written once, by the same model call
 * that writes `reference_read.why_it_works` — and it describes the
 * REFERENCE video's own structure, not this creator's script. Run B's
 * retention map ends on a lead-magnet CTA the reference used; the shipped
 * script ends on a "save this" CTA. Run C's retention map includes
 * "The pivot", a beat the shot-list resync (Fix 4) already proved does not
 * exist in the final teleprompter. Run D's retention map claims 6
 * structural beats for a script that ships 5 scenes. In every case the
 * Result screen's "Where people keep watching" panel — the coaching commentary
 * sitting right next to the creator's own script — narrates a video that
 * is not the one they are about to film.
 *
 * ⚖️ THE ROOT CAUSE IS THE SAME SHAPE AS FIX 4's: ONE MODEL CALL, ONE MOMENT
 * OF AGREEMENT. `retention_map` and `script` are written together, so at
 * generation time they describe the same beats. Every repair after that —
 * phrase-overlap, CTA-entity, hook-entitlement, the ask/answer fill, and
 * Fix 4's own shot-list resync — mutates `script` and never touches
 * `retention_map`. The panel is a photograph of the FIRST draft; the script
 * the creator reads is the LAST one.
 *
 * ⚖️ SO THIS RUNS LAST TOO, OVER THE FINAL BEATS — AFTER THE SHOT-LIST RESYNC,
 * NOT BEFORE IT. It walks the exact `script` array that ships and produces
 * one retention-map row per beat, in beat order, so the panel can never
 * claim a beat count or a beat name the script does not have.
 *
 * ⚖️ THE MODEL'S ORIGINAL `goal`/`tactic` PROSE IS NEVER CARRIED FORWARD,
 * EVEN WHEN THE SECTION NAME STILL MATCHES. Run B is exactly why: its
 * retention map's final row is still named "CTA" after every repair — same
 * name, same position — but its `goal` reads "Lead magnet — comment a
 * specific word to get the freebie," reasoning that describes the
 * REFERENCE's own CTA. The shipped CTA is "Save this video so you have it
 * the next time you want to quit." A name match proves the beat still
 * exists; it proves nothing about what that beat now says. So every `goal`
 * here is synthesized fresh from the beat's own position in the FINAL
 * script — hook / build / close — never read off the model's original row,
 * which is discarded in full once its section has been used to size and
 * order the output.
 *
 * ⚖️ A ROW FOR A BEAT THAT NO LONGER EXISTS IS DROPPED, NEVER LEFT STALE.
 * Run C's "The pivot" row is exactly this: a retention-map beat with no
 * script section behind it any more. Carrying it forward would keep telling
 * the creator to watch for a scene they were never going to film.
 */

export interface SyncedScriptBeatForRetention {
  section?: unknown
  line?: unknown
}

export interface RetentionMapRow {
  beat?: unknown
  goal?: unknown
  tactic?: unknown
  [key: string]: unknown
}

export interface RetentionMapSyncResult {
  /** One row per final script beat, in beat order, each `beat` equal to that
   *  beat's `section` and `goal` synthesized fresh from the beat's own
   *  position — never copied from the model's original row, even when a
   *  same-named row survived. */
  retentionMap: RetentionMapRow[]
  /** How many original rows named a beat still present in the final script
   *  (matched by name) — informational only; that row's own prose is never
   *  reused, since a surviving name proves nothing about surviving content. */
  matched: number
  /** How many output rows got a synthesized goal (in the current design,
   *  every row does — kept as a field so callers/logs can see the count
   *  rather than infer it from `retentionMap.length`). */
  synthesized: number
  /** How many original rows named a beat absent from the final script and
   *  were dropped rather than shipped stale. */
  dropped: number
}

/** A beat whose section says it re-opens the video partway through. */
const REHOOK_SECTION = /re-?hook|second hook|reset/i

/**
 * ⚠️ EVERY MIDDLE BEAT USED TO READ THE SAME SENTENCE. The old rule returned
 * 'Add a reason to keep watching before attention drifts.' for every beat in
 * the first 60%, so a seven-beat script showed that one line three times and a
 * creator scrolling the panel learned nothing from the second or third row.
 * Reported from production runs H, I and J: "the same sentence twice", "the
 * retention map is still generic".
 *
 * ⚖️ THE PROGRESSION IS THE POINT, NOT THE VARIETY. These are not synonyms
 * shuffled to look different — they are the four jobs a middle beat actually
 * does, in the order a short video does them. Indexing by the beat's own
 * position through the middle means consecutive beats CANNOT land on the same
 * line, which is the property the guard asserts.
 */
const MIDDLE_GOALS = [
  'Give the first real reason to stay.',
  'Raise what is at stake so the next beat matters.',
  'Turn the corner — this is where it changes.',
  'Close the loop the hook opened.',
] as const

const POSITION_GOAL = (index: number, total: number, section?: unknown): string => {
  if (total <= 1) return 'Carry the whole idea in one beat.'
  if (index === 0) return 'Earn the next three seconds.'
  if (index === total - 1) return 'Land the ask this video was building toward.'
  // ⚖️ A RE-HOOK NAMES ITS OWN JOB, so it is read from the beat rather than
  // inferred from position — that is the one middle beat whose purpose the
  // writer already declared.
  if (typeof section === 'string' && REHOOK_SECTION.test(section)) {
    return 'Reset attention for anyone who started drifting.'
  }
  return MIDDLE_GOALS[(index - 1) % MIDDLE_GOALS.length]!
}

/**
 * Reconcile `reference_read.retention_map` against the FINAL `script` array
 * — the one the teleprompter renders, after every post-generation repair
 * (including Fix 4's shot-list resync) has already run.
 */
export function syncRetentionMapToScript(
  retentionMap: readonly RetentionMapRow[] | null | undefined,
  script: readonly SyncedScriptBeatForRetention[] | null | undefined,
): RetentionMapSyncResult {
  const originalRows = Array.isArray(retentionMap) ? retentionMap : []
  const beats = Array.isArray(script) ? script : []

  const bySection = new Map<string, RetentionMapRow>()
  for (const row of originalRows) {
    const beat = typeof row?.beat === 'string' ? row.beat.trim() : ''
    if (beat === '') continue
    // First row wins on a duplicate name — matches how the model would have
    // written it (one row per section).
    if (!bySection.has(beat.toLowerCase())) bySection.set(beat.toLowerCase(), row)
  }

  const matchedSections = new Set<string>()
  let matched = 0

  const out: RetentionMapRow[] = beats.map((beatEntry, index) => {
    const section = typeof beatEntry?.section === 'string' ? beatEntry.section.trim() : ''
    const key = section.toLowerCase()
    if (key !== '' && bySection.has(key)) {
      matchedSections.add(key)
      matched += 1
    }

    // Always synthesized from THIS beat's own position — never the original
    // row's prose, matched or not. See the module doc: a surviving name is
    // not proof of surviving content.
    return {
      beat: section || `Beat ${index + 1}`,
      goal: POSITION_GOAL(index, beats.length, section),
    }
  })

  let dropped = 0
  for (const key of bySection.keys()) {
    if (!matchedSections.has(key)) dropped += 1
  }

  return { retentionMap: out, matched, synthesized: out.length, dropped }
}
