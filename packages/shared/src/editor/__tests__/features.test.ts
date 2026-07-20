import { describe, expect, it } from 'vitest'
import {
  EDITOR_FEATURES,
  isRemovalKindEnabled,
  selectableRemovalCandidates,
  type SpeechCandidate,
} from '../index'

const cand = (kind: SpeechCandidate['kind'], id: string): SpeechCandidate => ({
  id, kind, startMs: 0, endMs: 10, wordIds: [], prevWordId: null, nextWordId: null,
  confidence: 'high', safeToConsider: true, evidenceCodes: [], evidence: {}, ruleVersion: 'speech-rules-3',
})

const all: SpeechCandidate[] = [
  cand('silence', 'c0'), cand('filler', 'c1'), cand('false_start', 'c2'),
  cand('repetition', 'c3'), cand('filler', 'c4'),
]

describe('editor feature gating (auto filler-removal NOT shipped)', () => {
  it('ships with auto filler-removal DISABLED by default', () => {
    expect(EDITOR_FEATURES.autoFillerRemoval).toBe(false)
  })

  it('the shipped default drops EVERY filler candidate from removal selection', () => {
    const sel = selectableRemovalCandidates(all)
    expect(sel.map((c) => c.kind)).toEqual(['silence', 'false_start', 'repetition'])
    expect(sel.some((c) => c.kind === 'filler')).toBe(false)
  })

  it('accepts silence / false_start / repetition evidence (Phase 5 PASS scope)', () => {
    for (const k of ['silence', 'false_start', 'repetition'] as const) {
      expect(isRemovalKindEnabled(k)).toBe(true)
    }
    expect(isRemovalKindEnabled('filler')).toBe(false)
  })

  it('only an EXPLICIT enablement flag lets a filler candidate be selected', () => {
    const sel = selectableRemovalCandidates(all, { autoFillerRemoval: true })
    expect(sel.filter((c) => c.kind === 'filler').map((c) => c.id)).toEqual(['c1', 'c4'])
    expect(isRemovalKindEnabled('filler', { autoFillerRemoval: true })).toBe(true)
  })

  it('the default flags object is frozen (cannot be mutated to enable in place)', () => {
    expect(Object.isFrozen(EDITOR_FEATURES)).toBe(true)
    expect(() => { (EDITOR_FEATURES as { autoFillerRemoval: boolean }).autoFillerRemoval = true }).toThrow()
  })
})
