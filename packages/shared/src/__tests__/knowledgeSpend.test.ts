// A FORTY-FACT STORE PRODUCED ONE GOOD SCRIPT AND FIVE REPEATS OF IT.
//
// ⚠️ THE MECHANISM, AND IT IS ARITHMETIC RATHER THAN JUDGEMENT. The selector is
// deterministic on inputs that barely move — relevance against the brief, then
// `times_seen`, then kind — so running it twice on the same niche returns the
// same rows twice. Nothing recorded that a thing had already been said.
//
// ⚠️ AND MORE SUPPLY WOULD NOT HAVE FIXED IT. Everything else on the depth
// roadmap gets MORE material; this makes the material already held reach a
// script. Pouring supply into a selector that spends the same six rows forever
// does not move the number it appears to move.
import { describe, it, expect } from 'vitest'
import { coolBySpend, spendWear, SPEND_COOLDOWN_DAYS } from '../knowledgeSpend'
import type { SpendRecord } from '../knowledgeSpend'

const NOW = new Date('2026-09-17T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()
const rec = (lastSpentAt: string | null, spendCount: number): SpendRecord =>
  ({ lastSpentAt, spendCount })

describe('spendWear — never spent is its own state', () => {
  it('a row nobody has ever used ranks ahead of everything', () => {
    // ⚖️ It is supply this product paid a model to extract and has never once
    // delivered. Collapsing it with "spent in March" makes the ranking
    // indifferent to exactly the rows this change exists to surface.
    expect(spendWear(rec(null, 0), NOW)).toBeLessThan(spendWear(rec(daysAgo(400), 1), NOW))
  })

  it('spent long ago ranks ahead of spent recently', () => {
    expect(spendWear(rec(daysAgo(400), 1), NOW)).toBeLessThan(spendWear(rec(daysAgo(1), 1), NOW))
  })

  it('the cooldown boundary is the cooldown, not a day either side', () => {
    const inside = spendWear(rec(daysAgo(SPEND_COOLDOWN_DAYS - 0.5), 1), NOW)
    const outside = spendWear(rec(daysAgo(SPEND_COOLDOWN_DAYS + 0.5), 1), NOW)
    expect(outside).toBeLessThan(inside)
  })

  it('matches REC_REPEAT_DAYS, so two windows cannot disagree', () => {
    // ⚠️ `generate-blueprint` already has a 30-day premise-overlap window. Two
    // windows deciding "has this been said recently" is two answers to one
    // question, a class this repository has paid for repeatedly.
    expect(SPEND_COOLDOWN_DAYS).toBe(30)
  })

  it('wears further with each use, within a bucket', () => {
    expect(spendWear(rec(daysAgo(400), 1), NOW)).toBeLessThan(spendWear(rec(daysAgo(400), 8), NOW))
  })

  it('a count still loses to a bucket — eight old uses beat one recent one', () => {
    // ⚖️ The count is a tie-break WITHIN recency, never a term added to it.
    expect(spendWear(rec(daysAgo(400), 8), NOW)).toBeLessThan(spendWear(rec(daysAgo(1), 1), NOW))
  })

  it('a count with no date reads as WORN, not as never spent', () => {
    // ⚠️ THE PAIR SHOULD NEVER DISAGREE — 0216 writes both in one statement —
    // but the safe reading of a contradiction is the one that cannot do damage.
    // Reading "count 4, no date" as never-spent would promote the most worn rows
    // in the store to the very front.
    expect(spendWear(rec(null, 4), NOW)).toBeGreaterThan(spendWear(rec(null, 0), NOW))
  })

  it('an unparseable date is treated the same way, never as fresh', () => {
    expect(spendWear({ lastSpentAt: 'not a date', spendCount: 3 }, NOW))
      .toBeGreaterThan(spendWear(rec(null, 0), NOW))
  })

  it('a negative or junk count cannot make a row look fresher than never-spent', () => {
    expect(spendWear({ lastSpentAt: null, spendCount: -5 } as SpendRecord, NOW))
      .toBe(spendWear(rec(null, 0), NOW))
    expect(spendWear({ lastSpentAt: daysAgo(1), spendCount: NaN } as SpendRecord, NOW))
      .toBeGreaterThan(spendWear(rec(null, 0), NOW))
  })
})

describe('coolBySpend — a tie-break that stays one', () => {
  it('puts unspent rows first', () => {
    const rows = [
      { id: 'spent', ...rec(daysAgo(2), 3) },
      { id: 'never', ...rec(null, 0) },
      { id: 'old', ...rec(daysAgo(200), 1) },
    ]
    expect(coolBySpend(rows, NOW).map((r) => r.id)).toEqual(['never', 'old', 'spent'])
  })

  it('is STABLE, so equally-worn rows keep the order relevance gave them', () => {
    // ⚠️ LOAD-BEARING. Without stability this function silently becomes the
    // reordering its own header forbids: relevance would stop deciding anything
    // among rows that have never been spent, which is most of a young store.
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, ...rec(null, 0) }))
    expect(coolBySpend(rows, NOW).map((r) => r.id)).toEqual(rows.map((r) => r.id))
  })

  it('does not mutate its input', () => {
    const rows = [{ id: 'a', ...rec(daysAgo(1), 1) }, { id: 'b', ...rec(null, 0) }]
    const before = rows.map((r) => r.id)
    coolBySpend(rows, NOW)
    expect(rows.map((r) => r.id)).toEqual(before)
  })

  it('an empty list is an empty list', () => {
    expect(coolBySpend([], NOW)).toEqual([])
  })

  it('a cooled row is still returned — this is a cooling, never a ban', () => {
    // ⚖️ §H2: refusing a creator's own material outright is a product decision
    // `recDirective` already declined to make, deliberately. A cooled row still
    // reaches the prompt when nothing else is available.
    const rows = [{ id: 'only', ...rec(daysAgo(1), 9) }]
    expect(coolBySpend(rows, NOW)).toHaveLength(1)
  })
})
