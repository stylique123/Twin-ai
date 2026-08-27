// A LABELED DEFAULT NOBODY RENDERS IS THE SAME DEFECT AS NO LABEL AT ALL.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

describe('the default register card only fires when both real signals are empty (Voice Cause 1a)', () => {
  it('is gated on the absence of BOTH voiceSamples and styleRules', () => {
    expect(SRC).toMatch(/const defaultRegisterCard = \(!voiceSamples && !styleRules\) \? renderDefaultRegisterCardInline\(\) : ''/)
  })

  // ⚠️ THE FAILURE THIS CATCHES: computed but never interpolated into the
  // actual prompt template.
  it('the computed card is interpolated into the writer prompt', () => {
    expect(SRC).toMatch(/\$\{defaultRegisterCard \? `\n\$\{defaultRegisterCard\}` : ''\}/)
  })
})
