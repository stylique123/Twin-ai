// A RE-EXTRACT WAS DESTROYING EVERY CONFIRMATION THE CREATOR HAD MADE.
//
// ⚠️ THE DEFECT. `extract_product` finished with a wholesale replace —
// `update({ knowledge: facts })` — and `confirmProductFacts` writes a creator's
// approvals INTO THAT SAME JSONB, flipping `source` to `user_confirmed` on the
// facts they personally vouched for.
//
// So the second extraction destroyed the first one's confirmations. Work through
// ten held prices by hand, paste the link again a month later, and all ten
// silently revert to `needs_confirmation`. Nothing tells the creator; the only
// sign is being asked again about facts they already approved.
//
// The spec forbids exactly this, in the section that named the feature: refresh
// "SHOWS WHAT CHANGED … rather than silently rewriting user-confirmed truth."
//
// ⚖️ AND THE FIX IS NOT A LOCK. Prices change. A confirmed $16 that is now $19
// is not truth to protect, it is truth that has EXPIRED, and hiding the new
// number would make refresh worse than useless. A confirmed fact is never
// silently overwritten AND never silently kept — it is kept and the
// disagreement is reported, because the creator is the one who retires
// something they vouched for.
import { describe, expect, it } from 'vitest'
import {
  mergeExtraction, describeChange, needsAttention, isStale, factAgeDays,
  FIELD_HALFLIFE_DAYS, UNKNOWN_AGE_DAYS,
} from '../productFreshness'
import type { ExtractedFact } from '../productExtraction'

const AT = '2026-08-01T00:00:00.000Z'
const NOW = new Date('2026-08-13T00:00:00.000Z')

function f(over: Partial<ExtractedFact> & Pick<ExtractedFact, 'field' | 'value'>): ExtractedFact {
  return {
    source: 'official_product_page', sourceUrl: 'https://x.test', trust: 'usable',
    extractedAt: AT, ...over,
  } as ExtractedFact
}
const confirmed = (field: ExtractedFact['field'], value: string) =>
  f({ field, value, source: 'user_confirmed', trust: 'usable' })

describe('a confirmation survives a re-extract', () => {
  it('keeps a confirmed fact the page has stopped mentioning', () => {
    // ⚠️ THE EXACT CASE THE REPLACE PERFORMED SILENTLY.
    const { knowledge, changes } = mergeExtraction(
      [confirmed('price', '$16/mo'), f({ field: 'name', value: 'TwinAI' })],
      [f({ field: 'name', value: 'TwinAI' })],
    )
    expect(knowledge.map((k) => k.value)).toContain('$16/mo')
    expect(knowledge.find((k) => k.value === '$16/mo')!.source).toBe('user_confirmed')
    expect(changes).toContainEqual({ kind: 'vanished', field: 'price', value: '$16/mo' })
  })

  it('keeps it AND reports the disagreement when the page says something else', () => {
    // ⚖️ BOTH FACTS MATTER. Dropping the creator's is the old bug; hiding the
    // page's would make the refresh pointless.
    const { knowledge, changes } = mergeExtraction(
      [confirmed('price', '$16/mo')],
      [f({ field: 'price', value: '$19/mo' })],
    )
    expect(knowledge.map((k) => k.value).sort()).toEqual(['$16/mo', '$19/mo'])
    expect(changes).toContainEqual({
      kind: 'disputed', field: 'price', confirmed: '$16/mo', found: '$19/mo',
    })
    expect(needsAttention(changes)).toHaveLength(1)
    expect(describeChange(changes.find((c) => c.kind === 'disputed')!))
      .toMatch(/You confirmed price "\$16\/mo".*now says "\$19\/mo".*Yours is kept/)
  })

  it('never duplicates a confirmed fact the page still agrees with', () => {
    const { knowledge, changes } = mergeExtraction(
      [confirmed('name', 'TwinAI')],
      [f({ field: 'name', value: 'TwinAI' })],
    )
    expect(knowledge).toHaveLength(1)
    expect(knowledge[0].source).toBe('user_confirmed')
    expect(changes).toHaveLength(0)
  })

  it('survives ten confirmations at once, which is the reported scenario', () => {
    const before = Array.from({ length: 10 }, (_, i) => confirmed('plan', `Plan ${i}`))
    const { knowledge } = mergeExtraction(before, [f({ field: 'name', value: 'TwinAI' })])
    expect(knowledge.filter((k) => k.source === 'user_confirmed')).toHaveLength(10)
  })
})

