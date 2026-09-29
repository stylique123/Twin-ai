// Audit 2026-09-29 #6: the length-extension pass is re-checked for entitlement.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const EDGE = readFileSync(new URL('../../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url), 'utf8')

describe('a lengthened line may not claim more than the original', () => {
  it('re-runs the entitlement check on the extended beats and reverts new failures', () => {
    const at = EDGE.indexOf('if (ext.accepted) {')
    const block = EDGE.slice(at, at + 1800)
    expect(block).toMatch(/entitlementFailures\(after, suppliedForCheck\)/)
    expect(block).toMatch(/after\[f\.index\] = before\[f\.index\]/)
    expect(block.indexOf('extension_claim_reverted')).toBeLessThan(block.indexOf('bpAny.script = ext.beats'))
  })
})

describe('the repetition rewrites offered to her are privacy-checked', () => {
  it('only safe candidates are offered', () => {
    expect(EDGE).toMatch(/\.filter\(\(c\) => rewriteIsSafe\(c, \{ allowedText: allowedForRepair, excludedTexts: guardExcludedTexts \}\)\)/)
  })
})
