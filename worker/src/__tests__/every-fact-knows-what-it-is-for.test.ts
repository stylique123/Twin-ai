import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { purposeByRules, servesObjective, cleanModelPurpose } from '../generated/factPurpose.js'

const ROOT = join(__dirname, '..', '..', '..')

describe('every fact knows what it is for (owner 2026-10-02)', () => {
  it('the rules place facts that announce their purpose', () => {
    expect(purposeByRules({ kind: 'fact', text: 'A 12oz bag is $18 and ships free.' }).serves).toContain('sell')
    expect(purposeByRules({ kind: 'fact', text: 'I roast at 400 degrees for 12 minutes.' }).serves).toContain('authority')
    expect(purposeByRules({ kind: 'experience', text: 'I started roasting the year my daughter was born.' }).serves).toContain('personal_brand')
  })
  it('the police story is never material for selling or explaining (the known-bad case)', () => {
    const police = { kind: 'experience', text: 'Faced neighbor complaints, police visits, and code enforcement threats over coffee roasting smells at home.' }
    expect(purposeByRules(police).serves).not.toContain('sell')
    expect(servesObjective(police, 'sell', new Set())).toBe(false)
    expect(servesObjective(police, 'educate', new Set())).toBe(false)
    expect(cleanModelPurpose({ serves: ['sell', 'entertain'], confidence: 0.9 }, police.text)).toEqual(['entertain'])
  })
  it('a mishap is not material for "explain what it does" (the other known-bad case)', () => {
    const mishap = { kind: 'experience', text: 'My first batch was a disaster and tasted burnt.' }
    expect(servesObjective(mishap, 'educate', new Set())).toBe(false)
    expect(servesObjective(mishap, 'entertain', new Set())).toBe(true)
  })
  it('unplaceable or labelled-empty is ineligible everywhere; only her own switch-on lets it through', () => {
    const vague = { id: 'a', kind: 'fact', text: 'Saturday was a good day.' }
    expect(servesObjective(vague, 'sell', new Set())).toBe(false)
    expect(servesObjective({ ...vague, serves: [] }, 'entertain', new Set())).toBe(false)
    expect(servesObjective(vague, 'sell', new Set(['a']))).toBe(true)
  })
  it('the writer filters at the single merge point and asks instead of filling', () => {
    const edge = readFileSync(join(ROOT, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
    expect(edge).toMatch(/if \(!servesObjective\(r as never, purposeGoal, herOnIds\)\) \{ offPurpose\+\+; return false \}/)
    expect(edge).toMatch(/event: 'objective_has_no_fitting_fact'/)
    expect(edge).toMatch(/!String\(answers\.claims \?\? ''\)\.trim\(\)/)
  })
})

describe('audit 2026-10-02: her own fresh words are never dropped', () => {
  it('an unlabeled answer she typed is eligible until the labeler reaches it', () => {
    expect(servesObjective({ id: 'x', kind: 'experience', text: 'Saturday was a good day.', source: 'asked' }, 'sell', new Set())).toBe(true)
    expect(servesObjective({ id: 'x', kind: 'experience', text: 'Saturday was a good day.', source: 'asked', serves: ['entertain'] }, 'sell', new Set())).toBe(false)
  })
})
