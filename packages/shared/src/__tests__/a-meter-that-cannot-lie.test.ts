// A PROFILE METER THAT COUNTS A LOGO IS MEASURING A FORM, NOT KNOWLEDGE.
//
// ⚠️ THE MODEL THIS REPLACES MIXED SCRIPT INTELLIGENCE WITH VISUAL SETUP. A
// creator with every creative answer resolved and no logo read "70% complete" —
// while the missing 30% could not change one line of a script. The number said
// "Twin does not know enough about you" when the truth was "you have not uploaded
// a picture".
//
// ⚠️ AND IT PAID CREATORS TO MANUFACTURE THE DATA WE REFUSE TO STORE. Anyone
// chasing 100% picks black and white to clear the bar, and it lands in
// `brand.primary_color` as an assertion. `brandSnapshot` refuses auto greyscale
// precisely so that never becomes brand truth; a meter that rewards typing it by
// hand reopens the hole through the front door.
import { describe, expect, it } from 'vitest'
import {
  contentProfile, brandKitStatus, productDnaStatus, productionFact,
  PROFILE_ITEMS,
} from '../profileCompletion'
import type { CreatorProfileAnswers } from '../creatorProfileQuestions'

const full = (over: Partial<CreatorProfileAnswers> = {}): CreatorProfileAnswers => ({
  workKind: 'creator',
  audience: ['beginners'],
  contentGoals: ['teach'],
  desiredFormats: ['talking_head'],
  commercialTies: ['own_product'],
  capabilities: [],
  ...over,
} as CreatorProfileAnswers)

describe('the number measures only what changes a script', () => {
  it('reaches 100 with no logo, no colours and no visual assets at all', () => {
    // ⚖️ THE CENTRAL CLAIM. Twin has everything it needs to make the creative
    // decisions and write; saying otherwise would be false.
    const p = contentProfile({ answers: full(), dnaReady: true, cta: 'follow for more' })
    expect(p.percent).toBe(100)
    expect(p.gaps).toEqual([])
  })

  it('every item that can cost a point names the reader it feeds', () => {
    // ⚠️ THE RULE THAT KEEPS THIS HONEST AS THE PIPELINE GROWS. An item may only
    // cost a percentage point if a named consumer behaves differently once it is
    // answered. When a reader is retired, its item leaves the meter with it.
    for (const item of PROFILE_ITEMS) {
      expect(item.reader, item.id).toBeTruthy()
      expect(item.unlocks, item.id).not.toMatch(/complete|profile|percent/i)
    }
    expect(PROFILE_ITEMS.reduce((n, i) => n + i.weight, 0)).toBe(100)
  })

  it('tells the creator what a gap unlocks, not that they are incomplete', () => {
    const p = contentProfile({ answers: full({ desiredFormats: [] }), dnaReady: true, cta: 'x' })
    expect(p.percent).toBeLessThan(100)
    const [gap] = p.gaps
    expect(gap.unlocks).toMatch(/references/)
    // Plain English, no internal vocabulary — the standing UX rule.
    expect(gap.label).not.toMatch(/DNA|enum|field|profile/i)
  })

  it('never rounds up to 100 while a gap is still listed', () => {
    // ⚖️ A meter reading "complete" beside a list of missing things is the same
    // false confidence in a smaller box.
    const p = contentProfile({ answers: full(), dnaReady: true, cta: '' })
    expect(p.gaps.length).toBeGreaterThan(0)
    expect(p.percent).toBeLessThan(100)
  })
})

describe('what does not apply costs nothing', () => {
  it('a creator who sells nothing reaches 100 with no product', () => {
    // ⚠️ NOT-APPLICABLE IS SUBTRACTED FROM THE DENOMINATOR, NOT MARKED DONE.
    // Marking it complete would claim they have an offer Twin knows about.
    const p = contentProfile({
      answers: full({ commercialTies: ['none'] }), dnaReady: true, cta: 'follow',
    })
    expect(p.percent).toBe(100)
    expect(p.notApplicable).toContain('productContext')
    expect(p.gaps.map((g) => g.id)).not.toContain('productContext')
  })

  it('but silence leaves the question open rather than answering it', () => {
    // ⚖️ An unreached question is not "I sell nothing" — the same distinction
    // `suggestionsAllowed` runs on.
    const p = contentProfile({ answers: full({ commercialTies: [] }), dnaReady: true, cta: 'x' })
    expect(p.notApplicable).not.toContain('productContext')
    expect(p.gaps.map((g) => g.id)).toContain('productContext')
  })
})

describe('a conflict is not a blank', () => {
  it('caps the meter and is named first', () => {
    // ⚠️ The pipeline can route around a missing answer; it cannot proceed on two
    // answers that contradict each other.
    const p = contentProfile({
      answers: full(), dnaReady: true, cta: 'follow',
      conflicts: ['You said you sell nothing, but you claimed a product'],
    })
    expect(p.percent).toBeLessThan(100)
    expect(p.gaps[0].id).toBe('conflicts')
  })
})

