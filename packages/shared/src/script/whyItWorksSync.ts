/**
 * THE "WHY IT WORKS" TICKS MUST DESCRIBE THE SCRIPT THE CREATOR IS ABOUT TO FILM.
 *
 * ⚠️ THE SAME DEFECT SHAPE AS FIX 4 AND FIX 5, ONE LIST OVER, AND THE LAST ONE
 * LEFT. `reference_read.why_it_works` is written by the same model call as
 * `script`, in the same response, and it describes the REFERENCE video's own
 * virtues. Every repair since — phrase-overlap, CTA-entity, hook-entitlement,
 * the ask/answer fill, the shot-list resync, the retention-map resync — mutates
 * `script` and never touches it.
 *
 * ⚠️ AND THE SURFACE IS WHAT MAKES IT COSTLY. On Result these render as a
 * GREEN-TICKED LIST, under a tab labelled "Why it works" that sits beside
 * "Film & edit" and "Post it" — two tabs unambiguously about the creator's own
 * video. In the same card, immediately below, is "Where people keep watching",
 * which Fix 5 already made script-derived. So one card now holds two lists: one
 * about the creator's script and one about a stranger's, with nothing telling
 * the reader which is which, and a tick beside each. A creator reads those ticks
 * as things their video does.
 *
 * ⚖️ THE MODEL'S PROSE IS NOT CARRIED FORWARD, EVEN IN PART — exactly as
 * `syncRetentionMapToScript` discards every original `goal`. There is no
 * reliable way to tell which of the reference's virtues this script inherited
 * and which it dropped, and a half-true tick is worse than an absent one: it is
 * the true ones that make a reader trust the rest.
 *
 * ⚖️ SO EVERY CLAIM HERE IS A PROPERTY THAT CAN BE CHECKED AGAINST THE FINAL
 * SCRIPT, AND IS EMITTED ONLY WHEN THE CHECK PASSES. Nothing here is generated
 * to fill the panel. A claim that would need a judgement — whether the idea is
 * good, whether the proof persuades — is not made at all, because a tick is a
 * statement of fact and Twin cannot verify those.
 *
 * ⚖️ PLAIN ENGLISH, SECOND PERSON, NO JARGON. This is read by someone holding a
 * phone about to film, not by an analyst.
 */

export interface WhyItWorksBeat {
  section?: unknown
  line?: unknown
}

export interface WhyItWorksSyncResult {
  /** The claims that survived their own checks, strongest first, capped. */
  whyItWorks: string[]
  /** How many of the model's original reference-describing claims were dropped. */
  dropped: number
}

/** The panel is a glance, not a report. Five ticks is already more than anyone
 *  reads standing up with a camera in their hand. */
export const MAX_CLAIMS = 5

const words = (s: string): string[] => s.trim().split(/\s+/).filter((w) => w !== '')

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** ⚠️ DIGITS AND THE SMALL WORD-NUMBERS BOTH. A hook that says "three ways"
 *  names a number exactly as much as one that says "3 ways", and checking only
 *  for digits would call the commoner spelling a miss. */
const NUMBER_WORD =
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\b/i

/** A beat whose section says it re-opens the video partway through. */
const REHOOK = /re-?hook|second hook|reset/i

const CTA = /\bcta\b|call to action|close|ending|outro/i

/**
 * Derive the "Why it works" claims from the FINAL `script` array — the one the
 * teleprompter renders, after every post-generation repair has already run.
 *
 * @param original the model's own claims, used ONLY to count what was dropped
 */
