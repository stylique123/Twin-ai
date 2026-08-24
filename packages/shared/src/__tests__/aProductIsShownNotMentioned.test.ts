import { describe, it, expect } from 'vitest'
import { productSceneGuidance, productSceneDirection } from '../productScenes'
import { ENTITY_TYPES, SHOWABILITY_STATES, type EntityType, type Showability } from '../productEntity'

const ALL_TYPES = ENTITY_TYPES as readonly EntityType[]
const ALL_STATES = SHOWABILITY_STATES as readonly Showability[]

describe('capability decides first, and silence is never permission', () => {
  // ⚠️ THE RULE THIS SHARES WITH inferShowability ONE LAYER DOWN. A plan someone
  // is following with a phone in their hand must not contain a shot they already
  // told us they cannot take -- and must not contain one nobody ever asked about.
  it('NEVER and UNKNOWN both yield zero show moments', () => {
    for (const t of ALL_TYPES) {
      for (const s of ['NEVER', 'UNKNOWN'] as Showability[]) {
        const g = productSceneGuidance(t, s)
        const requiresShowing = g.moments.filter((m) => m.sceneType !== 'talking_head')
        expect(requiresShowing, `${t}/${s}`).toEqual([])
      }
    }
  })

  // ⚖️ BUT THEY SAY DIFFERENT THINGS, because "you told us you cannot" and "we
  // never asked" are different facts and only the second one has a fix.
  it('UNKNOWN offers the way out; NEVER does not pretend there is one', () => {
    const unknown = productSceneGuidance('PHYSICAL_PRODUCT', 'UNKNOWN')
    const never = productSceneGuidance('PHYSICAL_PRODUCT', 'NEVER')
    expect(unknown.cannotShowBecause).toMatch(/Product Library/)
    expect(never.cannotShowBecause).not.toMatch(/Product Library/)
    expect(unknown.cannotShowBecause).not.toBe(never.cannotShowBecause)
  })

  it('ALWAYS gets the full sequence', () => {
    expect(productSceneGuidance('PHYSICAL_PRODUCT', 'ALWAYS').moments.length).toBeGreaterThan(2)
    expect(productSceneGuidance('SAAS', 'ALWAYS').moments.length).toBeGreaterThan(2)
  })

  // ⚠️ THIS ASSERTION ENCODED MY OWN WRONG RULE AND HAD TO BE REVERSED. It
  // demanded SOMETIMES keep "one optional beat", but a show moment IS a scene
  // that depends on the product being visible, so one beat does not weaken the
  // rule -- it breaks it. generate-blueprint decided this before I did, and
  // said why: a script is written once and filmed LATER.
  it('SOMETIMES builds no scene on the product at all', () => {
    for (const t of ['PHYSICAL_PRODUCT', 'SAAS'] as EntityType[]) {
      const g = productSceneGuidance(t, 'SOMETIMES')
      expect(g.moments, t).toEqual([])
      expect(g.mayShow, t).toBe(false)
    }
  })

  // ⚖️ BUT IT IS NOT NEVER. The creator is not told they cannot show it, only
  // that nothing will be built on it -- and the sentence says so.
  it('SOMETIMES still says it may be mentioned, unlike NEVER', () => {
    const sometimes = productSceneGuidance('PHYSICAL_PRODUCT', 'SOMETIMES')
    expect(sometimes.cannotShowBecause).toMatch(/mentioned/)
    expect(productSceneGuidance('PHYSICAL_PRODUCT', 'NEVER').cannotShowBecause)
      .not.toMatch(/mentioned/)
  })
})

describe('an object and a screen are not the same kind of showing', () => {
  // ⚠️ THE DEFECT THIS REPLACES: one instruction — "show the product" — that
  // covered a book and a SaaS dashboard and helped with neither.
  it('a physical product is held, and a SaaS product is opened', () => {
    const book = productSceneGuidance('PHYSICAL_PRODUCT', 'ALWAYS')
    const app = productSceneGuidance('SAAS', 'ALWAYS')
    expect(book.moments[0].doThis).toMatch(/hold|pick it up/i)
    expect(book.moments.every((m) => m.sceneType !== 'screen_recording')).toBe(true)
    expect(app.moments[0].onScreen).toMatch(/landing page/i)
    expect(app.moments.every((m) => m.sceneType !== 'product_demo')).toBe(true)
  })

  it('the screen walkthrough is an ordered route, not one instruction', () => {
    const m = productSceneGuidance('SAAS', 'ALWAYS').moments
    const route = m.map((x) => x.onScreen.toLowerCase()).join(' | ')
    expect(route).toMatch(/landing page/)
    expect(route).toMatch(/dashboard|editor|feed/)
    expect(route).toMatch(/result|finished|output/)
    // The landing page comes before the result, or it is not a walkthrough.
    expect(route.indexOf('landing')).toBeLessThan(route.indexOf('result'))
  })

  // ⚖️ A SERVICE HAS NOTHING TO POINT A CAMERA AT. This is the consultant asked
  // to screen-record a book, in the other direction.
  it('a service is told, never filmed, whatever the capability says', () => {
    for (const s of ALL_STATES) {
      const g = productSceneGuidance('SERVICE', s)
      expect(g.mayShow, s).toBe(false)
      expect(g.moments.every((m) => m.sceneType === 'talking_head'), s).toBe(true)
      // And it does not blame the creator for a fact about the product kind.
      expect(g.cannotShowBecause).not.toMatch(/you told us|you cannot/i)
    }
  })
})

