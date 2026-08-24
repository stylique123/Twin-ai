import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { productSceneGuidance } from '../productScenes'
import { ENTITY_TYPES, type EntityType } from '../productEntity'

// ⚠️ EVERY SCREEN-SHOWN PRODUCT GOT DASHBOARD DIRECTION. Measured before this
// change: SAAS, COURSE, DIGITAL_PRODUCT, MARKETPLACE and OTHER returned
// byte-identical moments. "Go to the main screen people actually use — the
// dashboard, the editor, the feed" is sound advice about software and nonsense
// about a course, where the thing people use is a lesson.
//
// ⚖️ THESE ARE A JUDGEMENT ABOUT SURFACES, NOT A MEASUREMENT OF WHAT FILMS
// WELL. Knowing a course has a curriculum page needs no recording; knowing
// whether holding on it reads as generous or slow does.

const moments = (t: EntityType) => productSceneGuidance(t, 'ALWAYS').moments
const text = (t: EntityType) =>
  moments(t).map((m) => `${m.onScreen} ${m.doThis} ${m.sayWhat}`).join(' ').toLowerCase()

describe('the direction differs where the product differs', () => {
  it.each(['COURSE', 'MARKETPLACE', 'APP', 'DIGITAL_PRODUCT'] as const)(
    '%s no longer gets the dashboard walkthrough', (t) => {
      expect(JSON.stringify(moments(t))).not.toBe(JSON.stringify(moments('SAAS')))
    })

  // ⚖️ AND THEY DIFFER FROM EACH OTHER, not merely from SAAS. Four copies of one
  // alternative would be the same bug with an extra step.
  it('each type differs from every other', () => {
    const kinds = ['SAAS', 'COURSE', 'MARKETPLACE', 'APP', 'DIGITAL_PRODUCT'] as const
    const seen = new Set(kinds.map((t) => JSON.stringify(moments(t))))
    expect(seen.size).toBe(kinds.length)
  })

  it('a course is told about lessons, not dashboards', () => {
    expect(text('COURSE')).toMatch(/lesson/)
    expect(text('COURSE')).not.toMatch(/dashboard/)
  })

  it('a marketplace is told about listings', () => {
    expect(text('MARKETPLACE')).toMatch(/listing/)
  })

  it('an app is told to record a phone', () => {
    expect(text('APP')).toMatch(/phone/)
  })

  it('a digital product is told to show before and after', () => {
    expect(text('DIGITAL_PRODUCT')).toMatch(/before and after/)
  })
})

describe('the two that keep the original set, and why', () => {
  // ⚖️ SAAS IS WHAT IT WAS WRITTEN FOR. OTHER is unclassified, so the generic
  // walkthrough is the honest thing to give it — inventing specifics for a
  // product nobody can name would be worse than the dashboard shape.
  it('OTHER still gets the generic walkthrough', () => {
    expect(JSON.stringify(moments('OTHER'))).toBe(JSON.stringify(moments('SAAS')))
  })
})

describe('a community is other people, and the direction says so', () => {
  // ⚠️ THE ONE TYPE WHERE THE INTERESTING PART IS SOMEBODY ELSE'S WORDS. The
  // instruction has to arrive at the point of filming, where it can be acted on.
  it('warns against filming other people without permission', () => {
    expect(text('COMMUNITY')).toMatch(/permission/)
    expect(text('COMMUNITY')).toMatch(/blur|scroll past|do not film/)
  })
})

describe('every moment still answers all three questions', () => {
  it.each(ENTITY_TYPES as readonly EntityType[])('%s moments are complete', (t) => {
    for (const m of moments(t)) {
      expect(m.onScreen.length, 'onScreen').toBeGreaterThan(5)
      expect(m.doThis.length, 'doThis').toBeGreaterThan(20)
      expect(m.sayWhat.length, 'sayWhat').toBeGreaterThan(20)
    }
  })

  // ⚖️ NO B-ROLL, ANYWHERE. It is an explicit product scope decision, and a
  // moment that asks for footage the creator has to go and shoot is a beat that
  // silently will not exist.
  it.each(ENTITY_TYPES as readonly EntityType[])('%s asks for nothing to be sourced', (t) => {
    expect(text(t)).not.toMatch(/b-roll|stock footage|cutaway/)
  })
})

describe('the prompt no longer argues both sides of B-roll', () => {
  const repo = join(import.meta.dirname, '..', '..', '..', '..')
  const bp = readFileSync(
    join(repo, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
  // Only the INSTRUCTION text matters; the rules that REJECT a reference for
  // leaning on b-roll are correct and must survive.
  const instructions = bp.split('\n').filter((l) =>
    !l.includes("add(dimension") && !l.trimStart().startsWith('//'))
    .join('\n')

  it('does not ask for cutaways or inserts', () => {
    expect(instructions).not.toMatch(/name 2 to 3 concrete cutaways/)
    expect(instructions).not.toMatch(/at least one b-roll or insert shot/)
  })

  // ⚠️ THE SECTION HEADER PROMISED B-ROLL one line above the rule forbidding it.
  it('the shot-list header no longer promises it', () => {
    expect(instructions).not.toMatch(/SHOT LIST & ASSET SPECIFICATION \(B-ROLL/)
  })

  it('and the rule that there is no third shot type still stands', () => {
    expect(bp).toMatch(/There is no third option/)
  })
})
