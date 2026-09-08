import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { goalFromCtas, goalConfirmationLine, GOAL_CONFIRMATION, INFERABLE_GOALS } from '../goalFromCta'
import { BRIEF_GOALS } from '../preScriptBrief'

/**
 * ⚠️ ASKED THREE TIMES, AND ANSWERED ON EVERY POST THEY HAVE EVER MADE.
 *
 * "What do you want your content to do?" is put at signup, again in the remix
 * pop-up, and again in the intent questions — while the scan has already read
 * the creator's own endings into `voice_profile.recurring_ctas`. The bakery's
 * came back "in bio!!", the physio's "drop an injury in the comments", a
 * skincare creator's "use my code VICKIE".
 *
 * ⚖️ AND AN INFERENCE IS NEVER RECORDED AS A STATEMENT. What this produces is a
 * sentence quoting the creator that they confirm in one tap. Writing it into
 * `contentGoals` unasked would be indistinguishable downstream from something
 * they said — "0 stated, 34 guessed" in a better disguise.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const ONBOARDING = readFileSync(join(REPO, 'apps/web/src/pages/Onboarding.tsx'), 'utf8')

describe('the CTA already said what the videos are for', () => {
  it('reads the three real production CTAs', () => {
    // ⚠️ THE ACTUAL STRINGS FROM THE ACCOUNTS, not paraphrases of them.
    expect(goalFromCtas(['in bio!!'])?.goal).toBe('sell')
    expect(goalFromCtas(['drop an injury in the comments'])?.goal).toBe('followers')
    expect(goalFromCtas(['use my code VICKIE'])?.goal).toBe('sell')
  })

  it('says nothing when there is nothing to read', () => {
    // ⚖️ NULL IS THE COMMON, CORRECT ANSWER — the question still gets asked.
    expect(goalFromCtas([])).toBeNull()
    expect(goalFromCtas(null)).toBeNull()
    expect(goalFromCtas(['thanks for watching'])).toBeNull()
    expect(goalFromCtas([42, null, '  '] as unknown[])).toBeNull()
  })

  it('a tie is not a coin flip', () => {
    // ⚠️ A creator who half sells and half teaches has TWO goals, and picking
    // one states a priority they never expressed — on the field that decides
    // how every script of theirs ends.
    expect(goalFromCtas(['link in bio', 'save this for later'])).toBeNull()
  })

  it('the commercial reading wins when one line carries two families', () => {
    // "comment SAUCE and I'll send the link" is both. Mistaking a sale for
    // engagement loses the disclosure question, so the specific one wins.
    expect(goalFromCtas(["comment SAUCE and I'll drop the link in bio"])?.goal).toBe('sell')
  })

  it('one CTA gets one vote, not one per family it mentions', () => {
    // ⚖️ Otherwise a single chatty ending outweighs three plain ones.
    const found = goalFromCtas([
      'comment below and use my code JAN, link in bio',
      'save this',
      'save this one too',
    ])
    expect(found?.goal).toBe('educate')
  })

  it('quotes the creator rather than asserting a conclusion about them', () => {
    // ⚠️ "You mostly want to sell" is a claim about a person. "Your videos
    // usually end with 'in bio'" is something they can check in a second.
    const line = goalConfirmationLine(goalFromCtas(['link in bio'])!)
    expect(line).toContain('link in bio')
    expect(line).toContain('selling what you offer')
  })

  it('every goal has a sentence, including the ones not yet inferable', () => {
    // ⚠️ A family added to the table without a sentence would render a blank
    // line under a quote of the creator's own words.
    for (const g of BRIEF_GOALS) expect(GOAL_CONFIRMATION[g], g).toBeTruthy()
    expect(INFERABLE_GOALS.length).toBeGreaterThan(0)
    expect(INFERABLE_GOALS.length).toBeLessThan(BRIEF_GOALS.length)
  })

  it('onboarding confirms it, and saying no gives the question back', () => {
    expect(ONBOARDING).toContain('goalFromCtas(draft.profile?.recurring_ctas)')
    expect(ONBOARDING).toContain('goalConfirmationLine(inferred)')
    expect(ONBOARDING).toContain("Not quite — let me pick")
    // ⚠️ NOTHING IS STORED UNTIL THEY ANSWER. The rejection lives in screen
    // state; only the tap writes contentGoals.
    expect(ONBOARDING).toContain('onClick={() => set({ contentGoals: [inferred.goal] })}')
    expect(ONBOARDING).toContain('const [guessRejected, setGuessRejected] = useState(false)')
  })

  it('the guess is only offered when nothing has been chosen', () => {
    // ⚖️ Re-guessing over an answer they already gave would be the same
    // duplicate-question defect pointing the other way.
    expect(ONBOARDING).toContain('draft.contentGoals.length === 0 && !guessRejected')
  })
})
