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

const POSITION_GOAL = (index: number, total: number): string => {
  if (total <= 1) return 'Carry the whole idea in one beat.'
  if (index === 0) return 'Earn the next three seconds.'
  if (index === total - 1) return 'Land the ask this video was building toward.'
  const throughLine = (index + 1) / total
  if (throughLine <= 0.6) return 'Add a reason to keep watching before attention drifts.'
  return 'Build toward the close without losing the thread.'
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
      goal: POSITION_GOAL(index, beats.length),
    }
  })

  let dropped = 0
  for (const key of bySection.keys()) {
    if (!matchedSections.has(key)) dropped += 1
  }

  return { retentionMap: out, matched, synthesized: out.length, dropped }
}
