// §T — the row that proved `showability` is hand-set and unwatched.
//
// Every string below is the REAL `creator_summary` of a REAL production row
// stored `showability = 'NEVER'`, read 2026-09-20. All nine are here, because a
// detector is only as good as the rows it stays SILENT on.
import { describe, expect, it } from 'vitest'
import { showabilityContradiction } from '../showabilityContradiction'

const BIBLE = 'I rebind your Bible in full-grain leather — Horween or Pueblo, hand-stitched, Oxford hollow spine'
const MEAL_PREP = 'Five days of fresh meals, cooked in your kitchen, built around what you actually eat.'
const COACHING = 'Twelve weeks of personalised training and check-ins for mums getting back to strength after birth'
const NEWSLETTER = "A free weekly email where I write up what I've actually been using and whether it was worth it."
const WORKSHOPS = 'Workshops address tactical growth, talent recruitment, and decision-making for scaling businesses. '
  + 'Participants meet with directors for personalized assistance and gain insights from experienced founders. '
  + 'Educational resources and a bestselling book detail customer acquisition strategies and lead generation methods.'

describe('the one row it exists to catch', () => {
  it('flags the Bible, and names the words that disagree', () => {
    const hit = showabilityContradiction('NEVER', BIBLE)
    expect(hit).not.toBeNull()
    expect(hit!.evidence).toContain('leather')
    expect(hit!.evidence).toContain('hand-stitched')
  })

  it('quotes the creator back to herself rather than asserting a verdict', () => {
    // The evidence must be words she wrote, so the question can show its work.
    for (const term of showabilityContradiction('NEVER', BIBLE)!.evidence) {
      expect(BIBLE.toLowerCase()).toContain(term)
    }
  })
})

describe('the eight rows it must stay silent on', () => {
  // ⚠️⚠️ THIS IS THE IMPORTANT HALF. `Weekly Meal Prep` is the product whose
  // creator was told to "Hold a clean glass of water in one hand". A detector
  // that re-flags it would reintroduce the exact failure the direction gate
  // exists to prevent — and "five days of fresh meals" is precisely what a
  // physical-noun matcher would trip on.
  it('says nothing about meal prep, however physical a meal sounds', () => {
    expect(showabilityContradiction('NEVER', MEAL_PREP)).toBeNull()
  })

  it('says nothing about a workshop that mentions a bestselling book', () => {
    // A book is an object. It is not a material, and it is not the product.
    expect(showabilityContradiction('NEVER', WORKSHOPS)).toBeNull()
  })

  it('says nothing about coaching or a newsletter', () => {
    expect(showabilityContradiction('NEVER', COACHING)).toBeNull()
    expect(showabilityContradiction('NEVER', NEWSLETTER)).toBeNull()
  })

  it('says nothing when the creator never wrote a summary', () => {
    // Three of the nine have no summary at all. Silence is the only honest
    // answer about a row nobody described.
    for (const empty of [null, undefined, '', '   ']) {
      expect(showabilityContradiction('NEVER', empty)).toBeNull()
    }
  })
})

describe('it only ever argues in the cheap direction', () => {
  it('never questions an ALWAYS', () => {
    // ⚖️ §T'S TRADE, ENFORCED IN CODE. A wrong NEVER costs a handling cue; a
    // wrong ALWAYS costs an invented prop in a creator's script. The first is a
    // thin video, the second is a fabrication — so a word-match may argue only
    // toward showing, never toward hiding.
    expect(showabilityContradiction('ALWAYS', BIBLE)).toBeNull()
    expect(showabilityContradiction('SOMETIMES', BIBLE)).toBeNull()
    expect(showabilityContradiction('UNKNOWN', BIBLE)).toBeNull()
    expect(showabilityContradiction(null, BIBLE)).toBeNull()
  })
})

describe('the word boundaries are not decoration', () => {
  it('does not read "cloak" as oak or "representing" as resin', () => {
    expect(showabilityContradiction('NEVER', 'A cloak of anonymity, representing nobody.')).toBeNull()
  })

  it('reads a hyphen and a space as the same construction verb', () => {
    expect(showabilityContradiction('NEVER', 'Candles, hand poured in small batches.')).not.toBeNull()
    expect(showabilityContradiction('NEVER', 'Candles, hand-poured in small batches.')).not.toBeNull()
  })
})