export function syncWhyItWorksToScript(
  original: readonly unknown[] | null | undefined,
  script: readonly WhyItWorksBeat[] | null | undefined,
): WhyItWorksSyncResult {
  const beats = Array.isArray(script) ? script : []
  const originalCount = (Array.isArray(original) ? original : []).filter(
    (c) => text(c) !== '',
  ).length

  const spoken = beats
    .map((b) => ({ section: text(b?.section), line: text(b?.line) }))
    .filter((b) => b.line !== '')

  // How many beats the creator still owes an answer for. Beats WITHOUT a line
  // are not absent from the script — they are its unanswered asks.
  const pending = beats.length - spoken.length

  // ⚠️ NO SCRIPT, NO CLAIMS. An empty panel and a panel of ticks about a
  // stranger's video are not equally wrong: one says nothing, the other says
  // something false. Fix 5 settled this for the retention map and it settles
  // the same way here.
  if (spoken.length === 0) return { whyItWorks: [], dropped: originalCount }

  const claims: string[] = []
  const hook = spoken[0].line
  const hookWords = words(hook)

  // 1. THE HOOK'S LENGTH, WHICH IS THE ONE NUMBER THAT DECIDES THE VIDEO.
  if (hookWords.length <= 12) {
    claims.push(
      `Your opening line is ${hookWords.length} words. It lands before anyone decides to scroll past.`,
    )
  }

  // 2. A QUESTION IS ANSWERED IN THE HEAD BEFORE IT IS ANSWERED OUT LOUD.
  if (hook.endsWith('?')) {
    claims.push(
      'You open on a question, so people answer it in their head before they choose whether to keep watching.',
    )
  }

  // 3. A NUMBER IN THE HOOK IS A SIZE THE VIEWER CAN HOLD.
  if (NUMBER_WORD.test(hook)) {
    claims.push('Your hook names a number, so people know exactly how much you are promising them.')
  }

  // 4. THE SECOND HOOK, AT THE POINT ATTENTION ACTUALLY GOES.
  if (spoken.slice(1).some((b) => REHOOK.test(b.section))) {
    claims.push(
      'There is a second hook partway through, at the point where attention usually drifts.',
    )
  }

  // 5. THE CLOSE, WHEN IT ASKS FOR ONE THING AND IS SHORT ENOUGH TO HEAR.
  const last = spoken[spoken.length - 1]
  const lastWords = words(last.line)
  if (spoken.length > 1 && CTA.test(last.section) && lastWords.length <= 25) {
    claims.push(
      `You end on one action in ${lastWords.length} words, so nobody has to work out what to do next.`,
    )
  }

  // 6. THE PACE, MEASURED ON THE LONGEST BEAT RATHER THAN THE AVERAGE — an
  //    average hides the one beat that stalls, and the one beat is what loses
  //    the viewer.
  const longest = Math.max(...spoken.map((b) => words(b.line).length))
  if (longest <= 40) {
    claims.push(
      `No single beat runs longer than ${longest} words, so the pace never stalls in one place.`,
    )
  }

  // 7. THE FLOOR. Always true of any script that exists, so the panel is never
  //    empty for a real script — but it is a real measurement, not filler.
  //
  // ⚠️ THE DENOMINATOR IS PART OF THE MEASUREMENT. Reported in production on a
  // SEVEN-beat script as "It runs 2 spoken beats, each doing one job." Both
  // numbers were true of `spoken` and the sentence was still false about the
  // script, because five beats were unanswered asks carrying no line. A count
  // with a hidden denominator is how a partial score reads as a finished one.
  if (claims.length < MAX_CLAIMS) {
    claims.push(
      pending > 0
        ? `It has ${spoken.length} written beats of ${beats.length} so far, each doing one job.`
        : `It runs ${spoken.length} spoken beats, each doing one job.`,
    )
  }

  // ⚖️ AND THE WHOLE PANEL SAYS WHAT IT WAS SCORED ON, FIRST. Every claim above
  // is measured over `spoken` only — the hook's length, the longest beat, the
  // close. That is the honest thing to measure (an unanswered beat has no words
  // to judge) but presenting it unlabelled hands the creator a verdict on a
  // script that does not exist yet. This sentence goes FIRST so it frames the
  // ones after it rather than trailing them as a footnote.
  //
  // ⚖️ IT COSTS A CLAIM SLOT RATHER THAN WIDENING THE PANEL. MAX_CLAIMS is what
  // the surface was designed to hold; a partial script has fewer real things to
  // say about it anyway, so the trade lands where it should.
  const out = pending > 0
    ? [
        `Scored on the ${spoken.length} ${spoken.length === 1 ? 'beat' : 'beats'} you have words for — the other ${pending} ${pending === 1 ? 'is' : 'are'} waiting on your answers.`,
        ...claims.slice(0, MAX_CLAIMS - 1),
      ]
    : claims.slice(0, MAX_CLAIMS)

  return { whyItWorks: out, dropped: originalCount }
}
