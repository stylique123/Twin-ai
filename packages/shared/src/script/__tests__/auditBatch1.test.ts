// Audit 2026-09-29, batch 1: the confirmed-working list stays working, and the
// two leaks closed here stay closed.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rewriteIsSafe } from '../privacyGuard.js'

const read = (p: string) => readFileSync(new URL(`../../../../../${p}`, import.meta.url), 'utf8')
const AUDIENCE = read('worker/src/nicheBrain/audience.ts')
const BUILDING = read('apps/web/src/pages/v2/V2Building.tsx')
const RESULT = read('apps/web/src/pages/Result.tsx')
const EDGE = read('supabase/functions/generate-blueprint/index.ts')

describe('#1 a test-viewer rewrite may only say what the checked script said', () => {
  const allowedText = 'I roast every batch by hand. Our house blend sells out on Saturdays.'
  const excludedTexts = ['The police came to the stall.', 'Her cups score above 80.']
  it('keeps a plain rewrite', () => {
    expect(rewriteIsSafe('Every batch is roasted by hand, and Saturdays sell out.', { allowedText, excludedTexts })).toBe(true)
  })
  it('refuses a private term, a private fact, or a new number', () => {
    expect(rewriteIsSafe('Even after the police came, I kept roasting.', { allowedText, excludedTexts })).toBe(false)
    expect(rewriteIsSafe('These cups score above eighty.', { allowedText, excludedTexts })).toBe(false)
    expect(rewriteIsSafe('I roast in two-pound batches.', { allowedText, excludedTexts })).toBe(false)
  })
  it('is applied to new hooks and rewritten lines before anything is written back', () => {
    expect(AUDIENCE).toMatch(/const fresh = drafted\.filter\(safe\)/)
    expect(AUDIENCE).toMatch(/drafted\.changed\.filter\(\(i\) => !safe\(drafted\.lines\[i\]\)\)/)
    expect(AUDIENCE.indexOf('rewriteIsSafe(t,')).toBeLessThan(AUDIENCE.indexOf(".update({ blueprint: next })"))
  })
})

describe('#2 the facts the plan card showed are the facts sent', () => {
  it('captures the list at the tap, before the plan is cleared', () => {
    const tap = BUILDING.indexOf('idsAtWrite.current = usedKnowledgeIds')
    expect(tap).toBeGreaterThan(0)
    expect(tap).toBeLessThan(BUILDING.indexOf('setPlan(null)', tap))
    expect(BUILDING).toMatch(/use_knowledge_ids: ids[\s\S]{0,40}\(usedKnowledgeIds \?\? idsAtWrite\.current\)/)
  })
})

describe('confirmed working, must not regress', () => {
  it('an unsupported beat is dropped and disclosed, not invented', () => {
    expect(RESULT).toMatch(/dropped-beats-line/)
    expect(EDGE).toMatch(/dropped_beats/)
  })
  it('a short runtime is disclosed rather than padded', () => {
    expect(RESULT).toMatch(/shortfall-line/)
  })
  it('the recommended hook is the top-scored hook', () => {
    expect(AUDIENCE).toMatch(/orderHooksBestFirst\(r\.hooks\)/)
    expect(AUDIENCE).toMatch(/defaultHookAfterTest\(ordered/)
  })
  it('"why it works" shows the real test number', () => {
    expect(RESULT).toMatch(/whyItWorksFromTest\(/)
  })
  it('the privacy guard and line sources still run before the script is stored', () => {
    const insert = EDGE.indexOf(".from('generations')\n      .insert({")
    expect(EDGE.indexOf('guardScript(bp.script')).toBeLessThan(insert)
    expect(EDGE.indexOf('traceLines(bp.script')).toBeLessThan(insert)
  })
})
