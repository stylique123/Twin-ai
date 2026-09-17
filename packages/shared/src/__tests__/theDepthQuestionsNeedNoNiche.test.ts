// A QUESTION ASKED BEFORE THE NICHE IS READ MUST NOT MENTION A NICHE.
//
// ⚠️ THIS IS THE RECORDED REASON THE STORY THREE LEFT THE SCAN SCREEN, and it is
// the only reason. `Onboarding.storiesAfterDna` states it: "they used to render
// during the scan, and that is why they read as generic. At that moment there is
// no niche, no `sells`, no follower count — so every creator met the same three
// sentences, including 'what does almost everyone in your NICHE believe', asked
// before her niche had been read. The wording table existed and its inputs
// arrived after the screen."
//
// ⚠️ SO THE OBJECTION IS ABOUT WORDING, NOT ABOUT THE SCREEN — and it caught my
// first pick. `number_that_matters` is the obvious claim question and reads
// "most people in YOUR NICHE ignore", so putting it on the scan step would have
// reintroduced the exact sentence that decision removed. The property is
// asserted here rather than left to whoever edits the list next.
import { describe, it, expect } from 'vitest'
import { CREATOR_QUESTIONS, DEPTH_QUESTION_IDS, OPENING_THREE } from '../creatorQuestions'
import { SUBSTANCE_KINDS } from '../knowledgeSelection'

/** The placeholders that stand in for a niche the scan has not read yet. */
const NEEDS_A_NICHE = /\bin your (?:niche|industry|corner of the internet|corner|field)\b|\byour trade\b/i

const depth = () => DEPTH_QUESTION_IDS
  .map((id) => CREATOR_QUESTIONS.find((q) => q.id === id))
  .filter((q): q is (typeof CREATOR_QUESTIONS)[number] => !!q)

describe('the depth questions are answerable before the scan lands', () => {
  it('every id exists in the bank — nothing was invented for this screen', () => {
    expect(depth()).toHaveLength(DEPTH_QUESTION_IDS.length)
    expect(DEPTH_QUESTION_IDS.length).toBeGreaterThan(0)
  })

  it('NONE of them mentions a niche, an industry or a trade', () => {
    for (const q of depth()) {
      expect(NEEDS_A_NICHE.test(q.ask), `${q.id} asks "${q.ask}" before the niche is read`).toBe(false)
      expect(NEEDS_A_NICHE.test(q.hint), `${q.id}'s hint names a niche`).toBe(false)
    }
  })

  // ⚠️ REFUSES A VACUOUS PASS. If the regex matched nothing at all the test
  // above would pass on any list, so the bank is asserted to CONTAIN questions
  // it would reject.
  it('and the rule really does reject the questions it is meant to', () => {
    const rejected = CREATOR_QUESTIONS.filter((q) => NEEDS_A_NICHE.test(q.ask))
    expect(rejected.length, 'the niche rule matches nothing — it is not testing anything')
      .toBeGreaterThan(0)
    expect(rejected.map((q) => q.id)).toContain('number_that_matters')
    expect(rejected.map((q) => q.id)).toContain('contrarian')
  })

  it('does not overlap the story three, which are asked on their own screen', () => {
    for (const id of DEPTH_QUESTION_IDS) {
      expect(OPENING_THREE, `${id} is asked twice`).not.toContain(id)
    }
  })

  it('and every one mints a kind the writer admits', () => {
    for (const q of depth()) {
      expect(SUBSTANCE_KINDS.has(q.kind), `${q.id} mints '${q.kind}', which the selector drops`).toBe(true)
    }
  })

  // ⚖️ THE POINT OF ASKING THESE TWO RATHER THAN ANY TWO: they are the kinds the
  // store measurably lacks. `figures` is 2 across 374 caption-derived items, and
  // the physio runs produced three scripts with zero first-person episodes
  // because the store was all opinions.
  it('covers the kinds the story three leave at zero', () => {
    const storyKinds = new Set(OPENING_THREE
      .map((id) => CREATOR_QUESTIONS.find((q) => q.id === id)?.kind)
      .filter(Boolean))
    for (const q of depth()) {
      expect(storyKinds.has(q.kind), `${q.id} repeats a kind the story three already cover`).toBe(false)
    }
  })
})
