// THE CHECKS THAT CAN BE DECIDED, DECIDED IN CODE.
//
// ⚠️ "RATE THIS SCRIPT 1–100" IS THE FAILURE THIS FILE EXISTS TO PREVENT. An
// 8.74 is a number nobody can argue with, act on, or check — the same defect as
// the weighted gallery score that ordered a feed by arithmetic nobody had
// measured. Most of what matters is decidable.
import { describe, expect, it } from 'vitest'
import { validateScript, isGeneric, SCRIPT_CHECKS, VERDICTS } from '../scriptValidator'
import { blankPlan } from '../creativeDecisionPlan'
import { compileStyle } from '../styleCompiler'
import type { WriterInput } from '../writerInput'

const STYLE = compileStyle(['I stopped paying for three tools.', 'Here is what I use now.'])

const input = (over: Partial<WriterInput> = {}): WriterInput => ({
  creatorStyle: STYLE,
  audience: { segment: null, level: null, rules: [] },
  decisionPlan: blankPlan('educate'),
  content: [{
    label: 'first_pick', purpose: 'the safe pick', content: 'Claude costs $20 a month',
    classification: 'user_confirmed', attribution: 'Product Library',
  }],
  referenceStructure: { container: 'recommendation', beats: [] },
  ...over,
})

const GOOD = 'Here is how it works. It costs $20 a month. That means you can try it today.'

const codesOf = (r: ReturnType<typeof validateScript>) => r.failed.map((f) => f.code)

describe('the report says what ran, not only what failed', () => {
  it('returns every check either way', () => {
    // ⚠️ A REPORT LISTING ONLY FAILURES cannot tell you whether a check RAN,
    // which is how one silently stops covering its case for months.
    const r = validateScript(GOOD, input())
    expect(r.checks).toHaveLength(SCRIPT_CHECKS.length)
    expect(new Set(r.checks.map((c) => c.code)).size).toBe(SCRIPT_CHECKS.length)
  })

  it('and a failed binary check blocks, whatever anybody thinks of the prose', () => {
    const r = validateScript('[Product Name] is great.', input())
    expect(r.blocked).toBe(true)
    expect(codesOf(r)).toContain('no_unresolved_placeholder')
  })
})

describe('the failures that would reach a creator', () => {
  it('a bracket that would be read aloud', () => {
    // ⚠️ THE MOST VISIBLE FAILURE THIS SYSTEM HAS SHIPPED — somebody reading
    // "[Phone Model]" into a camera.
    const r = validateScript('I bought the [Phone Model] last week.', input())
    expect(codesOf(r)).toContain('no_unresolved_placeholder')
  })

  it('but a declared clip direction is not a placeholder', () => {
    // ⚖️ `[SHOW: …]` IS AN INSTRUCTION TO THE CAMERA, not a hole in the script.
    const r = validateScript(`${GOOD} [SHOW: the settings page]`, input())
    expect(codesOf(r)).not.toContain('no_unresolved_placeholder')
  })

  it('an ownership claim the plan never authorised', () => {
    const r = validateScript('We built this to solve that. It costs $20 a month.', input())
    expect(codesOf(r)).toContain('ownership_language_allowed')
  })

  it('and the same sentence passes when the plan allows it', () => {
    const plan = { ...blankPlan('educate'), ownershipLanguage: true }
    const r = validateScript('We built this to solve that. It costs $20 a month.', input({ decisionPlan: plan }))
    expect(codesOf(r)).not.toContain('ownership_language_allowed')
  })

  it('a closing ask that is not the one decided', () => {
    const plan = { ...blankPlan('educate'), cta: 'Try it free for a week' }
    const r = validateScript(GOOD, input({ decisionPlan: plan }))
    expect(codesOf(r)).toContain('cta_matches_plan')
  })

  it('eight words in a row lifted from the reference', () => {
    // ⚖️ THE REFERENCE IS A STRUCTURE TO BORROW, NEVER WORDING TO COPY. A
    // paraphrase is fine; a lifted sentence is not.
    const ref = 'nobody tells you this but the first thing you should do is check the price'
    const r = validateScript(`Nobody tells you this but the first thing you should do is check the price. It costs $20 a month.`,
      input(), { referenceTranscript: ref })
    expect(codesOf(r)).toContain('no_copied_reference_wording')
  })

  it('a slot that was never filled', () => {
    const r = validateScript(GOOD, input({
      content: [{ label: 'x', purpose: 'p', content: '   ', classification: 'user_confirmed', attribution: 'a' }],
    }))
    expect(codesOf(r)).toContain('all_slots_filled')
  })

  it('and a beginner script that explains nothing', () => {
    const plan = { ...blankPlan('educate'), audienceLevel: 'beginner' as const }
    const r = validateScript('Use the API with a webhook and a cron.', input({ decisionPlan: plan }))
    expect(codesOf(r)).toContain('audience_level_respected')
  })
})

describe('an opinion may not be promoted to a fact', () => {
  it('flags a creator opinion stated flatly', () => {
    const r = validateScript('This is easier than editing manually, full stop.', input({
      content: [{
        label: 'claim', purpose: 'p', content: 'easier than editing manually',
        classification: 'creator_opinion', attribution: null,
      }],
    }))
    expect(codesOf(r)).toContain('no_unsupported_claim')
  })

  it('and accepts it when the script frames it as a view', () => {
    const r = validateScript('I find this easier than editing manually.', input({
      content: [{
        label: 'claim', purpose: 'p', content: 'easier than editing manually',
        classification: 'creator_opinion', attribution: null,
      }],
    }))
    expect(codesOf(r)).not.toContain('no_unsupported_claim')
  })
})

describe('could this go unchanged to a hundred other creators', () => {
  it('says yes when nothing in it came from this creator', () => {
    // ⚠️ THE FOUNDING DEFECT AS A CHECK. A script perfectly in somebody's voice
    // that says nothing only they could say is the failure the product exists
    // to end — and it can read beautifully while failing.
    expect(isGeneric(input({
      content: [{ label: 'a', purpose: 'p', content: 'some general advice', classification: 'safe_inference', attribution: null }],
    }))).toBe(true)
  })

  it('and no when a product of theirs is in it', () => {
    expect(isGeneric(input())).toBe(false)
  })
})

describe('the judgements are words', () => {
  it('are three, and none of them is a number', () => {
    expect([...VERDICTS]).toEqual(['pass', 'weak', 'fail'])
  })
})
