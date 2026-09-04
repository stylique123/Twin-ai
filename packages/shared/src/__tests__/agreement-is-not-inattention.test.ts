import { describe, it, expect } from 'vitest'
import {
  creatorPick, defaultCapture, defaultTaken, freeformEntry,
  upgradeOnCapture, isPreference, isAgreement, readHookVerdict,
  classifyStoredHook,
} from '../hookChoice'

describe('upgradeOnCapture — the recorder is the only moment that means something', () => {
  it('a load-time default becomes agreement when they go to camera', () => {
    expect(upgradeOnCapture(defaultCapture(0))).toEqual({ source: 'default_taken', index: 0 })
  })

  it('the index travels — WHICH option they kept is part of the fact', () => {
    expect(upgradeOnCapture(defaultCapture(3))?.index).toBe(3)
  })

  // ⚠️ THE WRITE THAT WOULD DESTROY A REAL PREFERENCE.
  it('a creator pick is never overwritten with agreement', () => {
    expect(upgradeOnCapture(creatorPick(2))).toBeNull()
    expect(upgradeOnCapture(creatorPick(0))).toBeNull()
  })

  it('their own words are never overwritten', () => {
    expect(upgradeOnCapture(freeformEntry())).toBeNull()
  })

  // ⚠️ RE-ENTRY IS NOT A SECOND AGREEMENT.
  it('opening the recorder again changes nothing', () => {
    expect(upgradeOnCapture(defaultTaken(0))).toBeNull()
  })

  // ⚠️ ABSENT IS NOT AGREEMENT.
  it('a row with no choice at all stays that way', () => {
    expect(upgradeOnCapture(null)).toBeNull()
    expect(upgradeOnCapture(undefined)).toBeNull()
  })

  it('a corrupt index on a default does not produce a corrupt agreement', () => {
    const odd = { source: 'default', index: null } as unknown as ReturnType<typeof defaultCapture>
    expect(upgradeOnCapture(odd)).toEqual({ source: 'default_taken', index: 0 })
  })
})

describe('isPreference — agreement must not be counted as a pick', () => {
  it('only a creator pick is a preference', () => {
    expect(isPreference(creatorPick(1))).toBe(true)
  })

  // ⚠️ THE BIAS 0134 EXISTS TO PREVENT, REBUILT ONE RELEASE LATER.
  it('agreement is NOT a preference', () => {
    expect(isPreference(defaultTaken(0))).toBe(false)
  })

  it('a load-time default and an unreadable row are not preferences', () => {
    expect(isPreference(defaultCapture(0))).toBe(false)
    expect(isPreference(freeformEntry())).toBe(false)
    expect(isPreference(null)).toBe(false)
    expect(isPreference(undefined)).toBe(false)
  })
})

describe('isAgreement — separate on purpose, so a reader has to say which it wants', () => {
  it('only default_taken is agreement', () => {
    expect(isAgreement(defaultTaken(0))).toBe(true)
    expect(isAgreement(defaultCapture(0))).toBe(false)
    expect(isAgreement(creatorPick(0))).toBe(false)
    expect(isAgreement(freeformEntry())).toBe(false)
    expect(isAgreement(null)).toBe(false)
  })

  it('the two questions never both answer true for one row', () => {
    for (const c of [creatorPick(1), defaultCapture(0), defaultTaken(0), freeformEntry(), null]) {
      expect(isPreference(c) && isAgreement(c)).toBe(false)
    }
  })
})

describe('readHookVerdict — five rows, five different things they testify to', () => {
  it('names each state distinctly', () => {
    expect(readHookVerdict(creatorPick(2))).toBe('chose')
    expect(readHookVerdict(defaultTaken(0))).toBe('agreed')
    expect(readHookVerdict(defaultCapture(0))).toBe('no_signal')
    expect(readHookVerdict(freeformEntry())).toBe('own_words')
    expect(readHookVerdict(null)).toBe('unreadable')
    expect(readHookVerdict(undefined)).toBe('unreadable')
  })

  // ⚠️ THE WHOLE POINT: THESE TWO USED TO BE THE SAME ROW.
  it('agreement and no-signal are different verdicts', () => {
    expect(readHookVerdict(defaultTaken(0))).not.toBe(readHookVerdict(defaultCapture(0)))
  })

  it('every verdict is distinct — no two states collapse', () => {
    const all = [creatorPick(1), defaultTaken(0), defaultCapture(0), freeformEntry(), null]
      .map(readHookVerdict)
    expect(new Set(all).size).toBe(all.length)
  })

  it('an unknown source reads unreadable rather than agreement', () => {
    const bogus = { source: 'sponsored', index: 0 } as unknown as ReturnType<typeof creatorPick>
    expect(readHookVerdict(bogus)).toBe('unreadable')
    expect(isAgreement(bogus)).toBe(false)
    expect(isPreference(bogus)).toBe(false)
  })
})

describe('classifyStoredHook — the backfill is unchanged and still cannot recover agreement', () => {
  it('still reads option[0] as a load-time default, never as agreement', () => {
    // The 14 existing rows are a permanent loss; this must not start guessing.
    expect(classifyStoredHook('a', ['a', 'b', 'c'])).toEqual({ source: 'default', index: 0 })
    expect(classifyStoredHook('b', ['a', 'b', 'c'])).toEqual({ source: 'creator', index: 1 })
    expect(classifyStoredHook('zzz', ['a', 'b'])).toEqual({ source: 'freeform', index: null })
  })
})
