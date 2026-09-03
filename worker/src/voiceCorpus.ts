/**
 * EVERY VIDEO GETS A SHARE OF THE WINDOW, INSTEAD OF THE FIRST FEW EATING IT.
 *
 * ⚠️ THE SECOND HALF OF A DEFECT THAT WAS ONLY HALF FIXED. `extractKnowledge`
 * (voice.ts:426) used to join every transcript and `.slice(0, 12000)`; it was
 * rewritten to batch, and its comment explains why. `synthesizeVoiceFromTranscripts`
 * (voice.ts:61) does the SAME join and the SAME slice and was never touched —
 * two sites, one file, one of them fixed.
 *
 * ⚠️ MEASURED, PRODUCTION, 2026-09-03. `reference_transcripts` n=551: mean 7,901
 * characters, median 1,061 — a heavy skew, because long-form YouTube sits beside
 * short TikTok. A 12,000-character front-loaded join therefore reads about 1.5
 * videos for a long-form creator and about 11 for a short-form one. Never the 25
 * that TikTok transcribes for free. The voice profile — signature words,
 * recurring CTAs, tone, pacing, hook style, DO rules — is built from whatever
 * happened to come first.
 *
 * ⚖️ BATCHING IS THE WRONG FIX HERE, WHICH IS WHY THIS IS NOT A COPY OF :426.
 * The extractor returns a LIST and can concatenate five batches. Voice synthesis
 * returns ONE profile; five calls would return five profiles and merging them is
 * a judgement nobody has made. So the window stays one call, and what changes is
 * WHICH characters fill it: a fair share per video rather than a prefix.
 *
 * ⚖️ AND A SHORT VIDEO MUST NOT WASTE ITS SHARE. Equal division alone would give
 * a 200-character clip the same 480 characters as an 8,000-character one and
 * throw the remainder away. The unclaimed remainder is redistributed, so the
 * window is spent rather than merely divided.
 */

/** What the model is handed, and what was left out getting there. */
export interface VoiceCorpus {
  /** The prompt block. Empty string when there is nothing to say. */
  text: string
  /** How many transcripts are represented at all. */
  used: number
  /** How many were handed over whole. */
  whole: number
  /** How many appear as an excerpt. */
  excerpted: number
  /** How many could not be represented at all — always said out loud. */
  dropped: number
}

/** A transcript needs at least this much room to be worth including: below it a
 *  fragment teaches the model nothing about how somebody talks, and spends a
 *  slot that a fuller video could have used. */
export const MIN_SHARE_CHARS = 320

/** ⚠️ THE MARKER COSTS CHARACTERS TOO. Appending it after slicing to the
 *  allocation overruns the window by its own length — caught by the test that
 *  asserts the window is never exceeded, which is the whole reason that test
 *  asserts a bound rather than a shape. */
const EXCERPT_MARK = '…[excerpt]'

/**
 * Build the spoken corpus for voice synthesis.
 *
 * ⚠️ ORDER IS PRESERVED. The caller ranks transcripts before this sees them, and
 * re-ordering here would silently overrule that ranking.
 */
export function buildVoiceCorpus(
  transcripts: readonly string[],
  windowChars: number,
): VoiceCorpus {
  const clean = (Array.isArray(transcripts) ? transcripts : [])
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter((t) => t !== '')
  if (clean.length === 0 || !(windowChars > 0)) {
    return { text: '', used: 0, whole: 0, excerpted: 0, dropped: 0 }
  }

  // Headers cost real characters; budgeting without them overruns the window.
  const headerFor = (i: number) => `--- VIDEO ${i + 1} (spoken) ---\n`
  const SEP = '\n\n'

  // ⚖️ HOW MANY VIDEOS THE WINDOW CAN HOLD AT ALL. Including a 26th at 100
  // characters each would be a corpus of fragments; the floor decides who fits.
  const overheadFor = (n: number) =>
    clean.slice(0, n).reduce((sum, _t, i) => sum + headerFor(i).length, 0) + SEP.length * Math.max(0, n - 1)
  let fit = clean.length
  while (fit > 1 && (windowChars - overheadFor(fit)) / fit < MIN_SHARE_CHARS) fit -= 1

  const chosen = clean.slice(0, fit)
  let budget = windowChars - overheadFor(fit)
  if (budget <= 0) return { text: '', used: 0, whole: 0, excerpted: 0, dropped: clean.length }

  // Pass 1: everything that already fits inside an equal share is taken whole,
  // and what it does not spend returns to the pool.
  const share = Math.floor(budget / chosen.length)
  const take = new Array<number>(chosen.length).fill(0)
  let remaining = budget
  let hungry: number[] = []
  for (let i = 0; i < chosen.length; i++) {
    const len = chosen[i]!.length
    if (len <= share) { take[i] = len; remaining -= len } else hungry.push(i)
  }
  // Pass 2: the redistribution. Repeat until nobody else can be satisfied whole,
  // so the window is spent rather than merely divided.
  while (hungry.length > 0) {
    const each = Math.floor(remaining / hungry.length)
    if (each <= 0) break
    const stillHungry: number[] = []
    let settled = false
    for (const i of hungry) {
      const len = chosen[i]!.length
      if (len <= each) { take[i] = len; remaining -= len; settled = true } else stillHungry.push(i)
    }
    if (!settled) { for (const i of stillHungry) take[i] = each, remaining -= each; hungry = []; break }
    hungry = stillHungry
  }

  let whole = 0
  let excerpted = 0
  const blocks = chosen.map((t, i) => {
    const n = take[i]!
    if (n >= t.length) { whole += 1; return `${headerFor(i)}${t}` }
    excerpted += 1
    // ⚠️ SAID IN THE PROMPT, NOT INFERRED. A truncated transcript that looks
    // whole invites the model to read a cut-off sentence as how somebody ends.
    return `${headerFor(i)}${t.slice(0, Math.max(0, n - EXCERPT_MARK.length))}${EXCERPT_MARK}`
  })

  return {
    text: blocks.join(SEP),
    used: chosen.length,
    whole,
    excerpted,
    dropped: clean.length - chosen.length,
  }
}
