import { describe, expect, it } from 'vitest'
import {
  ensureProductShown, showModeOf, hookPromise, hookPayoff, newNumbers, payoffRepairPrompt,
  closeGoalOf, closeFits, goalCloseSentence, ensureGoalClose,
} from '../blueprintFinish'
import { shouldExtendScript } from '../scriptIntegrity'

const words = ['Signature', 'Blend']

describe('the product is shown in one or two beats about it (part-3-product: 16%)', () => {
  const script = [
    { section: 'Hook', line: 'My cart nearly closed in March.', action_posing: 'Leans in.' },
    { section: 'Story', line: 'The rain kept everyone away for a week.', action_posing: 'Shakes her head.' },
    { section: 'Reveal', line: 'Then the Signature Blend started selling out by noon.', action_posing: 'Smiles at the lens.' },
    { section: 'Detail', line: 'The Signature Blend is roasted every Monday.', action_posing: 'Nods.' },
    { section: 'CTA', line: 'Come find the cart this weekend.', action_posing: 'Points.' },
  ]
  it('a physical product with no show action gets one on the beat that first names it, from its shape', () => {
    const r = ensureProductShown(script, { productName: 'Signature Blend', productWords: words, mode: 'physical', shape: 'bag' })
    expect(r.reason).toBe('added')
    expect(r.added).toBe(2)
    expect(String(r.script[2].action_posing)).toMatch(/Hold the Signature Blend.*pour/)
    expect((r.script[2] as { camera?: unknown }).camera).toBe('back')
    expect(r.script[3]).toBe(script[3])
  })
  it('an app is the back camera on a screen the extractor saw, never an invented one', () => {
    const app = script.map((b) => ({ ...b, line: String(b.line).replace(/Signature Blend/g, 'Brewlog') }))
    const r = ensureProductShown(app, { productName: 'Brewlog', productWords: ['Brewlog'], mode: showModeOf('APP', 'ALWAYS', ['roast calendar: every batch by day']), screens: ['roast calendar: every batch by day'] })
    expect(r.reason).toBe('added')
    expect(String(r.script[2].action_posing)).toBe('Flip to the back camera on the roast calendar of Brewlog; scroll it slowly while she talks.')
    expect((r.script[2] as { camera?: unknown }).camera).toBe('back')
    expect(showModeOf('SAAS', 'ALWAYS', [])).toBe('none')
    expect(ensureProductShown(app, { productName: 'Brewlog', productWords: ['Brewlog'], mode: 'none' }).reason).toBe('not_showable')
  })
  it('a script that already shows it is left alone; more than two shows outside a teach row are trimmed to two', () => {
    const shown = script.map((b, i) => (i >= 1 && i <= 3 ? { ...b, line: `${b.line} Signature Blend.`, action_posing: 'Holds the Signature Blend up.' } : b))
    const r = ensureProductShown(shown, { productName: 'Signature Blend', productWords: words, mode: 'physical' })
    expect(r.reason).toBe('already_shown')
    expect(r.trimmed).toBe(1)
    expect((r.script[3] as { camera?: unknown }).camera).toBe('front')
    expect(ensureProductShown(shown, { productName: 'Signature Blend', productWords: words, mode: 'physical', row: 'teach' }).trimmed).toBe(0)
  })
  it('a product never named is not forced in', () => {
    const r = ensureProductShown(script.slice(0, 2), { productName: 'Signature Blend', productWords: words, mode: 'physical' })
    expect(r.reason).toBe('not_named')
  })
})

