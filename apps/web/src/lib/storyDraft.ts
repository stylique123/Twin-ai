// WHAT SHE TYPED, KEPT UNTIL IT IS SAFELY STORED.
//
// ⚠️ MEASURED IN PRODUCTION, 2026-09-09. Eleven creators reached the three
// story questions. TWO ever produced a stored answer. Five skipped all three.
// FOUR carry `shown` rows and NOTHING else — a suggestion was put in front of
// them, they rejected it, and `submit()` never completed. One of those four is
// the baker whose store holds eight caption-derived rows and none of the three
// stories she was asked for; her five `shown` rows span thirty-one minutes.
//
// ⚠️ THE WRITE PATH IS NOT THE DEFECT, AND THAT WAS WORTH ESTABLISHING FIRST.
// `creator_questions_put.outcome = 'answered'` is 6 and `creator_knowledge`
// with `source = 'asked'` is 6 — exactly matched, so the 0189 CHECK-constraint
// failure that once marked twelve answers taken and stored none is closed.
//
// ⚖️ THE DEFECT IS THAT THERE IS NO SAVE UNTIL "Continue". `StoryInterview`
// holds every answer in React state, and its own comment calls `submit()` "the
// one write there has ever been". A closed tab, a refresh, a phone call — and
// what she typed is gone with no record it existed. Onboarding is exactly where
// a creator is most likely to wander off mid-thought, and these are the only
// questions in the product whose answers cannot be derived from anything else.
//
// ⚠️ AND THIS IS DELIBERATELY NOT A DATABASE DRAFT. A row would survive a
// change of device, which this does not — but it needs a table, a migration and
// an RLS policy, and it would put half-written sentences a creator never
// confirmed into permanent storage. The loss being closed here is the tab, and
// the tab is on one device by definition. The limit is stated rather than
// papered over: see `STORY_DRAFT_IS_PER_DEVICE`.
//
// ⚖️ A DRAFT IS NOT AN ANSWER. Nothing here writes to `creator_knowledge`, and
// a restored draft still has to be confirmed by Continue like anything else —
// so "silence is not confirmation" survives intact. It restores the sentence to
// the box she typed it into, and no further.

const KEY = 'twinai.storyDraft.v1'

/** ⚠️ SAID OUT LOUD BECAUSE IT IS A REAL GAP, NOT A DETAIL. A creator who
 *  starts on a phone and finishes on a laptop still loses the sentence. Closing
 *  that needs a row, and a row needs a migration — filed, not pretended. */
export const STORY_DRAFT_IS_PER_DEVICE =
  'A story draft survives a closed tab and a refresh on the same browser. It '
  + 'does not travel to another device; that would need a stored draft row.'

/** Every read and write is wrapped, because `localStorage` THROWS rather than
 *  returning null in a browser set to block site data, and an onboarding screen
 *  that white-screens is far worse than one that forgets a draft. */
export function readStoryDraft(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      // ⚖️ ONLY NON-EMPTY STRINGS SURVIVE THE ROUND TRIP. An empty value is a
      // box she cleared, and restoring it would say nothing while making the
      // slot look touched.
      if (typeof v === 'string' && v.trim() !== '') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function writeStoryDraft(text: Record<string, string>): void {
  try {
    const keep: Record<string, string> = {}
    for (const [k, v] of Object.entries(text)) if (v.trim() !== '') keep[k] = v
    // ⚠️ AN EMPTY DRAFT IS REMOVED, NOT STORED AS `{}`. A creator who clears
    // every box has withdrawn what they wrote, and leaving a key behind would
    // outlive the intent.
    if (Object.keys(keep).length === 0) { window.localStorage.removeItem(KEY); return }
    window.localStorage.setItem(KEY, JSON.stringify(keep))
  } catch { /* a blocked store costs the draft, never the screen */ }
}

/** ⚠️ CALLED ONLY ONCE THE ANSWERS ARE STORED OR DELIBERATELY SKIPPED. Clearing
 *  before the write would reintroduce the exact loss this module exists to
 *  close, one step earlier. */
export function clearStoryDraft(): void {
  try { window.localStorage.removeItem(KEY) } catch { /* nothing to clear */ }
}
