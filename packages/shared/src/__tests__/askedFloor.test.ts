// THE CREATOR TYPED THE ANSWER AND IT COMPETED ON KEYWORD OVERLAP.
//
// ⚠️ THE INVERSION. `source = 'asked'` is the only material in this store with
// no extraction step between the creator and the row: they were shown a specific
// gap and typed the answer to it. Every other row is a model recovering a
// position from evidence. And yet an answer competed for its slot on keyword
// overlap with the brief, against caption rows that record only that a video was
// made about something — so the richest material in the store lost slots to the
// weakest, on a measure that cannot see the difference.
//
// ⚠️⚠️ AND THIS IS HONESTLY A NO-OP TODAY, WHICH IS SAID HERE RATHER THAN
// DISCOVERED LATER. §G52: the ask-beat answer path is wired and has never
// carried a row. Zero stored rows carry `source: 'asked'`, so this changes no
// script that exists. It is built now because the alternative is finding the
// inversion on the day the first creator answers a question.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  selectSpeakable, ASKED_FLOOR, FIRST_PERSON_FLOOR, wasAsked, SPOKEN_SOURCES,
} from '../knowledgeSelection'
import { ASKED_SOURCE } from '../creatorQuestions'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

type Item = { kind: string; text: string; basis?: string | null; source?: string | null }
const asked = (text: string): Item => ({ kind: 'opinion', text, basis: 'stated', source: 'asked' })
const spoken = (text: string, kind = 'claim'): Item => ({ kind, text, basis: 'stated', source: 'transcript' })
const caption = (text: string): Item => ({ kind: 'claim', text, basis: 'demonstrated', source: 'caption' })

describe('an answer cannot be pushed out by material that outranks it on overlap', () => {
  it('reaches the prompt even when relevance put it last', () => {
    // ⚠️ THE EXACT PRODUCTION SHAPE: a brief about phones, an answer about
    // pricing that scores zero overlap, and a store full of ranked transcript
    // rows ahead of it.
    const ranked = [...Array.from({ length: 9 }, (_, i) => spoken(`t${i}`)), asked('I charge £400')]
    const out = selectSpeakable(ranked, 6, 6)
    expect(out.map((i) => i.text)).toContain('I charge £400')
  })

  it('is bounded — twenty answers do not become the whole prompt', () => {
    // ⚖️ THE OPPOSITE FAILURE, AND IT IS WHY THIS IS NOT "ALWAYS INCLUDE". A
    // creator who has answered twenty questions must not have a video about a
    // phone written out of what they once typed about pricing.
    //
    // ⚠️ THE CLAIM IS ABOUT THE PROMOTION, NOT THE TOTAL, and a first draft of
    // this test got that wrong by stacking the answers at the FRONT — where
    // relevance had already put them and no promotion was needed. What is
    // bounded is how many answers are moved OUT of relevance order. If relevance
    // itself ranks twenty answers highest, they win on relevance, and this
    // module's standing rule holds: a floor is a minimum, never a maximum.
    const ranked = [
      ...Array.from({ length: 20 }, (_, i) => spoken(`t${i}`)),
      ...Array.from({ length: 20 }, (_, i) => asked(`a${i}`)),
    ]
    const out = selectSpeakable(ranked, 6, 6)
    expect(out.filter((i) => wasAsked(i))).toHaveLength(ASKED_FLOOR)
  })

  it('does not CAP answers that relevance ranked highest anyway', () => {
    // ⚖️ The companion to the test above, and the reason it is worth having
    // both: the bound must not turn into a ceiling on the creator's own answers.
    const ranked = Array.from({ length: 6 }, (_, i) => asked(`a${i}`))
    expect(selectSpeakable(ranked, 6, 6).filter(wasAsked)).toHaveLength(6)
  })

  it('reserves, never injects — an empty channel changes nothing', () => {
    // ⚠️ WITH NO ANSWERS IN THE STORE THIS MUST BE BYTE-IDENTICAL TO BEFORE,
    // which is the state of every creator in production today.
    const ranked = [spoken('a'), caption('b'), spoken('c'), caption('d')]
    expect(selectSpeakable(ranked, 3, 2)).toEqual(
      // The same call with no `asked` row anywhere is the control.
      selectSpeakable([...ranked], 3, 2))
    expect(selectSpeakable(ranked, 3, 2).map((i) => i.text)).toEqual(['a', 'c', 'b'])
  })

  it('promoted answers keep their relative order — a partition, not a sort', () => {
    //
    // ⚠️ ASSERTED ON THE HEAD OF THE LIST, NOT ON WHICH ANSWERS APPEAR. With
    // more slots than items every answer is returned regardless — the promotion
    // decides ORDER, and the order is what a bounded reservation is about.
    const ranked = [spoken('t'), asked('second'), asked('first'), asked('third')]
    const out = selectSpeakable(ranked, 6, 6).map((i) => i.text)
    expect(out.slice(0, 2)).toEqual(['second', 'first'])
  })
})

describe('the two floors compose instead of evicting each other', () => {
  it('an answer and an episode both land when the floor has room', () => {
    // ⚖️ Answers enter at the HEAD of the reservation, the episode takes its
    // LAST slot, so neither can evict the other while floor >= 2.
    const ranked = [
      asked('typed'), spoken('c1'), spoken('c2'), spoken('c3'),
      spoken('my episode', 'experience'),
    ]
    const out = selectSpeakable(ranked, 4, 4)
    expect(out.map((i) => i.text)).toContain('typed')
    expect(out.map((i) => i.text)).toContain('my episode')
  })

  it('at floor 1 the EPISODE wins, and the unmeasured rule yields', () => {
    // ⚠️ DELIBERATE AND WORTH STATING. The first-person floor was measured 17-7;
    // this one has no production data at all. An unmeasured preference does not
    // get to displace a measured one.
    const ranked = [asked('typed'), spoken('my episode', 'experience')]
    const out = selectSpeakable(ranked, 1, 1)
    expect(out.map((i) => i.text)).toEqual(['my episode'])
    expect(FIRST_PERSON_FLOOR).toBe(1)
  })
})

describe('the source value is one string, not two that agree today', () => {
  it('matches creatorQuestions.ASKED_SOURCE', () => {
    // The constant is duplicated rather than imported, so that this module does
    // not depend on the question machinery to answer a selection question. A
    // duplicate is only allowed where a test fails when the copies disagree.
    expect(wasAsked({ source: ASKED_SOURCE })).toBe(true)
    expect(SPOKEN_SOURCES.has(ASKED_SOURCE)).toBe(true)
  })

  it('nothing else counts as asked', () => {
    for (const s of ['transcript', 'caption', 'user', 'previous_video', '', null]) {
      expect(wasAsked({ source: s })).toBe(false)
    }
  })
})

describe('the edge carries the same floor', () => {
  it('mirrors the constant and the promotion', () => {
    expect(EDGE).toMatch(/const ASKED_FLOOR = 2/)
    expect(EDGE).toMatch(/\.slice\(0, ASKED_FLOOR\)/)
    expect(EDGE).toMatch(/const bySpokenFirst = \[\.\.\.promotedAsked, \.\.\.spoken\.filter\(\(i\) => !promotedSet\.has\(i\)\), \.\.\.rest\]/)
  })

  it('the two constants are the same number', () => {
    expect(Number(/const ASKED_FLOOR = (\d+)/.exec(EDGE)?.[1])).toBe(ASKED_FLOOR)
  })
})
