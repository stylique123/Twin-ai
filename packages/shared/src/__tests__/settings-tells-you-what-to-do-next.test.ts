// A PAGE THAT REPORTS STATE AND WILL NOT HELP YOU CHANGE IT.
//
// ⚠️ SETTINGS WAS A STACK OF READ-ONLY CARDS. Plan, Brand Kit, the whole Creator
// DNA record, the CTA field and product context in one column — so finding the
// next useful action meant reading all of it and deciding for yourself, and
// several panels looked clickable while doing nothing.
//
// ⚖️ SO THE STATUS IS A MODEL, NOT A LAYOUT. These tests hold the model to the
// rules that were paid for elsewhere: Brand Kit never lowers content readiness,
// "not needed" is not a quiet zero, and nothing Twin wrote for itself can mark an
// area ready.
import { describe, expect, it } from 'vitest'
import {
  setupAreas, setupSummary, SETUP_STATES, SETUP_AREA_IDS,
  type SetupInput,
} from '../setupAreas'
import type { CreatorProfileAnswers } from '../creatorProfileQuestions'

// ⚠️ `as never` IS NOT A TYPE, IT IS THE ABSENCE OF ONE. Spreading it is not
//  even legal ("Spread types may only be created from object types"), and every
//  field name below went unchecked — a misspelt `commercialTies` or a tie value
//  that is not in the union would have read exactly the same. The annotation is
//  what makes these five answers assertions about the real shape.
const ANSWERED: CreatorProfileAnswers = {
  contentGoals: ['authority'], audience: 'founders', workKind: 'saas',
  desiredFormats: ['talking_head'], commercialTies: ['own_product'],
}

const of = (over: Partial<SetupInput> = {}) =>
  setupAreas({ answers: ANSWERED, dnaReady: true, dnaConfirmed: true, cta: 'Try Twin free', productCount: 1, ...over })

const area = (input: Partial<SetupInput>, id: string) =>
  of(input).find((a) => a.id === id)!

describe('every area has a state and something to do', () => {
  it('covers all five areas', () => {
    expect(of().map((a) => a.id)).toEqual([...SETUP_AREA_IDS])
  })

  it('every state is one of the five declared', () => {
    for (const a of of({ answers: {} as never, dnaReady: false, cta: null, productCount: 0 })) {
      expect(SETUP_STATES, a.id).toContain(a.state)
    }
  })

  it('every card has an action, in every state', () => {
    // ⚠️ THE DEFECT THIS FILE EXISTS FOR. A card that looks tappable and goes
    // nowhere teaches people that tapping things here is pointless — worse than
    // a plain list, because it costs them an attempt to find out.
    for (const a of of({ answers: {} as never, dnaReady: false, cta: null, productCount: 0 })) {
      expect(a.action, a.id).toBeTruthy()
      expect(a.actionLabel.trim(), a.id).not.toBe('')
    }
  })

  it('speaks plain English, with no internal words on any card', () => {
    // ⚖️ THE STANDING UX RULE, CHECKED RATHER THAN INTENDED.
    for (const a of of({ answers: {} as never, dnaReady: false, cta: null, productCount: 0 })) {
      const text = `${a.title} ${a.detail} ${a.actionLabel}`
      expect(text, a.id).not.toMatch(/DNA record|entity|provenance|CDP|enum|canonical|_/)
    }
  })
})

describe('brand kit never lowers content readiness', () => {
  it('is not counted, ever', () => {
    // ⚠️ THE RULE THAT WAS PAID FOR ONCE ALREADY. A creator with every creative
    // answer and no logo read "70% complete", while the missing 30% could not
    // change one line of a script — and being pushed toward 100% is what makes
    // somebody type a colour they never chose.
    expect(area({}, 'brand_kit').counts).toBe(false)
  })

  it('a complete creator with no logo is fully ready', () => {
    const s = setupSummary(of({ brandKit: null }))
    expect(s.ready).toBe(s.total)
    expect(s.headline).toMatch(/what it needs/)
  })

  it('and it is optional rather than missing', () => {
    // ⚖️ `optional` AND `needs_setup` ARE DIFFERENT ASKS. Nothing here changes a
    // word of a script, so nagging for it would be asking for work that cannot
    // help.
    expect(area({ brandKit: null }, 'brand_kit').state).toBe('optional')
  })

  it('but it does report ready once the creator has actually set one', () => {
    // ⚖️ `paletteSource: 'manual'` IS THE WHOLE POINT. An auto-extracted palette
    // is a reading, not a decision, and this card must not report a machine's
    // guess as the creator's brand — the defect `brandSnapshot` spent a PR on.
    expect(area({ brandKit: { primaryHex: '#ff5a36', paletteSource: 'manual' } }, 'brand_kit').state)
      .toBe('ready')
  })

  it('and an auto-extracted palette does NOT make it ready', () => {
    expect(area({ brandKit: { primaryHex: '#ff5a36', paletteSource: 'auto' } }, 'brand_kit').state)
      .toBe('optional')
  })
})

