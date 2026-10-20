// DISCONNECT TEST, ledger row 3: QUESTION_USEFULNESS (#1268).
// Fictional fixture only (a made-up candle maker). No model call.
import { describe, it, expect } from 'vitest'
import { usefulQuestions, candidatesFromNeedCheck, questionNecessity, questionUse } from '../../questionUsefulness'
import { needCheck } from '../../itemFormat'
import { EDGE, edgeGate, edgeAfter } from './edge'

const SCRIPT = ['The garage froze my wax solid overnight.', 'Warm the jar before you pour.', 'Link in bio.']
const ANSWERS = { story: 'The garage froze my wax overnight', other: 'unrelated tangent here' }

/** The two passes the edge runs under `questionUsefulnessOn` (index.ts ~10428 and ~16453). */
function blueprintFor(on: boolean): Record<string, unknown> {
  const bp: Record<string, unknown> = { script: SCRIPT.map((line) => ({ line })) }
  if (!on) return bp
  const nc = needCheck({ voiceCard: false, exemplars: 0, storyIds: [], kind: 'PHYSICAL_PRODUCT', productItems: [], nicheFindings: 0, pillars: [], pillarMatched: false, urgencyFact: false })
  const qs = usefulQuestions({ candidates: candidatesFromNeedCheck(nc.ask, ['what_it_is', 'show_it']), required: ['story', 'what_it_is', 'show_it'], onFile: [] })
  bp.question_necessity = questionNecessity(qs)
  bp.question_use = questionUse(ANSWERS, SCRIPT)
  return bp
}
const gate = (env: Record<string, string>, body: Record<string, unknown> = {}, trialOn = true) =>
  edgeGate('questionUsefulnessOn', { trialOn, body }, env) as boolean

describe('QUESTION_USEFULNESS disconnect', () => {
  it('the edge gate: on for the trial, off with QUESTION_USEFULNESS_KILL=1 or body question_usefulness:false', () => {
    expect(gate({})).toBe(true)
    expect(gate({ QUESTION_USEFULNESS_KILL: '1' })).toBe(false)
    expect(gate({}, { question_usefulness: false })).toBe(false)
    expect(gate({}, {}, false)).toBe(false)
  })
  it('on: necessity and use are recorded (the story answer is used); off: neither', () => {
    const on = blueprintFor(gate({}))
    const off = blueprintFor(gate({ QUESTION_USEFULNESS_KILL: '1' }))
    expect(on).not.toEqual(off)
    expect(on.question_use).toMatchObject({ answered: 2, used: 1, used_keys: ['story'] })
    expect(on.question_necessity).toBeTruthy()
    expect(off.question_use).toBeUndefined()
    expect(off.question_necessity).toBeUndefined()
  })
  it('the edge still makes both calls under the gate', () => {
    expect(edgeAfter('if (questionUsefulnessOn) {', 900)).toContain('questionNecessityRec = questionNecessity(qs)')
    expect(EDGE).toMatch(/if \(questionUsefulnessOn\) \{\s*if \(questionNecessityRec\) bp\.question_necessity = questionNecessityRec/)
    expect(EDGE).toContain('bp.question_use = qu')
  })
})
