import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../..')
const FN = readFileSync(
  resolve(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

/**
 * ⚠️ MEASURED, AND IT IS WHY THE CTA DEFECT SHIPPED SIX TIMES UNSEEN.
 *
 * `cta_fallbacks`, `beat_asks` and `caps_emphasis_runs` were read into the
 * `beatAudit` OBJECT LITERAL hundreds of lines above the passes that compute
 * them. A literal captures the value at the moment it is built, so all three
 * persisted their initialisers for every generation ever written:
 *
 *   cta_fallbacks       15 of 15 rows null, 0 numeric
 *   beat_asks.emitted   0 in every row
 *   caps_emphasis_runs  null in every row
 *
 * The decisive pair is generations 4608dc73 and 45d06b93 — the two whose
 * SHIPPED SCRIPTS prove the craft repair ran and wrote fallback CTA lines.
 * Both stored null and zero.
 *
 * ⚖️ `check_counter_durability` registers `cta_fallback` on the grounds that "a
 * RISING rate is the signal that matters". The rate could not rise. A counter
 * that cannot change is not a quiet counter, it is a broken one — and its
 * silence read as good news.
 */
describe('a counter must be written after it is computed', () => {
  const literalStart = FN.indexOf('beatAudit = {')
  const literalEnd = FN.indexOf("event: 'beat_substance'", literalStart)

  it('the literal and the emphasis pass are found, and in that order', () => {
    // Without this the two window assertions below could both pass on -1.
    expect(literalStart).toBeGreaterThan(-1)
    expect(literalEnd).toBeGreaterThan(literalStart)
    expect(FN.indexOf('capsRuns = runs')).toBeGreaterThan(literalEnd)
  })

  for (const key of ['cta_fallbacks', 'beat_asks', 'caps_emphasis_runs']) {
    it(`\`${key}\` is not read into the literal`, () => {
      const literal = FN.slice(literalStart, literalEnd)
      // A comment naming the key is fine and is how the reason is recorded, so
      // whole-line comments are dropped before counting — the repo rule about
      // telling a mention from a use. Not everything after `//`, which would
      // delete a real assignment sitting after a string containing a URL.
      const code = literal.split('\n')
        .filter((l) => !l.trim().startsWith('//')).join('\n')
      expect(code).not.toMatch(new RegExp(`\\b${key}\\s*:`))
    })

    it(`\`${key}\` is assigned onto beatAudit after the passes run`, () => {
      const write = FN.indexOf(`beatAudit.${key} =`)
      expect(write).toBeGreaterThan(-1)
      // After the last of the three computations, not merely after the literal.
      expect(write).toBeGreaterThan(FN.indexOf('capsRuns = runs'))
    })
  }

  it('the mutation is guarded — beatAudit is nulled when instrumentation fails', () => {
    // `beatAudit = null` on the instrumentation catch path is real, so an
    // unguarded `beatAudit.x =` would throw inside the writer.
    expect(FN).toMatch(/beatAudit = null/)
    const write = FN.indexOf('beatAudit.cta_fallbacks =')
    const guard = FN.lastIndexOf('if (beatAudit) {', write)
    expect(guard).toBeGreaterThan(-1)
    expect(write - guard).toBeLessThan(200)
  })
})
