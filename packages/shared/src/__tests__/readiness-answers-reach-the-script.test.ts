// THE CREATOR ANSWERED, AND THE SCRIPT THEY PAID FOR IGNORED IT.
//
// ⚠️ THE DEFECT, REPORTED FROM A REAL RUN. The readiness form asked for the
// offer, the creator typed one, and the generated video did not use it. `brief`
// is read BEFORE the questions are asked, and every prompt field resolves
// through it — `offer` is `brief.offer ?? vp?.offer ?? dna.product`. The answers
// were written to `brand_voices.pre_script_brief`, which helps the NEXT video.
// This one, the one they answered questions for and spent a remix on, was
// written from the stale values.
//
// ⚖️ CLARIFICATION IS FREE, CREATION IS PAID — and the clarification has to
// arrive in time to change the creation, or the form is a toll booth.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { claimsQuestionFor, assessReadiness } from '../generationReadiness'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

describe('the answers reach THIS generation, not just the next one', () => {
  it('merges each answered field into the brief the prompt reads', () => {
    for (const line of [
      /if \(readyPresent\(answers\.offer\)\) brief\.offer =/,
      /if \(readyPresent\(answers\.relationship\)\) brief\.promotes =/,
      /if \(readyPresent\(answers\.claims\)\) brief\.productFacts =/,
    ]) expect(EDGE).toMatch(line)
  })

  it('merges BEFORE the prompt resolves the offer', () => {
    // ⚠️ ORDER IS THE WHOLE FIX. Merging after `const offer = brief.offer ?? …`
    // would leave the code looking correct and the behaviour unchanged.
    expect(EDGE.indexOf('brief.offer = String(answers.offer)'))
      .toBeLessThan(EDGE.indexOf('const offer = brief.offer ??'))
  })

  it('does NOT let a blank answer erase a stored value', () => {
    // ⚖️ Unanswered is not "none" — the three-state rule. Every merge is gated
    // on `readyPresent`, never on the key existing.
    const merges = EDGE.match(/brief\.(offer|promotes|productFacts|audience) = String\(answers/g) ?? []
    expect(merges.length).toBeGreaterThanOrEqual(4)
    for (const f of ['offer', 'relationship', 'claims', 'audience']) {
      expect(EDGE).toMatch(new RegExp(`readyPresent\\(answers\\.${f}\\)\\) brief\\.`))
    }
  })

  it('carries a FREE-TEXT goal as prose instead of dropping it', () => {
    // ⚠️ `videoGoal` only accepts a GOAL_LINES key, so "grow my audience and
    // build authority" would be discarded by a `??` chain that type-checks.
    // ⚠️ TESTED AGAINST THE ENUM NOW, NOT AGAINST A MAP OF PROMPT LINES.
    // `GOAL_LINES` is gone: the set of accepted answers used to be defined by
    // whichever keys someone had written a sentence for, which is a set that
    // drifts every time the copy is edited.
    expect(EDGE).toMatch(/!isVideoGoalInline\(String\(answers\.goal\)\)/)
    expect(EDGE).toMatch(/brief\.idea = \[brief\.idea, String\(answers\.goal\)\]/)
  })
})

describe('the two questions are not the same question', () => {
  it('the goal is NOT a readiness question any more — the chips ask it', () => {
    // ⚠️ ASKING IT HERE ASKED IT TWICE. The remix card opens with three intent
    // chips whose first question IS this one, in plain English. Leaving it
    // MISSING_REQUIRED put both on the same card: a chip row reading "What do
    // you want this video to achieve?" above a text box reading "What should
    // this video do FOR YOU? (grow audience, get leads, sell something, build
    // authority)". One question, twice, one of them in marketing language.
    //
    // ⚖️ AND IT WAS UNANSWERABLE HERE. It read a picker that was deleted and a
    // brief field nothing writes, so it fired on every single build.
    const v = assessReadiness({ goal: null, angle: 'x', hasCreatorKnowledge: true })
    const goalField = v.fields.find((f) => f.field === 'goal')
    expect(goalField?.state).not.toBe('MISSING_REQUIRED')
    expect(goalField?.question).toBeNull()
  })

  it('the claims question names the OFFER rather than a pronoun', () => {
    // ⚠️ "What does it actually do?" — reported as indistinguishable from the
    // goal question, because "it" had nothing on screen to bind to.
    expect(claimsQuestionFor(null)).toMatch(/OFFER/)
    expect(claimsQuestionFor(null)).not.toMatch(/^What does it actually do/)
  })

  it('uses the offer\'s real name when we know it', () => {
    expect(claimsQuestionFor('the $100M roadmap'))
      .toBe('What does the $100M roadmap actually do? Specific features, numbers or outcomes this video is allowed to state.')
  })

  it('falls back rather than naming a wrong or absurd product', () => {
    // ⚖️ A question naming the wrong product is worse than one naming none.
    expect(claimsQuestionFor('unspecified')).toMatch(/OFFER/)
    expect(claimsQuestionFor('x'.repeat(80))).toMatch(/OFFER/)
    expect(claimsQuestionFor('   ')).toMatch(/OFFER/)
  })

  it('asks for SPECIFICS, which is what a script can actually state', () => {
    expect(claimsQuestionFor('Twin')).toMatch(/features, numbers or outcomes/)
  })

  it('the edge copy asks the same two questions', () => {
    // The inlined gate is the one that runs; drift here means production asks
    // the old confusing pair while the tests pass on the new one.
    // ⚖️ The goal text box is gone from the gate; the claims question stays and
    // still names the offer rather than leaning on a pronoun.
    expect(EDGE).not.toMatch(/readyMissing\.push\(\{ field: 'goal'/)
    expect(EDGE).toMatch(/readyClaimsQuestion\(readyOffer\)/)
    expect(EDGE).not.toMatch(/What does it actually do\? Give me the details/)
  })
})

// ── ASKED BEFORE THE WAIT, NOT AFTER IT ────────────────────────────────────
//
// ⚠️ THE ORDER WAS BACKWARDS. The questions come from the SERVER, and the
// server is not called until the reference is ingested — `ingestReference` plus
// a poll of up to 60 x 1.2s. So the creator watched a two-minute bar, was then
// asked two questions, and pressing "Build my video plan" started the bar
// again. Not one of those questions needs the reference read.
describe('the questions come before the two-minute wait', () => {
  const BUILD = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
      'apps', 'web', 'src', 'pages', 'v2', 'V2Building.tsx'), 'utf8')

  it('runs the pre-check BEFORE the ingest starts', () => {
    // ⚠️ ORDER IS THE ENTIRE FIX — after the ingest it changes nothing.
    expect(BUILD.indexOf('const verdict = assessReadiness('))
      .toBeLessThan(BUILD.indexOf('await ingestReference(refUrl)'))
  })

  it('returns without ingesting when something is missing', () => {
    const block = BUILD.slice(BUILD.indexOf('const verdict = assessReadiness('),
      BUILD.indexOf('await ingestReference(refUrl)'))
    expect(block).toMatch(/setAskQuestions\(ask\)/)
    expect(block).toMatch(/return/)
  })

  it('asks ONCE — answers already given must not re-trigger it', () => {
    // ⚖️ Without this the submit would bounce straight back to the same card.
    // ⚠️ THE GATE ASKS "IS ANYTHING STILL UNANSWERED" NOW, not "has anything
    // been answered". The old form skipped the pre-check the moment one answer
    // existed — correct when every question was a repair, wrong once three are
    // asked for every video.
    expect(BUILD).toMatch(/if \(!askQuestions && !\(intentAnswered && Object\.keys\(answersRef\.current\)\.length\)\)/)
  })

  it('a failed pre-check does NOT block the build', () => {
    // ⚖️ The server asks the same question authoritatively a moment later.
    // Losing the courtesy is a slower path, not a broken one.
    const block = BUILD.slice(BUILD.indexOf('const verdict = assessReadiness('))
    expect(block.slice(0, block.indexOf('An unreadable host'))).toMatch(/catch \(e\)/)
  })

  it('does not pretend work is happening behind the card', () => {
    // ⚠️ SLICED TO THE BLOCK'S OWN END, NOT A CHARACTER COUNT. The first draft
    // took a fixed 300 characters and broke the moment a line was added inside
    // the branch — asserting a layout where it meant a property, which is the
    // mistake this repo has now recorded three times.
    const start = BUILD.indexOf('if (ask.length && alive)')
    const block = BUILD.slice(start, BUILD.indexOf('\n            }', start))
    expect(block).toMatch(/setIngesting\(false\)/)
    expect(block).toMatch(/setActive\(0\)/)
  })
})
