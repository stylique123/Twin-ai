import { describe, it, expect } from 'vitest'
import { parallelTriadsIn, parallelTriadNote, REPEATS_TO_FLAG } from '../parallelTriads'

describe('the "X, Y, and Z" tic (Voice Cause 2)', () => {
  it('finds a triadic list in a line', () => {
    const hits = parallelTriadsIn('It was fast, cheap, and reliable.')
    expect(hits).toEqual([{ text: 'It was fast, cheap, and reliable' }])
  })

  it('finds nothing in an ordinary sentence', () => {
    expect(parallelTriadsIn('I built the whole thing myself, over a weekend.')).toEqual([])
  })

  // ⚖️ CAPPED AT 4 WORDS PER ITEM — a real compound sentence with longer
  // clauses is not the templated cadence this exists to catch.
  it('does not flag a compound sentence with long clauses', () => {
    const hits = parallelTriadsIn(
      'I built the company from nothing, I hired the entire founding team myself, and I raised the whole round without an intro.')
    expect(hits).toEqual([])
  })

  it('finds multiple triads in one line', () => {
    const hits = parallelTriadsIn('It was fast, cheap, and reliable, and also light, small, and quiet.')
    expect(hits.length).toBe(2)
  })

  describe('parallelTriadNote', () => {
    it('is silent for a single triad anywhere in the script', () => {
      expect(parallelTriadNote([{ text: 'fast, cheap, and reliable' }])).toBeNull()
    })

    it('fires once the count reaches the repeat threshold', () => {
      const hits = Array.from({ length: REPEATS_TO_FLAG }, () => ({ text: 'fast, cheap, and reliable' }))
      const note = parallelTriadNote(hits)
      expect(note).not.toBeNull()
      expect(note).toContain(String(REPEATS_TO_FLAG))
    })

    it('is silent on an empty script', () => {
      expect(parallelTriadNote([])).toBeNull()
    })

    // ⚖️ NEVER SAYS THE SHAPE IS WRONG, ONLY THAT IT REPEATED — matches
    // hookVariety.ts's discipline for a different repeated-shape defect.
    it('never calls the pattern itself wrong', () => {
      const hits = Array.from({ length: 3 }, () => ({ text: 'fast, cheap, and reliable' }))
      expect(parallelTriadNote(hits)?.toLowerCase()).not.toMatch(/wrong|bad|error/)
    })
  })
})
