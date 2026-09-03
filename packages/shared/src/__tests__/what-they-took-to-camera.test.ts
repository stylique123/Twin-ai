import { describe, it, expect } from 'vitest'
import { acceptedFinalStamp, isNewAcceptance, acceptanceKind } from '../acceptedFinal'

const script = (lines: (string | null)[], id = 'gen-1') => ({
  generation_id: id,
  scenes: lines.map((dialogue) => ({ dialogue, duration_sec: 4, caption_text: 'hint' })),
})

describe('acceptedFinalStamp — the version they stopped at', () => {
  it('stamps the generation, the words and the shape', () => {
    const s = acceptedFinalStamp(script(['Nobody tells you this', 'So I tried it']))
    expect(s?.generationId).toBe('gen-1')
    expect(s?.sceneCount).toBe(2)
    expect(s?.wordCount).toBe(8)
    expect(s?.sha).toMatch(/^[0-9a-f]{8}$/)
  })

  it('the SAME words hash the same, so a re-entry is recognisable', () => {
    const a = acceptedFinalStamp(script(['one line', 'two line']))
    const b = acceptedFinalStamp(script(['one line', 'two line']))
    expect(a?.sha).toBe(b?.sha)
  })

  it('a changed word changes the hash', () => {
    const a = acceptedFinalStamp(script(['one line', 'two line']))
    const b = acceptedFinalStamp(script(['one line', 'three line']))
    expect(a?.sha).not.toBe(b?.sha)
  })

  // ⚠️ THE FALSE POSITIVE THAT WOULD POISON THE CORPUS.
  it('re-estimated durations and caption hints do NOT change the hash', () => {
    const base = acceptedFinalStamp(script(['same words here']))
    const drifted = acceptedFinalStamp({
      generation_id: 'gen-1',
      scenes: [{ dialogue: 'same words here', duration_sec: 99, caption_text: 'totally different' }],
    })
    expect(base?.sha).toBe(drifted?.sha)
  })

  it('whitespace and line wrapping are not edits', () => {
    const a = acceptedFinalStamp(script(['  the   same    words ']))
    const b = acceptedFinalStamp(script(['the same words']))
    expect(a?.sha).toBe(b?.sha)
  })

  it('reordered scenes are a different script', () => {
    const a = acceptedFinalStamp(script(['first', 'second']))
    const b = acceptedFinalStamp(script(['second', 'first']))
    expect(a?.sha).not.toBe(b?.sha)
  })

  it('a moved word boundary is not a collision', () => {
    // Bare concatenation would make these identical.
    const a = acceptedFinalStamp(script(['ab', 'c']))
    const b = acceptedFinalStamp(script(['a', 'bc']))
    expect(a?.sha).not.toBe(b?.sha)
  })

  it('a silent scene still counts as a scene but adds no words', () => {
    const s = acceptedFinalStamp(script(['spoken line', null]))
    expect(s?.sceneCount).toBe(2)
    expect(s?.wordCount).toBe(2)
  })

  // ⚠️ NULL, NOT A ZERO STAMP.
  it('nothing to stamp yields null rather than an empty acceptance', () => {
    expect(acceptedFinalStamp(null)).toBeNull()
    expect(acceptedFinalStamp(undefined)).toBeNull()
    expect(acceptedFinalStamp({ generation_id: 'g', scenes: [] })).toBeNull()
    expect(acceptedFinalStamp({ generation_id: 'g', scenes: [{ dialogue: '   ' }] })).toBeNull()
    expect(acceptedFinalStamp({ generation_id: '', scenes: [{ dialogue: 'words' }] })).toBeNull()
    expect(acceptedFinalStamp({ scenes: [{ dialogue: 'words' }] })).toBeNull()
  })

  it('a non-array scenes field does not throw', () => {
    expect(acceptedFinalStamp({ generation_id: 'g', scenes: 'nope' })).toBeNull()
  })
})

describe('isNewAcceptance — a re-entry is not a second acceptance', () => {
  it('no prior stamp is a FIRST acceptance, not an unchanged one', () => {
    const s = acceptedFinalStamp(script(['words here']))
    expect(isNewAcceptance(null, s)).toBe(true)
    expect(isNewAcceptance(undefined, s)).toBe(true)
    expect(isNewAcceptance('', s)).toBe(true)
  })

  it('the same script opened again is not a new acceptance', () => {
    const s = acceptedFinalStamp(script(['words here']))
    expect(isNewAcceptance(s!.sha, s)).toBe(false)
  })

  it('an edited script opened again IS a new acceptance', () => {
    const first = acceptedFinalStamp(script(['words here']))
    const second = acceptedFinalStamp(script(['different words here']))
    expect(isNewAcceptance(first!.sha, second)).toBe(true)
  })

  it('nothing to stamp is never an acceptance, whatever came before', () => {
    expect(isNewAcceptance(null, null)).toBe(false)
    expect(isNewAcceptance('abc12345', null)).toBe(false)
  })
})

describe('acceptanceKind — first and changed are different pairs, not one boolean', () => {
  const s1 = acceptedFinalStamp({ generation_id: 'g', scenes: [{ dialogue: 'first words' }] })
  const s2 = acceptedFinalStamp({ generation_id: 'g', scenes: [{ dialogue: 'edited words' }] })

  it('no prior stamp is a FIRST acceptance', () => {
    expect(acceptanceKind(null, s1)).toBe('first')
    expect(acceptanceKind(undefined, s1)).toBe('first')
    expect(acceptanceKind('', s1)).toBe('first')
  })

  it('the same words again is a REPEAT, not a decision', () => {
    expect(acceptanceKind(s1!.sha, s1)).toBe('repeat')
  })

  it('different words after a prior acceptance is CHANGED — the stronger pair', () => {
    expect(acceptanceKind(s1!.sha, s2)).toBe('changed')
  })

  it('nothing to stamp is NONE, whatever came before', () => {
    expect(acceptanceKind(null, null)).toBe('none')
    expect(acceptanceKind(s1!.sha, null)).toBe('none')
  })

  it('first and changed are not the same value — the defect this replaced', () => {
    expect(acceptanceKind(null, s1)).not.toBe(acceptanceKind(s1!.sha, s2))
  })
})
