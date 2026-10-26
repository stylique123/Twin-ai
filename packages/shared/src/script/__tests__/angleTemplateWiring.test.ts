import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planQuestionsForAngle, angleSlotText, questionBreaksRules } from '../questionUsefulness.js'
import { ANGLE_SPECS } from '../angleFit.js'

// Fictional topic only.
const TOPIC = 'hand-poured candles'
const base = (angle: keyof typeof ANGLE_SPECS) => ({ angle, angleNeeds: ANGLE_SPECS[angle].needs, onFile: [], hasProduct: false })

describe('angleTemplate in the question plan (ANGLE_TEMPLATES, default OFF)', () => {
  it('without angleWording the plan is unchanged', () => {
    const off = planQuestionsForAngle(base('stand'))
    expect(off.map((q) => q.text)).toEqual(['Is there something most people in your space say that you disagree with?'])
  })
  it('with angleWording, her slot is worded by the angle template', () => {
    expect(planQuestionsForAngle({ ...base('stand'), angleWording: { topic: TOPIC } })[0]!.text).toBe(`What do you think about ${TOPIC} that most people don't?`)
    expect(planQuestionsForAngle({ ...base('behind'), angleWording: { topic: TOPIC } })[0]!.text).toBe(`What's one step in your ${TOPIC} people never see?`)
    const myth = planQuestionsForAngle({ ...base('myth'), angleWording: { topic: TOPIC } }).map((q) => q.text)
    expect(myth).toContain(`What's actually true about ${TOPIC}?`)
  })
  it('keys, pieces and count are the same either way', () => {
    for (const a of ['myth', 'answer', 'stand', 'behind', 'beforeafter', 'moment'] as const) {
      const off = planQuestionsForAngle(base(a)), on = planQuestionsForAngle({ ...base(a), angleWording: { topic: TOPIC } })
      expect(on.map((q) => [q.key, q.piece])).toEqual(off.map((q) => [q.key, q.piece]))
    }
  })
  it('every template it can return passes the no-date/no-presume rule', () => {
    for (const a of Object.keys(ANGLE_SPECS)) for (const s of ['stance', 'context', 'objection', 'process', 'proof', 'story', 'close'] as const) {
      const t = angleSlotText(a, s, TOPIC)
      if (t) expect(questionBreaksRules(t)).toBe(false)
    }
  })
  it('offer, moment, an empty topic and product slots keep their text', () => {
    expect(angleSlotText('offer', 'close', TOPIC)).toBeNull()
    expect(angleSlotText('moment', 'story', TOPIC)).toBeNull()
    expect(angleSlotText('stand', 'stance', '  ')).toBeNull()
    const show = planQuestionsForAngle({ angle: 'show', angleNeeds: ANGLE_SPECS.show.needs, onFile: [], hasProduct: true, angleWording: { topic: TOPIC } })
    expect(show.every((q) => q.source === 'product')).toBe(true)
  })
  it('the edge passes angleWording only when ANGLE_TEMPLATES is "on"', () => {
    const src = readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
    expect(src).toMatch(/Deno\.env\.get\('ANGLE_TEMPLATES'\) === 'on' \? \{ angleWording:/)
  })
})
