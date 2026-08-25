/**
 * FIVE HOOKS THAT ARE REALLY ONE HOOK.
 *
 * ⚠️ MEASURED ACROSS 41 PRODUCTION GENERATIONS. Two have all five hook options
 * opening with the SAME three words; three more have at least three of five.
 * One creator's whole menu reads:
 *
 *   "Hey friends, I had this weird realisation that winning on the default..."
 *   "Hey friends, I am sharing the exact roadmap that gave me financial..."
 *   "Hey friends, if you feel burnt out by hustle culture but still want..."
 *   "Hey friends, my friend quit his prestige job and built a lifestyle..."
 *   "Hey friends, I finally realised that treating your career like an..."
 *
 * The prompt asks for "five genuinely DIFFERENT angles, not five rewordings of
 * one idea", and says why: "Variety is how the creator can reshoot without
 * repeating themselves." Five identical openings defeat exactly that.
 *
 * ⚖️⚖️ AND THE OPENER ITSELF IS NOT THE PROBLEM — THIS IS THE WHOLE JUDGMENT.
 * "Hey friends" is that creator's real signature, learned from their own
 * account. Telling them to stop saying it would be Twin overruling a creator's
 * voice with a style opinion, which is the opposite of the product. So this
 * module NEVER says the phrase is wrong. It says only that five options which
 * begin identically are not five options, and leaves every word alone.
 *
 * ⚖️ THE THRESHOLD IS THREE OF FIVE, AND IT WAS CHOSEN FROM THE DATA. Eight of
 * the 41 have some PAIR sharing an opener — that is ordinary, and still leaves
 * real choice, so flagging it would put a note on a fifth of all generations
 * for nothing. Three sharing means the menu is mostly one option. Five
 * generations cross that line.
 */

/** How many leading words define "the same opening". Three is enough to catch
 *  "Hey friends, I" without treating two hooks that merely both start with
 *  "If you" as the same hook. */
export const OPENER_WORDS = 3

/** ⚠️ THE MAJORITY OF FIVE. Below this the creator still has real choices. */
export const COLLIDING_AT_LEAST = 3

function opener(hook: string): string {
  return hook
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, OPENER_WORDS)
    .join(' ')
}

export interface HookCollision {
  /** The shared opening, as the creator wrote it — ⚠️ TAKEN FROM THEIR OWN
   *  TEXT, never normalised for display, so the note quotes them accurately. */
  opening: string
  /** How many of the options begin that way. */
  count: number
  /** How many options there were in total. */
  total: number
}

/**
 * The largest group of hooks that open the same way, when that group is big
 * enough to matter. `null` when the options are varied enough — ⚖️ and `null`
 * for a list too short to have a majority, because two hooks that match are a
 * pair, not a pattern.
 */
export function hookCollision(hooks: unknown): HookCollision | null {
  if (!Array.isArray(hooks)) return null
  const options = hooks.filter((h): h is string => typeof h === 'string' && h.trim() !== '')
  if (options.length < COLLIDING_AT_LEAST) return null

  const groups = new Map<string, string[]>()
  for (const h of options) {
    const key = opener(h)
    if (!key) continue
    const g = groups.get(key)
    if (g) g.push(h)
    else groups.set(key, [h])
  }

  let best: string[] = []
  for (const g of groups.values()) if (g.length > best.length) best = g
  if (best.length < COLLIDING_AT_LEAST) return null

  // The shared opening in the creator's own words, trimmed of a trailing comma
  // so the note reads as speech rather than as a fragment.
  const words = best[0].trim().split(/\s+/).slice(0, OPENER_WORDS).join(' ')
  return {
    opening: words.replace(/[,;:]$/, ''),
    count: best.length,
    total: options.length,
  }
}

/**
 * The note shown above the hook picker. ⚖️ PLAIN ENGLISH, AND IT NEVER
 * CRITICISES THE WORDS — the opening may be exactly how this creator talks.
 * It reports that the choices are not really choices.
 */
export function hookVarietyNote(hooks: unknown): string | null {
  const c = hookCollision(hooks)
  if (!c) return null
  return `${c.count} of these ${c.total} start with "${c.opening}", so they are closer to one option than ${c.total}. Change a couple if you want something different to shoot next time.`
}
