// A DEFAULT WE WROTE DOWN IS NOT A CHOICE THE CREATOR MADE.
//
// ⚠️ WHAT `selected_hook` ACTUALLY CONTAINS, MEASURED RATHER THAN ASSUMED. It
// was reported as a corrupted free-text field on the strength of one row reading
// "PICK THIS HOOK for the cover and broll". Of the 23 production rows that have
// a hook, 22 are an EXACT match to one of that generation's five offered
// options. The writing path cannot produce another — `pickHook` persists an
// option's own text and nothing else. One legacy row is not a corrupted dataset,
// and building a schema change on that premise would have fixed nothing.
//
// ⚖️ THE DEFECT IS THE OTHER DIRECTION, AND IT IS BIGGER. `Result.tsx` captures
// the RECOMMENDED hook on load when none is stored, added deliberately because
// the signal was otherwise nearly empty (1 of 15). That made the column
// non-empty by writing something no creator ever picked — and afterwards nothing
// tells the two apart. 14 of 23 rows equal option[0]. The usable preference
// signal is 8 rows, not 23, and a ranking model reading this table would learn
// that creators overwhelmingly prefer the first option we happened to list.
//
// ⚖️ SO THE FIX RECORDS PROVENANCE RATHER THAN REMOVING THE DEFAULT. The
// teleprompter genuinely needs a hook to shoot. What was missing is the ability
// to ask for choices and get only choices.

/** How `generations.selected_hook` came to hold what it holds. */
export interface HookChoice {
  /** ⚠️ ONLY `creator` IS A PREFERENCE. `default` is our recommendation captured
   *  on load; `freeform` is text matching no option — a creator using the hook
   *  field as a message because it was the only channel available. */
  source: 'creator' | 'default' | 'freeform'
  /** Which option, by position. `null` for freeform, which matches none — an
   *  index there would be a fabricated one. */
  index: number | null
}

/** The upper bound the CHECK constraint enforces. Five options are offered; the
 *  bound is loose because the option count is a product decision, not a schema
 *  one, and a constraint that tracks it would fail the day it changed. */
export const HOOK_INDEX_MAX = 20

/** The creator tapped this option. The only value that may train a preference. */
export function creatorPick(index: number): HookChoice {
  return { source: 'creator', index }
}

/** We filled the field so the teleprompter had a line. Not a preference, and a
 *  reader that counts it as one is doing the thing this module exists to stop. */
export function defaultCapture(index: number): HookChoice {
  return { source: 'default', index }
}

/** The stored text matches no offered option. */
export function freeformEntry(): HookChoice {
  return { source: 'freeform', index: null }
}

/**
 * Classify a stored hook against the options it was chosen from.
 *
 * ⚖️ USED FOR THE BACKFILL AND THE READER, NOT FOR THE WRITE PATH. Going
 * forward the app states its own provenance, because only the app knows whether
 * a human tapped anything. This is what can be recovered from rows written
 * before that existed — and it deliberately cannot recover the one thing that
 * matters: a stored hook equal to option[0] is `default` here, even when the
 * creator did tap it. That is a loss, it is permanent for the 14 existing rows,
 * and pretending otherwise would put fabricated preferences into the corpus.
 */
export function classifyStoredHook(stored: string, options: readonly string[]): HookChoice {
  const i = options.indexOf(stored)
  if (i < 0) return freeformEntry()
  return i === 0 ? defaultCapture(0) : creatorPick(i)
}

/** ⚠️ THE ONLY QUESTION A RANKING READER MAY ASK. NULL — a row predating 0134 —
 *  is not a preference either: it is a row we cannot interpret, which is a
 *  different thing from one where nothing was chosen. */
export function isPreference(choice: HookChoice | null | undefined): boolean {
  return choice?.source === 'creator'
}
