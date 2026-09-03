import { describe, it, expect } from 'vitest'
import { nextQuestionByDeficit, storeGap } from '../questionDeficit'
import { nextQuestion, CREATOR_QUESTIONS } from '../creatorQuestions'

describe('nextQuestionByDeficit — ask about what the store lacks', () => {
  it('an EMPTY store behaves exactly like the old fixed order', () => {
    // The property this must not cost: the first two questions are the ones
    // whose answers most change a script.
    const empty = { opinion: 0, experience: 0, framework: 0, claim: 0 }
    expect(nextQuestionByDeficit([], empty)?.id).toBe(nextQuestion([])?.id)
    expect(nextQuestionByDeficit(['contrarian'], empty)?.id).toBe(nextQuestion(['contrarian'])?.id)
  })

  it('an UNREADABLE store falls back to bank order, never to "everything is scarce"', () => {
    expect(nextQuestionByDeficit([], null)?.id).toBe(nextQuestion([])?.id)
    expect(nextQuestionByDeficit([], undefined)?.id).toBe(nextQuestion([])?.id)
  })

  // ⚠️ THE PHYSIO CASE: a store full of opinions and no episodes.
  it('a store rich in opinions and empty of experience asks for experience', () => {
    const q = nextQuestionByDeficit([], { opinion: 12, experience: 0, framework: 3, claim: 2 })
    expect(q?.kind).toBe('experience')
  })

  it('the scarcest kind wins even when it is not zero', () => {
    const q = nextQuestionByDeficit([], { opinion: 9, experience: 4, framework: 1, claim: 7 })
    expect(q?.kind).toBe('framework')
  })

  it('a kind absent from the counts object is treated as having none', () => {
    const q = nextQuestionByDeficit([], { opinion: 5, framework: 5, claim: 5 })
    expect(q?.kind).toBe('experience')
  })

  // ⚖️ THE BUG THE `askable` FILTER EXISTS TO PREVENT.
  it('ignores a scarce kind that has no unanswered questions left', () => {
    const experienceIds = CREATOR_QUESTIONS.filter((q) => q.kind === 'experience').map((q) => q.id)
    const q = nextQuestionByDeficit(experienceIds, { opinion: 9, experience: 0, framework: 1, claim: 8 })
    expect(q).not.toBeNull()
    expect(q?.kind).not.toBe('experience')
    // framework is the scarcest of what remains
    expect(q?.kind).toBe('framework')
  })

  it('never returns a question already answered or skipped', () => {
    const put = CREATOR_QUESTIONS.slice(0, 4).map((q) => q.id)
    const q = nextQuestionByDeficit(put, { opinion: 0, experience: 0, framework: 0, claim: 0 })
    expect(put).not.toContain(q?.id)
  })

  it('returns null once the whole bank has been put', () => {
    const all = CREATOR_QUESTIONS.map((q) => q.id)
    expect(nextQuestionByDeficit(all, { opinion: 0 })).toBeNull()
    expect(nextQuestionByDeficit(all, null)).toBeNull()
  })

  it('negative and fractional counts cannot invert the ranking', () => {
    // A corrupt count must not make a well-stocked kind look scarcest.
    const q = nextQuestionByDeficit([], { opinion: -50, experience: 1, framework: 2, claim: 3 })
    expect(q?.kind).toBe('opinion') // clamped to 0, still genuinely the lowest
    const r = nextQuestionByDeficit([], { opinion: 2.9, experience: 3, framework: 4, claim: 5 })
    expect(r?.kind).toBe('opinion')
  })

  it('is deterministic — the same inputs give the same question', () => {
    const c = { opinion: 4, experience: 1, framework: 1, claim: 9 }
    const a = nextQuestionByDeficit([], c)
    const b = nextQuestionByDeficit([], c)
    expect(a?.id).toBe(b?.id)
  })
})

describe('storeGap — name the gap, never a target number', () => {
  it('names the first empty kind', () => {
    expect(storeGap({ opinion: 3, experience: 0, framework: 2, claim: 1 })).toBe('experience')
  })

  it('returns null when nothing is empty', () => {
    expect(storeGap({ opinion: 1, experience: 1, framework: 1, claim: 1 })).toBeNull()
  })

  it('returns null when the store could not be read', () => {
    expect(storeGap(null)).toBeNull()
    expect(storeGap(undefined)).toBeNull()
  })

  it('an absent key counts as empty', () => {
    expect(storeGap({ opinion: 5 })).toBe('experience')
  })
})
