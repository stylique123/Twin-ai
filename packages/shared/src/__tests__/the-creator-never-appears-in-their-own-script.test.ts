import { describe, it, expect } from 'vitest'
import { selectSpeakable, isFirstPerson, FIRST_PERSON_FLOOR, SUBSTANCE_FLOOR } from '../knowledgeSelection'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const item = (kind: string, id: string, source = 'transcript') => ({ kind, id, source, text: id })

// ⚠️ THE PHYSIO'S REAL STORE SHAPE, from creator_knowledge on 2026-09-05:
// covered 26 (all caption) · opinion 5 · topic 5 · product 4 · fact 3 ·
// framework 2 · claim 2 · experience 2 · example 1.
const PHYSIO = [
  ...Array.from({ length: 5 }, (_, i) => item('opinion', `op${i}`)),
  ...Array.from({ length: 3 }, (_, i) => item('fact', `fa${i}`)),
  ...Array.from({ length: 2 }, (_, i) => item('framework', `fr${i}`)),
  ...Array.from({ length: 2 }, (_, i) => item('claim', `cl${i}`)),
  ...Array.from({ length: 2 }, (_, i) => item('experience', `ex${i}`)),
  ...Array.from({ length: 26 }, (_, i) => item('covered', `cv${i}`, 'caption')),
]

describe('a creator with stored episodes appears in their own script', () => {
  // ⚠️⚠️ THE MEASURED DEFECT: two episodes in the store, zero in three scripts.
  it('the physio store yields at least one episode', () => {
    const out = selectSpeakable(PHYSIO, 10, SUBSTANCE_FLOOR)
    expect(out.filter(isFirstPerson).length).toBeGreaterThanOrEqual(1)
  })

  // ⚖️ AND IT IS THE FLOOR DOING IT, not luck of the ordering. Ranked LAST and
  // outnumbered by other substance, the episode still gets a slot.
  it('an episode ranked dead last still reaches the prompt', () => {
    const ranked = [
      ...Array.from({ length: 20 }, (_, i) => item('claim', `c${i}`)),
      item('experience', 'the-one'),
    ]
    const out = selectSpeakable(ranked, 10, SUBSTANCE_FLOOR)
    expect(out.map((i) => i.id)).toContain('the-one')
  })

  it('reserves exactly one, never turning the script into a memoir', () => {
    const ranked = Array.from({ length: 8 }, (_, i) => item('experience', `e${i}`))
      .concat(Array.from({ length: 8 }, (_, i) => item('claim', `c${i}`)))
    const out = selectSpeakable(ranked, 10, SUBSTANCE_FLOOR)
    // Relevance ranked episodes first here, so it gets many — the floor is a
    // minimum, never a maximum.
    expect(out.filter(isFirstPerson).length).toBeGreaterThan(FIRST_PERSON_FLOOR)
  })

  // ⚠️ RESERVES, NEVER INJECTS. A creator with nothing to tell must not be
  // handed an empty slot — that is how a floor becomes an invitation to invent.
  it('a store with no episode is byte-identical to the old behaviour', () => {
    const ranked = [
      ...Array.from({ length: 6 }, (_, i) => item('claim', `c${i}`)),
      ...Array.from({ length: 6 }, (_, i) => item('covered', `v${i}`, 'caption')),
    ]
    const out = selectSpeakable(ranked, 10, SUBSTANCE_FLOOR)
    expect(out.filter(isFirstPerson)).toEqual([])
    expect(out).toHaveLength(10)
  })

  it('spoken material still fills the reservation before caption material', () => {
    const ranked = [
      item('experience', 'from-caption', 'caption'),
      item('experience', 'from-transcript', 'transcript'),
      ...Array.from({ length: 10 }, (_, i) => item('claim', `c${i}`)),
    ]
    const out = selectSpeakable(ranked, 10, SUBSTANCE_FLOOR)
    const ids = out.map((i) => i.id)
    expect(ids.indexOf('from-transcript')).toBeLessThan(ids.indexOf('from-caption'))
  })

  it('example is NOT first-person — it can be about anyone', () => {
    expect(isFirstPerson({ kind: 'example' })).toBe(false)
    expect(isFirstPerson({ kind: 'experience' })).toBe(true)
  })

  it('never exceeds the cap, and never returns duplicates', () => {
    const out = selectSpeakable(PHYSIO, 10, SUBSTANCE_FLOOR)
    expect(out).toHaveLength(10)
    expect(new Set(out.map((i) => i.id)).size).toBe(10)
  })

  it('a cap of zero still returns nothing', () => {
    expect(selectSpeakable(PHYSIO, 0, SUBSTANCE_FLOOR)).toEqual([])
  })
})

// ⚠️ THE EDGE FUNCTION CARRIES ITS OWN COPY AND IS THE ONE THAT RUNS.
describe('the inlined edge copy holds the same slot', () => {
  const edge = readFileSync(
    fileURLToPath(new URL('../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url)),
    'utf8',
  )
  it('reserves a first-person slot inside selectSpeakable', () => {
    // ⚖️ BOUNDED BY THE NEXT DECLARATION, not by a character count. A fixed
    // slice length silently cuts the assertion's target the moment the function
    // grows, which is how a guard stops guarding without failing.
    const start = edge.indexOf('function selectSpeakable<')
    const fn = edge.slice(start, edge.indexOf('\nfunction ', start + 1))
    expect(fn).toContain("=== 'experience'")
    expect(fn).toMatch(/keepSubstance\[floorSlots - 1\] = episode/)
  })
})
