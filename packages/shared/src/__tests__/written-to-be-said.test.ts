// THE SENTENCE A MODEL WRITES BY DEFAULT IS AN ESSAY SENTENCE.
//
// ⚠️ "One of the most significant mistakes that early-stage founders frequently
// make when evaluating artificial intelligence tools is failing to consider…" is
// grammatical, on-topic and unspeakable. A creator reading it off a teleprompter
// runs out of breath and rewrites it — and "% of words changed before recording"
// is the number this whole track is judged on.
import { describe, expect, it } from 'vitest'
import {
  speechIssues, speakableShare, polishViolations, spokenSentences,
  POLISH_MAY_NOT, SPOKEN_WORDS_HARD_MAX,
} from '../speechPolish'

const ESSAY = 'One of the most significant mistakes that early-stage founders frequently make when evaluating artificial intelligence tools is failing to consider the total cost of ownership.'
const SPOKEN = "Here's the mistake I see founders make with AI tools. They only look at the monthly price."

describe('what makes a line hard to say', () => {
  it('catches the essay sentence', () => {
    const codes = speechIssues(ESSAY).map((i) => i.code)
    expect(codes).toContain('sentence_too_long')
    expect(codes).toContain('essay_transition')
  })

  it('and leaves the spoken one alone', () => {
    expect(speechIssues(SPOKEN)).toEqual([])
  })

  it('a fragment is not an error', () => {
    // ⚠️ A CHECKER THAT FLAGGED SHORT SENTENCES would push the script back
    // towards the essay voice it exists to remove. "Here's the mistake." is
    // exactly what a person says.
    expect(speechIssues("Here's the mistake. Every time.")).toEqual([])
  })

  it('a semicolon is a pause nobody can hear', () => {
    expect(speechIssues('I tried it; it did not work.').map((i) => i.code)).toContain('semicolon')
  })

  it('and the explanations are written for a creator, not a linter', () => {
    for (const issue of speechIssues(ESSAY)) {
      expect(issue.explain).not.toMatch(/token|regex|AST|parse/i)
      expect(issue.explain.length).toBeGreaterThan(15)
    }
  })
})

describe('the share worth watching', () => {
  it('is high for spoken lines and low for an essay', () => {
    expect(speakableShare(SPOKEN)!).toBeGreaterThan(0.5)
    expect(speakableShare(ESSAY)!).toBe(0)
  })

  it('and says nothing at all about an empty script', () => {
    // ⚖️ 0% WOULD READ AS "TERRIBLE" FOR A SCRIPT THAT DOES NOT EXIST.
    expect(speakableShare('')).toBeNull()
  })

  it('splits on what a reader does, including questions', () => {
    expect(spokenSentences('Why? Because it works. Try it!')).toHaveLength(3)
  })
})

describe('the polish pass may not think', () => {
  it('refuses a dropped price', () => {
    // ⚠️ ROUNDING "$29" TO "about thirty dollars" IS A CHANGED PRODUCT FACT
    // wearing a friendlier voice — the exact trade a merged writer-and-editor
    // makes without anybody noticing, because the output reads beautifully.
    const v = polishViolations('It costs $29 a month.', 'It costs about thirty dollars a month.')
    expect(v.map((x) => x.code)).toContain('fact_dropped')
  })

  it('refuses a number that was never supplied', () => {
    const v = polishViolations('It saves you time.', 'It saves you 10 hours a week.')
    expect(v.map((x) => x.code)).toContain('claim_added')
  })

  it('refuses losing the call to action', () => {
    const v = polishViolations(
      'Try it free for a week. Link below.', 'You should probably check it out.',
      { cta: 'Try it free for a week' })
    expect(v.map((x) => x.code)).toContain('cta_changed')
  })

  it('refuses a polish that grew the script', () => {
    // ⚖️ SHORTER OR ABOUT THE SAME IS THE SHAPE OF THIS PASS. Materially longer
    // means it wrote.
    const before = 'It costs $29. Worth it.'
    const after = `It costs $29. Worth it. ${'And here is another thought about that. '.repeat(3)}`
    expect(polishViolations(before, after).map((x) => x.code)).toContain('length_ballooned')
  })

  it('and passes an honest polish clean', () => {
    const v = polishViolations(
      'One of the most significant considerations, when you are evaluating tools, is that it costs $29 per month.',
      "Here's the thing. It costs $29 a month.")
    expect(v).toEqual([])
  })
})

describe('the rules are stated where they can be quoted and checked', () => {
  it('names what the pass may never do', () => {
    // ⚠️ THE FORBIDDEN LIST IS THE CONTRACT. A polish pass that may add a claim
    // is a second writer with no plan and no validator behind it.
    expect([...POLISH_MAY_NOT]).toEqual([
      'add a claim that was not there',
      'change a product fact',
      'invent an anecdote',
      'change the call to action',
      'change the premise',
    ])
  })

  it('and the breath limit catches its own worked example', () => {
    // ⚠️ A THRESHOLD THAT MISSES THE SENTENCE IT WAS WRITTEN FOR is decoration.
    // The essay line is 25 words; the first draft of this limit was 28.
    expect(SPOKEN_WORDS_HARD_MAX).toBe(22)
  })
})
