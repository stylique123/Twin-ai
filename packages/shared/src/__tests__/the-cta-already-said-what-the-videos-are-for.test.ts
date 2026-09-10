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

  it('onboarding confirms it — and asks NOTHING when it cannot infer', () => {
    // ⚠️⚠️ THIS TEST USED TO REQUIRE A FALLBACK TO THE SEVEN CHIPS, AND THE
    // FALLBACK IS WHY THE DEFECT WAS REPORTED STILL PRESENT AFTER BEING
    // REPORTED FIXED. Measured over all 47 stored `recurring_ctas` sets, the
    // inference fired on 12 of 42 accounts — so 71% of creators saw the
    // unchanged question and my claim to have removed it was false for most of
    // them. Widening took it to 23 of 42; the rest genuinely ask for nothing.
    //
    // ⚠️⚠️ AND THIS IS WHERE THIS TEST WAS WRONG, IN THE SENTENCE IT WAS MOST
    // CONFIDENT ABOUT. It used to read: "SO THE QUESTION IS DELETED RATHER THAN
    // CONDITIONAL. `null` from this branch means the screen shows nothing at
    // all." The INTENT was right and the MECHANISM was the defect — because the
    // step around the question kept rendering. A creator saw the header ("2 of
    // 2"), the summary of her previous answers, and then Done and Skip all with
    // nothing between them. Reported live on a real account.
    //
    // ⚖️ THE QUESTION IS STILL DELETED RATHER THAN SOFTENED. What changed is WHO
    // DELETES IT: `asksContentGoal` keeps it out of `profileQuestionsFor`, so
    // the step never counts a question it will not draw. "Shows nothing at all"
    // is correct of the SET, never of a step that rendered.
    //
    // ⚖️ AND THE RENDERER NO LONGER STOPS DRAWING ONCE ANSWERED. The old
    // condition was `contentGoals.length === 0 ? goalFromCtas(...) : null`,
    // which blanked the step the instant somebody answered — universally, not
    // on the 45% of accounts with no inferable sign-off.
    expect(ONBOARDING).toContain('goalFromCtas(draft.profile?.recurring_ctas)')
    expect(ONBOARDING).toContain('goalConfirmationLine(inferred)')
    // The belt-and-braces guard stays; it is no longer the mechanism.
    expect(ONBOARDING).toContain('if (!inferred) return null')
    // ⚠️ AND THE CONDITION MUST NOT COME BACK. This is the exact text that
    // produced the blank step, asserted absent so it cannot return quietly.
    expect(ONBOARDING).not.toContain('draft.contentGoals.length === 0\n      ? goalFromCtas')
    expect(ONBOARDING).toContain("onClick={() => set({ contentGoals: [inferred.goal], contentGoalsTouched: true })}")
    // The seven chips are gone from this screen entirely.
    expect(ONBOARDING).not.toContain('values={BRIEF_GOALS}')
    expect(ONBOARDING).not.toContain('Pick up to two.')
  })

  it('declining records nothing and asks nothing more', () => {
    // ⚖️ Offering the chips on "Not quite" would be the third asking wearing a
    // no button.
    // ⚖️ DECLINING NOW RECORDS *THAT* IT WAS DECLINED, AND STILL RECORDS NO
    // GOAL. An empty `contentGoals` meant two different things — nobody asked
    // yet, or somebody said "not quite" — and the screen could not tell them
    // apart, so declining looked exactly like an untouched step. The goal
    // itself is still empty: silence is not "no", and "no" is not a goal.
    expect(ONBOARDING).toContain("onClick={() => set({ contentGoals: [], contentGoalsTouched: true })}")
    expect(ONBOARDING).not.toContain('Not quite — let me pick')
  })
})