describe('the body pays off the hook (part-3-product: 46%)', () => {
  it('reads the promise: a count, a question, a claim', () => {
    expect(hookPromise('3 mistakes killing your cold brew').count).toBe(3)
    expect(hookPromise('Why does my espresso taste sour?').kind).toBe('question')
    expect(hookPromise("Here's why the beans matter more than the machine").kind).toBe('claim')
    expect(hookPromise('Good morning from the cart.').kind).toBe('none')
  })
  it('an answered question is paid; an unanswered one names the beat to rewrite', () => {
    const paid = [
      { section: 'Hook', line: 'Why does espresso taste sour?' },
      { section: 'Answer', line: 'Sour espresso means the shot ran too fast.' },
      { section: 'CTA', line: 'Try it tomorrow.' },
    ]
    expect(hookPayoff(paid).paid).toBe(true)
    const unpaid = [paid[0], { section: 'Story', line: 'I opened my cart in March.' }, { section: 'Detail', line: 'Mornings are busy.' }, paid[2]]
    const c = hookPayoff(unpaid)
    expect(c.paid).toBe(false)
    expect(c.payoffIndex).toBe(1)
    expect(payoffRepairPrompt(unpaid, c, 'FACTS')).toContain('REWRITE ONLY: 1')
  })
  it('a count is paid by enough body beats or enumerated items', () => {
    const s = [{ line: '3 mistakes with cold brew.' }, { line: 'First, the grind. Second, the water. Third, the time.' }, { section: 'CTA', line: 'Save this.' }]
    expect(hookPayoff(s).paid).toBe(true)
    expect(hookPayoff([s[0], { line: 'The grind matters.' }, s[2]]).paid).toBe(false)
  })
  it('a repair that brings a number nothing supplied is rejected', () => {
    expect(newNumbers('It ran in 12 seconds.', 'It ran fast.', 'shots run 25 seconds')).toEqual(['12'])
    expect(newNumbers('It ran in 25 seconds.', 'It ran fast.', 'shots run 25 seconds')).toEqual([])
  })
})

describe('full length after the late guards (part-3-product: 44%)', () => {
  it('a script the guards shortened below 80% of its budget asks for the extension again', () => {
    const full = [
      { section: 'Hook', line: 'One two three four five six seven eight nine ten eleven twelve.' },
      { section: 'Body', line: Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ') + '.' },
      { section: 'Proof', line: Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ') + '.' },
      { section: 'CTA', line: 'Come say hi at the cart.' },
    ]
    expect(shouldExtendScript(full, 30).extend).toBe(false)
    const guarded = full.filter((b) => b.section !== 'Body')
    expect(shouldExtendScript(guarded, 30).extend).toBe(true)
  })
})

describe('the close fits the goal (part-3-product: 56%)', () => {
  it('maps goals to closes; selling goals keep their own rule', () => {
    expect(closeGoalOf('conversations')).toBe('question')
    expect(closeGoalOf('followers')).toBe('follow_save')
    expect(closeGoalOf('entertain')).toBe('follow_save')
    expect(closeGoalOf('educate')).toBe('takeaway')
    expect(closeGoalOf('sell')).toBe(null)
  })
  it('her own CTA is used when it fits; a follow ask is never written unless allowed', () => {
    expect(goalCloseSentence('question', { herCta: 'Which roast are you drinking today?' })).toBe('Which roast are you drinking today?')
    expect(goalCloseSentence('follow_save', { herCta: 'Follow me for part two' })).toBe('Save this so you have it next time.')
    expect(goalCloseSentence('follow_save', { herCta: 'Follow me for part two', followAllowed: true })).toBe('Follow me for part two.')
    expect(goalCloseSentence('takeaway', { payoffLine: 'Grind finer when the shot runs fast. It changes everything.' }))
      .toBe('So remember: grind finer when the shot runs fast.')
  })
  it('a conversations script that ends on a statement gets a question; one that ends on a question is left', () => {
    const s = [{ section: 'Hook', line: 'Cold brew is overrated.' }, { section: 'Body', line: 'It hides the bean.' }]
    const r = ensureGoalClose(s, 'conversations', {})
    expect(r.changed).toBe('added')
    expect(closeFits(String(r.script[r.script.length - 1].line), 'question')).toBe(true)
    const asked = [...s, { section: 'CTA', line: 'Which side are you on?' }]
    expect(ensureGoalClose(asked, 'conversations', {}).changed).toBe('none')
    const closeNoFit = [...s, { section: 'CTA', line: 'Link in bio' }]
    const a = ensureGoalClose(closeNoFit, 'educate', { payoffLine: 'Grind finer when the shot runs fast.' })
    expect(a.changed).toBe('appended')
    expect(a.script[2].line).toBe('Link in bio. So remember: grind finer when the shot runs fast.')
    expect(ensureGoalClose(s, 'sell', {}).changed).toBe('none')
  })
})
