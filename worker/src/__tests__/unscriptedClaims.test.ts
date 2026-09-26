import { describe, expect, it } from 'vitest'
import { claimKinds, unscriptedClaims } from '../jobs/unscriptedClaims.js'

const tok = (t: string) => ({ key: t.toLowerCase().replace(/[^\p{L}\p{N}']/gu, ''), text: t })

describe('unscripted claims on the take (Fix B)', () => {
  it('names the kind of claim an ad-lib makes', () => {
    expect(claimKinds('and it is only $28 today')).toEqual(['price'])
    expect(claimKinds('honestly I use this every morning')).toEqual(['personal_use'])
    expect(claimKinds('the best mug you will ever own')).toEqual(['superlative'])
    expect(claimKinds('cuts prep by 40 percent')).toEqual(['number'])
    expect(claimKinds('okay let me try that again')).toEqual([])
  })

  it('flags only claim-shaped runs of 3+ unscripted words, with their time', () => {
    const spoken = ['Meet', 'the', 'bowl', 'I', 'use', 'it', 'daily', 'um', 'so', 'yeah'].map(tok)
    const words = spoken.map((_, i) => ({ startMs: i * 500, endMs: i * 500 + 400 }))
    const ops = [
      { kind: 'match' as const, scriptIdx: 0, spokenIdx: 0 },
      { kind: 'match' as const, scriptIdx: 1, spokenIdx: 1 },
      { kind: 'match' as const, scriptIdx: 2, spokenIdx: 2 },
      ...[3, 4, 5, 6].map((i) => ({ kind: 'insertion' as const, spokenIdx: i })),
      { kind: 'deletion' as const, scriptIdx: 3 },
      ...[7, 8, 9].map((i) => ({ kind: 'insertion' as const, spokenIdx: i })),
    ]
    const out = unscriptedClaims({ ops }, spoken, words)
    expect(out).toEqual([{ text: 'I use it daily', kinds: ['personal_use'], startMs: 1500, endMs: 3400 }])
  })
})