describe('every moment answers all three questions', () => {
  // ⚠️ THE WHOLE POINT. A moment missing what to DO or what to SAY is the vague
  // direction this module exists to replace, and it would read as complete.
  // ⚠️ THIS ASSERTION WAS WRONG BEFORE IT WAS RIGHT, AND THE TEST WAS AT FAULT.
  // It demanded a long `onScreen` for EVERY moment, and failed on the service
  // case whose honest description is "You, talking." — thirteen characters and
  // exactly correct. Padding that to satisfy a threshold would be writing words
  // to please a test. Detail is required where something is SHOWN; a talking
  // scene has no scenery to describe, and saying so briefly is the right answer.
  it('every moment that shows something describes it in full', () => {
    for (const t of ALL_TYPES) {
      for (const s of ALL_STATES) {
        for (const m of productSceneGuidance(t, s).moments) {
          const shows = m.sceneType !== 'talking_head'
          expect(m.onScreen.length, `${t}/${s} onScreen`).toBeGreaterThan(shows ? 15 : 5)
          // The action and the words are required EVERYWHERE, including talking
          // scenes: "what do I do" and "what am I saying" are the two a creator
          // always has, and a moment answering neither is the vague direction
          // this module replaces.
          expect(m.doThis.length, `${t}/${s} doThis`).toBeGreaterThan(25)
          expect(m.sayWhat.length, `${t}/${s} sayWhat`).toBeGreaterThan(25)
        }
      }
    }
  })

  // ⚠️ NO B-ROLL. An explicit product scope decision, and the one a generic
  // "add visual interest" instruction would quietly reintroduce.
  it('never asks for b-roll or any footage the creator did not record', () => {
    for (const t of ALL_TYPES) {
      for (const s of ALL_STATES) {
        for (const m of productSceneGuidance(t, s).moments) {
          expect(m.sceneType, `${t}/${s}`).not.toBe('b_roll')
          const all = `${m.onScreen} ${m.doThis} ${m.sayWhat}`.toLowerCase()
          expect(all, `${t}/${s}`).not.toMatch(/b-roll|broll|stock footage|archive footage/)
        }
      }
    }
  })

  // ⚖️ THE WORDS ARE A BRIEF, NOT A SCRIPT. Canned sentences would override the
  // creator's voice, which is the one thing Twin exists to preserve.
  it('says what the words must achieve rather than supplying them', () => {
    for (const m of productSceneGuidance('SAAS', 'ALWAYS').moments) {
      expect(m.sayWhat).toMatch(/^Say |^Describe /)
      expect(m.sayWhat).not.toMatch(/^["']/)
    }
  })
})

describe('the teleprompter does not scroll through a physical action', () => {
  // ⚠️ A SHOW MOMENT HAS WORDS AND AN ACTION AT THE SAME TIME. A teleprompter
  // that keeps scrolling makes the creator choose between them.
  it('pauses after a show moment whenever there is one', () => {
    expect(productSceneGuidance('PHYSICAL_PRODUCT', 'ALWAYS').pauseAfterShowMoment).toBe(true)
    expect(productSceneGuidance('SAAS', 'ALWAYS').pauseAfterShowMoment).toBe(true)
  })

  it('does not pause a talking-only plan for no reason', () => {
    expect(productSceneGuidance('PHYSICAL_PRODUCT', 'NEVER').pauseAfterShowMoment).toBe(false)
    expect(productSceneGuidance('SERVICE', 'ALWAYS').pauseAfterShowMoment).toBe(false)
    // SOMETIMES builds no scene, so there is nothing to pause for.
    expect(productSceneGuidance('SAAS', 'SOMETIMES').pauseAfterShowMoment).toBe(false)
  })
})

describe('the prompt direction carries the refusal as loudly as the permission', () => {
  it('an unshowable product produces an explicit NO SHOT instruction', () => {
    const d = productSceneDirection('Twin', productSceneGuidance('SAAS', 'UNKNOWN'))
    expect(d).toMatch(/Write NO shot/)
    expect(d).toMatch(/showing, holding or demonstrating/)
  })

  it('a showable product produces numbered beats with all three parts', () => {
    const d = productSceneDirection('Twin', productSceneGuidance('SAAS', 'ALWAYS'))
    expect(d).toMatch(/ON SCREEN:/)
    expect(d).toMatch(/THE CREATOR DOES:/)
    expect(d).toMatch(/THE WORDS MUST:/)
    expect(d).toMatch(/\n {2}1\. /)
    expect(d).toMatch(/\n {2}4\. /)
  })

  it('uses the product name it was given, not a placeholder', () => {
    expect(productSceneDirection('$100M Offers', productSceneGuidance('PHYSICAL_PRODUCT', 'ALWAYS')))
      .toMatch(/\$100M OFFERS/)
  })
})
