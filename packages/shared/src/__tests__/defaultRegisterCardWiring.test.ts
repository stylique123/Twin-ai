// A LABELED DEFAULT NOBODY RENDERS IS THE SAME DEFECT AS NO LABEL AT ALL.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

describe('the default register card only fires when all real signals are empty (Voice Cause 1a)', () => {
  // ⚠️ UPDATED FOR VOICE CAUSE 1(c): a partial style card is real evidence
  // too, and must also suppress this generic default.
  it('is gated on the absence of voiceSamples, styleRules AND partialStyleRules', () => {
    expect(SRC).toMatch(/const defaultRegisterCard = \(!voiceSamples && !styleRules && !partialStyleRules\) \? renderDefaultRegisterCardInline\(\) : ''/)
  })

  // ⚠️ THE FAILURE THIS CATCHES: computed but never interpolated into the
  // actual prompt template.
  it('the computed card is interpolated into the writer prompt', () => {
    expect(SRC).toMatch(/\$\{defaultRegisterCard \? `\n\$\{defaultRegisterCard\}` : ''\}/)
  })
})

// ⚠️ VOICE CAUSE 1(c) — same failure class: computed but never interpolated.
// MUTATION-TESTED: deleting the `${partialStyleRules ? ... }` interpolation
// from the template leaves every other test in this file green — this is
// the only assertion that would catch it.
describe('the partial style card is wired into the writer prompt (Voice Cause 1c)', () => {
  it('is computed from compiledStyle via renderPartialStyleRulesInline', () => {
    expect(SRC).toMatch(/partialStyleRules = renderPartialStyleRulesInline\(compiledStyle\)/)
  })

  it('the computed value is interpolated into the writer prompt', () => {
    expect(SRC).toMatch(/\$\{partialStyleRules \? `\n\$\{partialStyleRules\}` : ''\}/)
  })
})
