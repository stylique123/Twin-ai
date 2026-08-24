import { describe, it, expect } from 'vitest'
import {
  pickShot, shotDirection, privacyOf, SHOT_DIRECTION, READABILITY_RULES, BLUR_LINE,
  type BeatPurpose, type ShotPattern,
} from '../shotGrammar'
import * as shared from '../index'

const PURPOSES: BeatPurpose[] = ['credibility', 'value', 'social_proof', 'cta', 'ambience']

// ⚠️ THE POINT OF A LOOKUP IS THAT IT CANNOT DRIFT. A writer choosing the shot
// each time gives the same beat a hold-up on Monday and a reveal-turn on Tuesday
// for no reason a creator could name.
describe('the picker is a lookup, not a judgement', () => {
  it('the same context always gives the same shot', () => {
    for (const purpose of PURPOSES) {
      const ctx = { purpose, hasSecondScreen: true, privacy: 'mine' as const }
      const first = pickShot(ctx)
      for (let i = 0; i < 20; i++) expect(pickShot(ctx)).toBe(first)
    }
  })

  it('every purpose gets a shot — no beat is left without direction', () => {
    for (const purpose of PURPOSES) {
      expect(SHOT_DIRECTION[pickShot({ purpose })]).toBeTruthy()
    }
  })
})

// ⚖️ PRIVACY OUTRANKS POLISH, and this is the branch easiest to leave out and
// hardest to add back once creators learn Twin cannot handle their numbers.
describe('a private screen is written down, not filmed', () => {
  it.each(PURPOSES)('%s with a private screen becomes PRINTED', (purpose) => {
    expect(pickShot({ purpose, screenIsPrivate: true, hasSecondScreen: true })).toBe('PRINTED')
  })

  it('the printed shot is not then told to blur itself', () => {
    const { pattern, lines } = shotDirection({ purpose: 'credibility', screenIsPrivate: true })
    expect(pattern).toBe('PRINTED')
    expect(lines).not.toContain(BLUR_LINE)
  })
})

// ⚠️ ABSENT IS NOT PERMISSION. A `?? 'mine'` anywhere would silently invent
// consent from somebody who never gave it.
describe('unanswered privacy is blur, never permission', () => {
  it.each([undefined, null] as const)('privacy %s reads as blur', (v) => {
    expect(privacyOf({ purpose: 'credibility', privacy: v })).toBe('blur')
  })

  it('an unanswered social-proof beat cannot become a reveal', () => {
    expect(pickShot({ purpose: 'social_proof' })).toBe('HOLD_UP')
    expect(pickShot({ purpose: 'social_proof', privacy: 'mine' })).toBe('REVEAL_TURN')
    expect(pickShot({ purpose: 'social_proof', privacy: 'permitted' })).toBe('REVEAL_TURN')
  })

  // ⚖️ A BLURRED THING CANNOT CARRY A TURN-TO-CAMERA REVEAL — the viewer would
  // read nothing. It falls back rather than refusing; the beat still gets a shot.
  it('a blurred social-proof beat still gets a usable shot', () => {
    const { pattern, lines } = shotDirection({ purpose: 'social_proof', privacy: 'blur' })
    expect(pattern).toBe('HOLD_UP')
    expect(lines).toContain(BLUR_LINE)
  })
})

describe('direction is never for equipment they do not own', () => {
  it('a value beat only becomes POINT_AT when there is a second screen', () => {
    expect(pickShot({ purpose: 'value', hasSecondScreen: true })).toBe('POINT_AT')
    expect(pickShot({ purpose: 'value', hasSecondScreen: false })).toBe('HOLD_UP')
    // ⚠️ UNANSWERED IS NOT A YES. A phone-only creator told to prop a laptop
    // gets a beat they cannot film.
    expect(pickShot({ purpose: 'value' })).toBe('HOLD_UP')
    expect(pickShot({ purpose: 'value', hasSecondScreen: null })).toBe('HOLD_UP')
  })
})

describe('the readability rules ride along rather than being remembered', () => {
  it.each(['HOLD_UP', 'POINT_AT', 'REVEAL_TURN'] as ShotPattern[])(
    '%s carries all the readability rules', (want) => {
      const ctxs = [
        { purpose: 'credibility' as const, privacy: 'mine' as const },
        { purpose: 'value' as const, hasSecondScreen: true, privacy: 'mine' as const },
        { purpose: 'social_proof' as const, privacy: 'mine' as const },
      ]
      const found = ctxs.map((c) => shotDirection(c)).find((r) => r.pattern === want)
      expect(found, want).toBeDefined()
      for (const rule of READABILITY_RULES) expect(found!.lines).toContain(rule)
    })

  it('ambience is background and needs no zoom advice', () => {
    const { pattern, lines } = shotDirection({ purpose: 'ambience', privacy: 'mine' })
    expect(pattern).toBe('PROP_SCREEN')
    for (const rule of READABILITY_RULES) expect(lines).not.toContain(rule)
  })
})

// ⚠️ A DECISION LAYER NOTHING CALLS is the state this repo keeps rediscovering.
it('is exported from the package index', () => {
  expect(typeof shared.pickShot).toBe('function')
  expect(typeof shared.shotDirection).toBe('function')
})

// ⚖️ PLAIN EVERYDAY ENGLISH, the standing rule for anything a creator reads.
it('no direction makes the creator think about Twin', () => {
  const all = [...Object.values(SHOT_DIRECTION), ...READABILITY_RULES, BLUR_LINE].join(' ')
  expect(all).not.toMatch(/screen[- ]record|screen capture|sceneType|beat_plan|product_dna|entity/i)
})
