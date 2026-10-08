import { describe, it, expect } from 'vitest'
import {
  enforceShowItBeat, applyCloseUpShots, productWords, ownsEntity, showJobFor,
  trialSoftwareTarget, trialSoftwareBlockExtends, CLOSE_UP_SHOT_RULE,
} from '../showItBeat'
import { SHOWN_JOB_SHOT } from '../shownJob'

// Fictional data only.
const beans = { type: 'PHYSICAL_PRODUCT', showability: 'ALWAYS', relationship: 'OWN_PRODUCT', name: "Maya's Coffee Beans" }
const words = productWords(beans.name, ['Washed medium roast from a small farm'])

const script = () => [
  { section: 'Hook', line: "Maya's Coffee beans changed my mornings.", shown_job: 'talk', camera: 'front' },
  { section: 'Setup', line: 'I used to grab whatever was cheapest.', shown_job: 'talk', camera: 'front' },
  { section: 'Body', line: 'These beans are a washed medium roast.', shown_job: 'claim', camera: 'front' },
  { section: 'CTA', line: 'Grab a bag of the beans at the link.', shown_job: 'cta', camera: 'front' },
]

describe('enforceShowItBeat', () => {
  it('retags the first product beat when no beat shows it', () => {
    const r = enforceShowItBeat(script(), { entity: beans, goal: 'sell', words })
    expect(r.retagged).toBe(1)
    expect(r.reason).toBe('retagged')
    expect(r.index).toBe(2)
    expect(r.script[2]).toMatchObject({ shown_job: 'demo', camera: 'back', direction: SHOWN_JOB_SHOT.demo })
  })

  it('does nothing when a showing beat is already present', () => {
    const s = script()
    s[1] = { ...s[1]!, shown_job: 'process' }
    const r = enforceShowItBeat(s, { entity: beans, goal: 'sell', words })
    expect(r.retagged).toBe(0)
    expect(r.reason).toBe('already_shown')
    expect(r.script).toEqual(s)
  })

  it('does not enforce for UNKNOWN or NEVER showability', () => {
    expect(enforceShowItBeat(script(), { entity: { ...beans, showability: 'UNKNOWN' }, goal: 'sell', words }).reason).toBe('not_showable')
    expect(enforceShowItBeat(script(), { entity: { ...beans, showability: 'NEVER' }, goal: 'sell', words }).retagged).toBe(0)
  })

  it('does not enforce when she does not own it, or ownership is unknown', () => {
    for (const relationship of ['AFFILIATE', 'SPONSOR', 'REVIEW_ONLY', 'NONE', null]) {
      const r = enforceShowItBeat(script(), { entity: { ...beans, relationship }, goal: 'sell', words })
      expect(r.retagged).toBe(0)
      expect(r.reason).toBe('not_owned')
    }
    expect(ownsEntity({ relationship: 'AFFILIATE', personal_use: 'CONFIRMED' })).toBe(true)
    expect(ownsEntity({})).toBeNull()
  })

  it('never changes any spoken line', () => {
    const before = script()
    const r = enforceShowItBeat(before, { entity: beans, goal: 'educate', words })
    expect(r.retagged).toBe(1)
    expect(r.script.map((b) => b.line)).toEqual(before.map((b) => b.line))
    expect(before[2]!.shown_job).toBe('claim') // input not mutated
  })

  it('never chooses the hook or the cta, even when they name the product', () => {
    const s = [script()[0]!, { section: 'Setup', line: 'I used to grab whatever was cheapest.', shown_job: 'talk' }, script()[3]!]
    const r = enforceShowItBeat(s, { entity: beans, goal: 'sell', words })
    expect(r.retagged).toBe(0)
    expect(r.reason).toBe('no_candidate')
  })

  it('gives screen products app_payoff, not demo', () => {
    const app = { type: 'APP', showability: 'SOMETIMES', relationship: 'OWN_PRODUCT', name: "Maya's Coffee Tracker" }
    const s = [
      { section: 'Hook', line: 'I stopped guessing my brew times.', shown_job: 'talk' },
      { section: 'Body', line: 'The tracker logs every brew for me.', shown_job: 'talk' },
      { section: 'CTA', line: 'Try it tonight.', shown_job: 'cta' },
    ]
    const r = enforceShowItBeat(s, { entity: app, goal: 'leads', words: productWords(app.name) })
    expect(r.script[1]).toMatchObject({ shown_job: 'app_payoff', camera: 'back', direction: SHOWN_JOB_SHOT.app_payoff })
    expect(showJobFor('COURSE')).toBe('app_payoff')
    expect(showJobFor('PHYSICAL_PRODUCT')).toBe('demo')
  })

  it('does not enforce outside sell / educate / leads', () => {
    expect(enforceShowItBeat(script(), { entity: beans, goal: 'entertain', words }).reason).toBe('goal')
    expect(enforceShowItBeat(script(), { entity: null, goal: 'sell', words }).reason).toBe('no_entity')
    expect(enforceShowItBeat(script(), { entity: { ...beans, type: 'SERVICE' }, goal: 'sell', words }).reason).toBe('not_showable_kind')
  })
})

describe('applyCloseUpShots', () => {
  it('emits a close_up shot for showing beats and leaves the rest', () => {
    const s = enforceShowItBeat(script(), { entity: beans, goal: 'sell', words }).script
    const shots = [
      { shot: 'Opening', shot_type: 'talking_head', spoken_text: s[0]!.line, framing: 'Chest-up' },
      { shot: 'The roast', shot_type: 'talking_head', spoken_text: s[2]!.line, framing: 'Chest-up' },
      { shot: 'Thumbnail', shot_type: 'cover_frame', spoken_text: '' },
    ]
    const r = applyCloseUpShots(shots, s)
    expect(r.closeUps).toBe(1)
    expect(r.shots[1]).toMatchObject({ shot_type: 'close_up', camera: 'back', spoken_text: s[2]!.line })
    expect(String(r.shots[1]!.framing)).toContain(SHOWN_JOB_SHOT.demo)
    expect(r.shots[0]).toBe(shots[0])
    expect(r.shots[2]).toBe(shots[2])
  })
})

describe('software trial helpers', () => {
  it('extends the block to course and community and sets 25s only with no pick', () => {
    expect(trialSoftwareBlockExtends('COURSE')).toBe(true)
    expect(trialSoftwareBlockExtends('COMMUNITY')).toBe(true)
    expect(trialSoftwareBlockExtends('SAAS')).toBe(false)
    expect(trialSoftwareTarget('COMMUNITY', undefined)).toBe(25)
    expect(trialSoftwareTarget('APP', 60)).toBeNull()
    expect(trialSoftwareTarget('PHYSICAL_PRODUCT', undefined)).toBeNull()
    expect(CLOSE_UP_SHOT_RULE).toContain("'close_up'")
  })
})