describe('an unconfirmed fact is the extractor\'s to replace', () => {
  it('replaces a changed single-valued field and says so', () => {
    const { knowledge, changes } = mergeExtraction(
      [f({ field: 'price', value: '$16/mo' })],
      [f({ field: 'price', value: '$19/mo' })],
    )
    expect(knowledge.map((k) => k.value)).toEqual(['$19/mo'])
    expect(changes).toContainEqual({
      kind: 'updated', field: 'price', from: '$16/mo', to: '$19/mo',
    })
    // ⚖️ NOT worth interrupting the creator for — nobody vouched for the old one.
    expect(needsAttention(changes)).toHaveLength(0)
  })

  it('drops one that is simply gone', () => {
    const { knowledge, changes } = mergeExtraction(
      [f({ field: 'cta', value: 'Start free' })], [],
    )
    expect(knowledge).toHaveLength(0)
    expect(changes).toContainEqual({ kind: 'removed', field: 'cta', value: 'Start free' })
  })

  it('treats a second FEATURE as an addition, not a replacement', () => {
    // ⚠️ A PRODUCT HAS ONE PRICE AND MANY FEATURES. Reporting every new feature
    // as "changed" would make the diff a wall of churn nobody reads.
    const { knowledge, changes } = mergeExtraction(
      [f({ field: 'feature', value: 'Auto captions' })],
      [f({ field: 'feature', value: 'Auto captions' }), f({ field: 'feature', value: 'Teleprompter' })],
    )
    expect(knowledge).toHaveLength(2)
    expect(changes).toEqual([{ kind: 'added', fact: expect.objectContaining({ value: 'Teleprompter' }) }])
  })
})

describe('never-extracted and extracted-nothing stay different', () => {
  it('takes everything when there was nothing before', () => {
    const { knowledge, changes } = mergeExtraction(null, [f({ field: 'name', value: 'TwinAI' })])
    expect(knowledge).toHaveLength(1)
    expect(changes).toEqual([{ kind: 'added', fact: expect.objectContaining({ value: 'TwinAI' }) }])
  })

  it('reports nothing at all when both sides are empty', () => {
    expect(mergeExtraction([], [])).toEqual({ knowledge: [], changes: [] })
  })

  it('keeps confirmations even when the page reads as empty', () => {
    // An unreadable page stores `[]`. That must not be a delete instruction.
    const { knowledge } = mergeExtraction([confirmed('name', 'TwinAI')], [])
    expect(knowledge).toHaveLength(1)
  })
})

describe('freshness is a property of the FIELD', () => {
  it('ages commercial terms faster than identity', () => {
    // "Pricing and offers age faster than name and category" — §8.
    expect(FIELD_HALFLIFE_DAYS.price).toBeLessThan(FIELD_HALFLIFE_DAYS.feature)
    expect(FIELD_HALFLIFE_DAYS.feature).toBeLessThan(FIELD_HALFLIFE_DAYS.name)
  })

  it('calls a 90-day-old price stale and a 90-day-old name fresh', () => {
    // ⚠️ ONE GLOBAL TTL WOULD HAVE TO BE THE SHORTEST, and a product's NAME
    // going amber is how a staleness indicator becomes furniture.
    const old = '2026-05-01T00:00:00.000Z'
    expect(isStale(f({ field: 'price', value: '$16', extractedAt: old }), NOW)).toBe(true)
    expect(isStale(f({ field: 'name', value: 'TwinAI', extractedAt: old }), NOW)).toBe(false)
  })

  it('treats an unreadable timestamp as UNKNOWN, never as young', () => {
    // ⚖️ Three-state discipline: unrecorded is not fresh.
    expect(factAgeDays({ extractedAt: null }, NOW)).toBe(UNKNOWN_AGE_DAYS)
    expect(factAgeDays({ extractedAt: 'not a date' }, NOW)).toBe(UNKNOWN_AGE_DAYS)
    expect(isStale(f({ field: 'name', value: 'X', extractedAt: '' }), NOW)).toBe(true)
  })

  it('clamps a future timestamp to zero rather than reporting it negative', () => {
    // A clock problem is not a fresher-than-fresh fact, and a negative age would
    // sort ahead of everything real.
    expect(factAgeDays({ extractedAt: '2027-01-01T00:00:00.000Z' }, NOW)).toBe(0)
  })

  it('covers every extractable field, so none falls through to a guess', () => {
    // A field with no half-life would silently take the 180-day default, and the
    // one most likely to be added next is a commercial term.
    const fields = Object.keys(FIELD_HALFLIFE_DAYS)
    for (const need of ['price', 'plan', 'guarantee', 'cta', 'name', 'category', 'feature'])
      expect(fields).toContain(need)
  })
})
