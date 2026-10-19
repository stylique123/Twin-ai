import { describe, it, expect } from 'vitest'
import { checkPaidOff, checkPackagedTitle, checkPackagedCaption, enforcePackagingPromise, winningHook, packagingPromiseOn } from '../planner/packagingPromise'

// Fictional coffee roaster script (scripts/ops/fixtures).
const HOOK = 'Your coffee tastes flat because the beans are old, not because you brew it wrong.'
const SCRIPT = [
  { line: HOOK },
  { line: 'Look at the roast date on the bag, not the best-before date.' },
  { line: 'Beans peak about a week after roasting and fade after a month.' },
  { line: 'Keep them in a jar, away from light, and use them within a month.' },
]
const scriptText = SCRIPT.map((b) => b.line).join('\n')

describe('checkPaidOff', () => {
  it('passes packaging made of the hook and script words', () => {
    expect(checkPaidOff('Flat coffee? Your beans are old', HOOK, scriptText).ok).toBe(true)
  })
  it('flags a number the script never says', () => {
    expect(checkPaidOff('Beans go flat in 3 days', HOOK, scriptText).reasons).toContain('unpaid_number')
  })
  it('flags a claim word the script never makes', () => {
    expect(checkPaidOff('The secret to coffee beans that never go flat', HOOK, scriptText).reasons).toContain('unpaid_claim_word')
  })
  it('flags a counted promise the script does not deliver', () => {
    expect(checkPaidOff('Five ways to fix flat coffee beans', HOOK, scriptText).reasons).toContain('unpaid_count')
  })
  it('ignores hashtags', () => {
    expect(checkPaidOff('Your beans are old #coffee #homebrew', HOOK, scriptText).ok).toBe(true)
  })
})

describe('titles and captions', () => {
  it('a title must also inherit the hook', () => {
    const c = checkPackagedTitle('Keep your jar away from light', HOOK, scriptText)
    expect(c.ok).toBe(false)
    expect(c.reasons).toContain('no_shared_key_words')
  })
  it('a caption shares a key word with the hook', () => {
    expect(checkPackagedCaption('Old beans, flat coffee. #coffee', HOOK, scriptText).ok).toBe(true)
    expect(checkPackagedCaption('Use a jar.', HOOK, scriptText).reasons).toContain('no_shared_key_words')
  })
})

describe('enforcePackagingPromise', () => {
  const bp = {
    hook_options: [HOOK, 'Stop blaming your grinder.'],
    script: SCRIPT,
    packaging: { titles: ['Your coffee tastes flat because the beans are old', 'The 5 secret hacks baristas never tell you'], thumbnail: 'x' },
    publish_plan: [
      { platform: 'tiktok', caption: 'Flat coffee? Your beans are old. #coffee', hashtags: [], best_time: '' },
      { platform: 'instagram', caption: 'Guaranteed perfect coffee in 3 days #coffee #brew', hashtags: [], best_time: '' },
    ],
  }
  const { blueprint, record } = enforcePackagingPromise(bp)

  it('drops titles that break the promise and keeps the ones that inherit the hook', () => {
    expect(blueprint.packaging!.titles).toEqual(['Your coffee tastes flat because the beans are old'])
    expect(record.titles).toMatchObject({ checked: 2, dropped: 1, rebuilt: false })
  })
  it('replaces a caption that over-promises with the hook sentence, keeping its hashtags', () => {
    expect(blueprint.publish_plan[0]).toEqual(bp.publish_plan[0])
    expect(blueprint.publish_plan[1]!.caption).toBe(`${HOOK} #coffee #brew`)
    expect(record.captions).toMatchObject({ checked: 2, replaced: 1 })
  })
  it('rebuilds a title from the hook when none survive', () => {
    const r = enforcePackagingPromise({ ...bp, packaging: { titles: ['Ten secrets of the world best roasters'] } })
    expect(r.record.titles.rebuilt).toBe(true)
    expect(r.blueprint.packaging!.titles).toHaveLength(1)
    expect(checkPackagedTitle(r.blueprint.packaging!.titles![0], HOOK, scriptText).ok).toBe(true)
  })
  it('does not mutate its input and is deterministic', () => {
    expect(bp.packaging.titles).toHaveLength(2)
    expect(enforcePackagingPromise(bp)).toEqual({ blueprint, record })
  })
  it('the winning hook is the first final hook option, else the first line', () => {
    expect(winningHook(bp).from).toBe('hook_options')
    expect(winningHook({ script: SCRIPT }).text).toBe(HOOK)
    expect(enforcePackagingPromise({ packaging: { titles: ['x'] } }).record.hook).toBe('none')
  })
  it('kill switch: trial only, PACKAGING_PROMISE=false turns it off', () => {
    expect(packagingPromiseOn(false, undefined)).toBe(false)
    expect(packagingPromiseOn(true, undefined)).toBe(true)
    expect(packagingPromiseOn(true, 'false')).toBe(false)
  })
})
