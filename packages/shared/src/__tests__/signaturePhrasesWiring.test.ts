// A MEASURED PHRASE NOBODY READS IS THE SAME DEFECT AS AN UNMEASURED ONE.
// This pins that the writer prompt actually consumes signaturePhrasesLine,
// separately from signaturePhrases-parity.test.ts (which only proves the two
// COPIES of the extractor agree with each other, not that either is called).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

describe('signature phrases are computed AND reach the prompt (Voice Cause 3)', () => {
  it('selects id alongside text, needed to tell videos apart', () => {
    expect(SRC).toMatch(/\.from\('transcripts'\)\s*\n\s*\.select\('id, text'\)/)
  })

  it('computes signaturePhrasesLine from the own-speech rows', () => {
    expect(SRC).toMatch(/signaturePhrasesLine = renderSignaturePhrasesInline\(\s*extractSignaturePhrasesInline\(/)
  })

  // ⚠️ THE FAILURE MODE THIS CATCHES: computed but never interpolated into the
  // template literal that becomes the actual model prompt.
  it('the computed line is interpolated into the writer prompt', () => {
    expect(SRC).toMatch(/\$\{signaturePhrasesLine \? `\n-\s*\$\{signaturePhrasesLine\}` : ''\}/)
  })

  // ⚖️ A FAILED READ DEGRADES THIS THE SAME WAY IT DEGRADES styleRules.
  it('a failed read resets the line to empty, not a stale value', () => {
    const catchBlock = SRC.slice(SRC.indexOf('let signaturePhrasesLine'), SRC.indexOf('let signaturePhrasesLine') + 2000)
    expect(catchBlock).toMatch(/signaturePhrasesLine = ''/)
  })
})