describe('nothing to sell is an answer, not a gap', () => {
  const nonCommercial: CreatorProfileAnswers = { ...ANSWERED, commercialTies: ['none'] }

  it('reports not needed rather than missing', () => {
    expect(area({ answers: nonCommercial, productCount: 0 }, 'products').state).toBe('not_needed')
  })

  it('and leaves the denominator instead of counting as done', () => {
    // ⚠️ A CREATOR WITH NOTHING TO SELL IS NOT FOUR-FIFTHS OF A CREATOR.
    const s = setupSummary(of({ answers: nonCommercial, productCount: 0 }))
    expect(s.total).toBe(3)
    expect(s.ready).toBe(3)
  })

  it('says why it is absent, so the card does not read as broken', () => {
    expect(area({ answers: nonCommercial, productCount: 0 }, 'products').detail)
      .toMatch(/not selling anything/)
  })

  it('while an unanswered tie still asks, because silence is not "no"', () => {
    const silent: CreatorProfileAnswers = { ...ANSWERED, commercialTies: [] }
    expect(area({ answers: silent, productCount: 0 }, 'products').state).toBe('needs_setup')
  })
})

describe('a voice Twin read is not a voice you approved', () => {
  it('never scanned needs setup', () => {
    expect(area({ dnaReady: false }, 'creator_dna').state).toBe('needs_setup')
  })

  it('scanned but unseen needs review, not ready', () => {
    // ⚖️ CALLING IT READY CLAIMS AN APPROVAL NOBODY GAVE — the same line the
    // provenance work draws between what was observed and what was asserted.
    expect(area({ dnaReady: true, dnaConfirmed: false }, 'creator_dna').state).toBe('needs_review')
  })

  it('and confirmed is ready', () => {
    expect(area({ dnaReady: true, dnaConfirmed: true }, 'creator_dna').state).toBe('ready')
  })
})

describe('the CTA cannot be marked done by a sentence Twin wrote', () => {
  it('a generated-looking empty value is not ready', () => {
    expect(area({ cta: null }, 'default_cta').state).toBe('needs_setup')
    expect(area({ cta: '   ' }, 'default_cta').state).toBe('needs_setup')
  })

  it('and a typed one is', () => {
    expect(area({ cta: 'Book a call' }, 'default_cta').state).toBe('ready')
  })
})

describe('one next step, and it moves', () => {
  const nothing: Partial<SetupInput> = {
    answers: {} as never, dnaReady: false, dnaConfirmed: false, cta: null, productCount: 0,
  }

  it('names the voice first, because a scan answers other questions too', () => {
    expect(setupSummary(of(nothing)).next!.id).toBe('creator_dna')
  })

  it('advances as each one is done', () => {
    // ⚠️ THE INTERACTION THE WHOLE REBUILD IS FOR. The creator never has to scan
    // six panels wondering what to click — and the answer visibly changes when
    // they act, which is what makes it feel like progress rather than a form.
    const withDna = { ...nothing, dnaReady: true, dnaConfirmed: true }
    expect(setupSummary(of(withDna)).next!.id).toBe('content_profile')

    const withProfile = { ...withDna, answers: { ...ANSWERED, commercialTies: [] } }
    expect(setupSummary(of(withProfile)).next!.id).toBe('products')

    const withProduct = { ...withProfile, productCount: 1 }
    expect(setupSummary(of(withProduct)).next!.id).toBe('default_cta')
  })

  it('counts up as it goes', () => {
    expect(setupSummary(of(nothing)).ready).toBe(0)
    expect(setupSummary(of({ ...nothing, dnaReady: true, dnaConfirmed: true })).ready).toBe(1)
  })

  it('stops asking once the core is done', () => {
    // ⚖️ A PERMANENT "100%!" IS A DEMAND THAT HAS STOPPED MEANING ANYTHING.
    const s = setupSummary(of())
    expect(s.next).toBeNull()
    expect(s.headline).not.toMatch(/\d+ of \d+/)
  })

  it('never sends anybody to the brand kit as the next thing', () => {
    // ⚠️ IT IS OPTIONAL, SO IT CAN NEVER BE THE ONE THING WE ASK FOR. Offering
    // it as the next step is how "optional" quietly becomes required.
    const s = setupSummary(of({ ...nothing, brandKit: null }))
    expect(s.next!.id).not.toBe('brand_kit')
  })
})