describe('brand kit is a state, and it is never a percentage', () => {
  it('is not_set_up until a person says otherwise', () => {
    expect(brandKitStatus(null)).toBe('not_set_up')
    expect(brandKitStatus({})).toBe('not_set_up')
  })

  it('refuses an auto-extracted palette as evidence of a brand', () => {
    // ⚠️ THE EXACT LOOP THIS MODEL EXISTS TO BREAK. An extractor guess must not
    // make the kit look ready, or the creator is told they have branding they
    // never chose — and `brandSnapshot` already refuses to hand it to the editor.
    expect(brandKitStatus({ primaryHex: '#000000', secondaryHex: '#ffffff', paletteSource: 'auto' }))
      .toBe('not_set_up')
  })

  it('accepts what a person actually chose', () => {
    expect(brandKitStatus({ primaryHex: '#0f0', paletteSource: 'manual' })).toBe('ready')
    expect(brandKitStatus({ logoPath: 'me/logo.png' })).toBe('ready')
    // ⚖️ AND AN ACHROMATIC BRAND CHOSEN ON PURPOSE IS A REAL BRAND.
    expect(brandKitStatus({ primaryHex: '#000000', paletteSource: 'manual' })).toBe('ready')
  })

  it('cannot move the content number in either direction', () => {
    // ⚠️ THE INVARIANT, ASSERTED RATHER THAN ASSUMED. If a future edit threads a
    // kit into the meter, this fails.
    const base = contentProfile({ answers: full(), dnaReady: true, cta: 'follow' })
    const withKit = contentProfile({
      answers: full(), dnaReady: true, cta: 'follow',
      // @ts-expect-error — a kit is not part of the input, and that is the point.
      brandKit: { logoPath: 'me/logo.png', primaryHex: '#0f0' },
    })
    expect(withKit.percent).toBe(base.percent)
  })
})

describe('product DNA has three states and one of them is fine', () => {
  it('not_needed for a creator who said they sell nothing', () => {
    // ⚖️ NOT A LESSER `ready`. Telling them a product is missing is the product
    // arguing with them about their own business.
    expect(productDnaStatus(['none'], 0)).toBe('not_needed')
  })

  it('missing only while the question is open or the answer says there is one', () => {
    expect(productDnaStatus(['own_product'], 0)).toBe('missing')
    expect(productDnaStatus([], 0)).toBe('missing')
    expect(productDnaStatus(null, 0)).toBe('missing')
  })

  it('ready once something has actually been claimed', () => {
    expect(productDnaStatus(['own_product'], 1)).toBe('ready')
  })
})

describe('unrecorded is not none', () => {
  it('reads an undeclared production fact as unknown, never as no', () => {
    // ⚠️ READING THE BLANK AS `no` SILENTLY DELETES EVERY SCENE THAT WOULD HAVE
    // SHOWN THE THING; reading it as `yes` puts a person in front of a camera
    // holding something they may not own.
    expect(productionFact(undefined)).toBe('unknown')
    expect(productionFact(null)).toBe('unknown')
    expect(productionFact('yes')).toBe('unknown')
    expect(productionFact(true)).toBe('yes')
    expect(productionFact(false)).toBe('no')
  })

  it('and an unknown capability costs no percentage point', () => {
    // ⚠️ THIS PASSED `{ capabilities: [] }` — A FIELD `CreatorProfileAnswers` DOES
    //  NOT HAVE. TypeScript never saw this file, so the override was silently
    //  ignored as an excess property and the call was simply `full({})`: the
    //  test asserted that a COMPLETE profile is 100%, which is trivially true
    //  and covered elsewhere. The claim in its own name — that an UNKNOWN
    //  capability costs nothing — was never exercised.
    //
    //  ⚖️ THE REAL FIELDS ARE `canShowProduct` AND `canRecordScreen`, and `null`
    //  is what "not answered" looks like on both. Asserted together, because a
    //  meter that stayed at 100 for one and dropped for the other would be the
    //  same silent lie in half the cases.
    const unanswered = contentProfile({
      answers: full({ canShowProduct: null, canRecordScreen: null }),
      dnaReady: true, cta: 'follow',
    })
    expect(unanswered.percent).toBe(100)
  })
})

// ── WHERE THE ANSWERS COME FROM ───────────────────────────────────────────
//
// ⚠️ UNTIL 0136 THE SIX ANSWERS HAD NO SERVER-SIDE HOME, so the meter read a
// local draft and reported a creator who had answered everything as one who had
// answered nothing on any other device. The stored brief is the fix; this pins
// how the two sources combine, because getting THAT wrong reintroduces the bug
// in a subtler form.
import { resolveProfileAnswers } from '../profileCompletion'

describe('the confirmed answer beats the half-finished form', () => {
  it('prefers the stored brief over the local draft', () => {
    const a = resolveProfileAnswers({
      stored: { commercialTies: ['own_product'] },
      draft: { commercialTies: ['none'] },
    })
    expect(a.commercialTies).toEqual(['own_product'])
  })

  it('but per field, so a question the brief predates is not discarded', () => {
    // ⚠️ WHOLE-OBJECT PRECEDENCE WOULD THROW AWAY A DRAFT ANSWER TO A QUESTION
    // THE STORED BRIEF NEVER HELD, reporting a gap the creator has just filled
    // in front of us. A brief written before a question existed has no key.
    const a = resolveProfileAnswers({
      stored: { commercialTies: ['affiliate'] },
      draft: { commercialTies: ['none'], desiredFormats: ['talking_head'] },
    })
    expect(a.commercialTies).toEqual(['affiliate'])
    expect(a.desiredFormats).toEqual(['talking_head'])
  })

  it('falls back to the draft mid-onboarding, before the write lands', () => {
    // ⚖️ Reading nothing here would drop the meter to zero in the window between
    // answering and the write — which is exactly when a creator is looking at it.
    expect(resolveProfileAnswers({ stored: null, draft: { workKind: 'creator' } }).workKind)
      .toBe('creator')
    expect(resolveProfileAnswers({ stored: {}, draft: null })).toEqual({})
  })

  it('treats an empty array in the brief as absent, not as an answer', () => {
    // The CHECK refuses to store one, but a row written before it could hold it.
    expect(resolveProfileAnswers({
      stored: { commercialTies: [] }, draft: { commercialTies: ['none'] },
    }).commercialTies).toEqual(['none'])
  })
})
