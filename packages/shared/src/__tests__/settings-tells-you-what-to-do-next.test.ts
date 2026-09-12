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
  setupAreas, setupSummary, panelAreas,
  SETUP_STATES, SETUP_AREA_IDS,
  type SetupInput,
} from '../setupAreas'
import type { CreatorProfileAnswers, CommercialTie } from '../creatorProfileQuestions'
import { productDnaStatus } from '../profileCompletion'

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

  // ⚠️⚠️ THE HERO AND THE CARD GRID BOTH DREW THE SAME AREA. Reported live:
  // "NEXT STEP · Content profile · Edit profile →" at the top of the screen and
  // "Content profile · Needs setup · Edit profile" again below it — the same
  // fact twice, and the second copy carried a status the first did not, so the
  // two did not even agree. The grid now filters the next-step area out.
  //
  // ⚖️ THE FILTER IS WELL-DEFINED BY CONSTRUCTION AND THAT IS ASSERTED HERE
  // RATHER THAN ASSUMED: `setupSummary` picks `next` with `areas.find`, so its
  // id is always one of the areas handed to it. A `next` that was NOT in the
  // list would make the screen's filter remove nothing and the duplicate would
  // come back silently.
  it('the next step is always one of the areas, so the grid can exclude it', () => {
    for (const input of [nothing, { ...nothing, dnaReady: true }, { ...nothing, brandKit: null }]) {
      const areas = of(input)
      const s = setupSummary(areas)
      if (!s.next) continue
      expect(areas.map((a) => a.id)).toContain(s.next.id)
    }
  })

  // ⚖️ AND REMOVING IT MUST LEAVE A GRID. Trading a duplicate for an empty
  // screen is not a fix.
  it('excluding the next step still leaves other areas to show', () => {
    const areas = of(nothing)
    const s = setupSummary(areas)
    expect(s.next).not.toBeNull()
    expect(areas.filter((a) => a.id !== s.next!.id).length).toBeGreaterThan(0)
  })

  // ⚠️⚠️ THE PANEL'S EXCLUSIONS, TESTED BEHAVIOURALLY. They were two inline
  // `.filter` calls in Settings.tsx asserted only by a regex over that file, and
  // that regex broke twice in one afternoon — once when the second exclusion
  // arrived, once when the chain spanned lines — each time failing without
  // naming the cause. Source text is not behaviour.
  describe('what the setup panel draws as cards', () => {
    it('excludes the next step, because the hero above already draws it', () => {
      const areas = of(nothing)
      const s = setupSummary(areas)
      expect(s.next).not.toBeNull()
      expect(panelAreas(areas, s.next).map((a) => a.id)).not.toContain(s.next!.id)
    })

    it('excludes the brand kit, which is not a setup area on this panel', () => {
      // It appeared three times on one page: this card, the nav tab of the same
      // name, and the section that tab opens. Its own detail says it does not
      // change what a script says, and 0 of 51 creators have uploaded a logo.
      const areas = of(nothing)
      expect(areas.map((a) => a.id)).toContain('brand_kit')
      expect(panelAreas(areas, setupSummary(areas).next).map((a) => a.id))
        .not.toContain('brand_kit')
    })

    // ⚠️ THE DUPLICATE THAT ONLY APPEARED ONCE SHE HAD ANSWERED. While the CTA
    // is missing it is `needs_setup`, so it becomes `next` and the first
    // exclusion already hides it. The moment she writes one it is `ready`, stops
    // being `next`, and the grid card appears ABOVE the block that shows her
    // actual sentence in an inline editor. That timing is why it survived a
    // round of duplicate-hunting that removed the voice teaser, the second
    // products card and the DNA teaser — every one of which was visible from
    // the start.
    it('excludes the CTA, which ProfileStatus draws below with her real sentence', () => {
      // ⚖️ THE STATE THAT EXPOSED IT: a creator who has answered. A fixture
      // with no CTA would hide the bug behind the `next` exclusion and pass
      // against the old code.
      const areas = of({ ...nothing, cta: 'Download the free 3-day sample before you buy.' })
      const s = setupSummary(areas)
      expect(areas.find((a) => a.id === 'default_cta')?.state,
        'the fixture does not actually have a confirmed CTA').toBe('ready')
      expect(s.next?.id, 'the CTA is still next, so this proves nothing')
        .not.toBe('default_cta')
      expect(panelAreas(areas, s.next).map((a) => a.id)).not.toContain('default_cta')
    })

    // ⚖️ AND THE AREA ITSELF IS UNTOUCHED. Hiding a CARD must not remove the
    // FACT: the fraction, the headline and the hero all still read it.
    it('still reports the CTA area, so the count and headline are unchanged', () => {
      const areas = of({ ...nothing, cta: 'Download the free 3-day sample before you buy.' })
      expect(areas.map((a) => a.id)).toContain('default_cta')
      expect(setupSummary(areas).total).toBe(
        areas.filter((a) => a.counts && a.state !== 'not_needed').length)
    })

    it('and nothing else is dropped', () => {
      const areas = of(nothing)
      const s = setupSummary(areas)
      const shown = panelAreas(areas, s.next).map((a) => a.id)
      for (const a of areas) {
        if (a.id === 'brand_kit' || a.id === 'default_cta' || a.id === s.next?.id) continue
        expect(shown, `${a.id} disappeared from the panel`).toContain(a.id)
      }
    })

    // ⚖️ TRADING A DUPLICATE FOR A BLANK PANEL IS NOT A FIX.
    it('never returns an empty panel', () => {
      for (const input of [nothing, { ...nothing, dnaReady: true }, {}]) {
        const areas = of(input)
        expect(panelAreas(areas, setupSummary(areas).next).length).toBeGreaterThan(0)
      }
    })

    // ⚖️ AND A NULL NEXT STEP EXCLUDES NOTHING BUT THE KIT. When the core is
    // done there is no next step, and the panel must not lose a card to it.
    // ⚠️ THIS SAID "ONLY THE BRAND KIT" AND COUNTED `areas.length - 1`. It went
    // stale on 2026-09-12 when the CTA became a second STRUCTURAL exclusion —
    // one that applies whatever `next` is, unlike the `next` exclusion itself.
    // Its real claim was never the number: it was that NOTHING UNEXPECTED is
    // dropped when there is no next step to account for a missing card. A
    // hard-coded arity restates the implementation; naming the exclusions
    // states the rule, and a third one added silently still fails this.
    it('a null next step drops exactly the structural exclusions, and nothing else', () => {
      const areas = of()
      expect(setupSummary(areas).next).toBeNull()
      const shown = panelAreas(areas, null).map((a) => a.id)
      const dropped = areas.map((a) => a.id).filter((id) => !shown.includes(id))
      expect(dropped.slice().sort()).toEqual(['brand_kit', 'default_cta'])
    })
  })

  // ⚠️ THE `gapAction` TESTS THAT SAT HERE ARE GONE WITH THEIR SUBJECT. They
  // asserted a destination for each completion gap, and the panel that rendered
  // those gaps has been deleted — twelve cards for six facts, and those four
  // rows duplicated the cards above them. A totality test over a mapping nobody
  // calls is a test that cannot fail for a reason anyone cares about.
  // ⚠️⚠️ ONE RULE, ONE AUTHORITY — AND THE SCAN IS WHAT FOUND THE SECOND ONE.
  // The products area used to re-derive its state inline: `!productsApply ?
  // 'not_needed' : hasProducts ? 'ready' : 'needs_setup'`. That is the same
  // three-way rule `productDnaStatus` already owned. Nobody noticed until the
  // status line that called that function was deleted and `check_symbol_readers`
  // reported it as a rule nothing runs — a second authority hiding behind a
  // first caller.
  //
  // ⚖️ SO THE AGREEMENT IS ASSERTED OVER EVERY COMBINATION, not just the happy
  // one. If the inline version ever comes back, one of these rows disagrees.
  describe('the products area asks the shared rule instead of re-deriving it', () => {
    const TIES: Array<readonly CommercialTie[] | null> = [
      null, [], ['none'], ['own_product'], ['own_service'], ['affiliate'],
      ['none', 'own_product'],
    ]
    it('agrees with productDnaStatus for every tie and count', () => {
      for (const ties of TIES) {
        for (const count of [0, 1, 5]) {
          const areas = setupAreas({
            answers: ties === null ? null : { commercialTies: ties },
            dnaReady: true, cta: null, productCount: count, brandKit: null,
          })
          const products = areas.find((a) => a.id === 'products')!
          const shared = productDnaStatus(ties, count)
          const expected = shared === 'missing' ? 'needs_setup' : shared
          expect(products.state, `ties=${JSON.stringify(ties)} count=${count}`).toBe(expected)
        }
      }
    })

    // ⚖️ AND THE THREE-STATE DISTINCTION IS REAL, not collapsed by the mapping.
    // All three outcomes must be reachable, or an agreement test could pass on a
    // function that always returns the same thing.
    it('all three outcomes are reachable', () => {
      const stateFor = (ties: readonly CommercialTie[] | null, count: number) =>
        setupAreas({
          answers: ties === null ? null : { commercialTies: ties },
          dnaReady: true, cta: null, productCount: count, brandKit: null,
        }).find((a) => a.id === 'products')!.state
      expect(stateFor(['none'], 0)).toBe('not_needed')
      expect(stateFor(['own_product'], 2)).toBe('ready')
      expect(stateFor(['own_product'], 0)).toBe('needs_setup')
    })
  })

  it('never sends anybody to the brand kit as the next thing', () => {
    // ⚠️ IT IS OPTIONAL, SO IT CAN NEVER BE THE ONE THING WE ASK FOR. Offering
    // it as the next step is how "optional" quietly becomes required.
    const s = setupSummary(of({ ...nothing, brandKit: null }))
    expect(s.next!.id).not.toBe('brand_kit')
  })
})
