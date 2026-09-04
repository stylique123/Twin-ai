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

// ── ⚠️ AND `default` MEANT "THE PAGE LOADED", WHICH IS A FACT ABOUT US ────
//
// The load-time capture above solved the empty-column problem and left a
// different one behind. `Result.tsx` writes `default` in the load effect —
// BEFORE the creator has had time to read anything — so the value records that
// a browser fetched a row. It says nothing about a person at all.
//
// ⚖️ THE ALTERNATIVES ARE NOT HIDDEN, WHICH IS WHAT MAKES THE GAP FIXABLE. All
// five options render in one always-visible grid on `Result` (no toggle, no
// accordion), so a creator who reaches the recorder has had every option on
// screen. The missing fact was never "did they see the others" — it is whether
// they ever reached a moment where keeping ours COST them something.
//
// ⚠️ SO A FOURTH SOURCE, WRITTEN AT THE ONE SEAM THAT MEANS SOMETHING. Entering
// the teleprompter is where a creator stops arguing with the script — the same
// seam `acceptedFinal.ts` stamps, for the same reason. Arriving there with our
// recommendation still in place is AGREEMENT: five lines were on screen, they
// took ours to camera.
//
//   default        the page loaded and nothing has happened since. Not a
//                  preference, and not an observation about the creator either.
//   default_taken  they went to camera with our recommendation. Agreement.
//   creator        they tapped a different option. Preference.
//   freeform       the stored text matches no option.
//
// ⚖️ AND `default` STAYING `default` IS THE FINDING, NOT A GAP. A row that never
// becomes `default_taken` is a creator who never shot it — abandonment or
// inattention — which is exactly the case that used to be indistinguishable
// from agreement. Separating them is the whole point.
//
// ⚠️ AGREEMENT IS NOT A PREFERENCE AND MUST NOT BE COUNTED AS ONE. Taking the
// recommendation is a weaker signal than choosing against it: the creator had a
// reason to move and did not, which is evidence, but a ranking model trained on
// `default_taken` as if it were a pick would relearn the old lie that everyone
// prefers option[0]. `isPreference` stays narrow; `isAgreement` is separate on
// purpose so a reader has to say which one it wants.

/** How `generations.selected_hook` came to hold what it holds. */
export interface HookChoice {
  /** ⚠️ ONLY `creator` IS A PREFERENCE. `default` is our recommendation captured
   *  on load and means only that the page loaded; `default_taken` is that same
   *  recommendation carried to the recorder, which is agreement; `freeform` is
   *  text matching no option — a creator using the hook field as a message
   *  because it was the only channel available. */
  source: 'creator' | 'default' | 'default_taken' | 'freeform'
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

/**
 * They opened the recorder with our recommendation still selected.
 *
 * ⚠️ ONLY EVER AN UPGRADE FROM `default`, and `upgradeOnCapture` is what
 * enforces that. Writing this over a `creator` row would erase a real
 * preference and replace it with agreement to a line they had rejected.
 */
export function defaultTaken(index: number): HookChoice {
  return { source: 'default_taken', index }
}

/**
 * What to store when a creator enters the teleprompter, given what is stored.
 *
 * ⚠️ RETURNS null FOR "CHANGE NOTHING", WHICH IS MOST OF THE TIME. A `creator`
 * row is a preference and must survive; a `freeform` row is their own words; a
 * row already `default_taken` is a re-entry, and re-entering is not a second
 * agreement any more than it is a second acceptance (`acceptedFinal.ts` draws
 * the same line for the same reason).
 *
 * ⚠️ AND A NULL PRIOR STAYS NULL. A generation predating 0134 carries no choice
 * at all; minting `default_taken` from nothing would claim we know they saw a
 * recommendation we cannot prove was ever shown. Absent is not agreement.
 */
export function upgradeOnCapture(current: HookChoice | null | undefined): HookChoice | null {
  if (!current || current.source !== 'default') return null
  // The index travels unchanged: which option they kept is part of the fact.
  return defaultTaken(typeof current.index === 'number' ? current.index : 0)
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
 *  different thing from one where nothing was chosen.
 *
 *  ⚠️ `default_taken` IS DELIBERATELY FALSE HERE. It is real evidence and it is
 *  not a pick; see the header. Widening this to include it would rebuild the
 *  exact bias 0134 exists to prevent, one release later and harder to see. */
export function isPreference(choice: HookChoice | null | undefined): boolean {
  return choice?.source === 'creator'
}

/** They had every option on screen and took ours to camera. Weaker than a pick
 *  and stronger than silence — the distinction that did not exist before. */
export function isAgreement(choice: HookChoice | null | undefined): boolean {
  return choice?.source === 'default_taken'
}

/** What a row can testify to, for a reader that wants to say so out loud. */
export type HookVerdict =
  /** They chose this line over the others. */
  | 'chose'
  /** They kept our line and shot it. */
  | 'agreed'
  /** We wrote a line down and nothing has happened since — the creator has not
   *  testified to anything, and this is NOT agreement. */
  | 'no_signal'
  /** Their own words, matching no option. */
  | 'own_words'
  /** Predates the provenance column; uninterpretable, never a default reading. */
  | 'unreadable'

export function readHookVerdict(choice: HookChoice | null | undefined): HookVerdict {
  if (!choice) return 'unreadable'
  switch (choice.source) {
    case 'creator': return 'chose'
    case 'default_taken': return 'agreed'
    case 'default': return 'no_signal'
    case 'freeform': return 'own_words'
    default: return 'unreadable'
  }
}
