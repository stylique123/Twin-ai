// THE INLINED COPY MUST NOT DRIFT.
//
// `generate-blueprint` runs on Deno deploy and cannot import @twinai/shared, so
// the substance check exists twice: once in `knowledgeResolver.ts` where the 21
// tests live, and once inlined in the edge function where it actually runs.
//
// ⚠️ THE FAILURE THIS PREVENTS is the one the owner named: a contract that
// passes in tests and does something else in production. Tightening the
// first-person pattern in shared while the edge keeps the old one would leave
// every real generation checked by the version nobody tested.
//
// This reads the EDGE SOURCE and compares it to the shared source. It does not
// re-implement either — a paraphrase here would be the same defect one level up.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const EDGE = readFileSync('../../supabase/functions/generate-blueprint/index.ts', 'utf8')
const SHARED = readFileSync('src/knowledgeResolver.ts', 'utf8')

/** Lift a single-line `const NAME = ...` body. Throws rather than returning a
 *  default: a parity test that silently compares nothing is worse than absent. */
function lift(src: string, where: string, name: string): string {
  const m = src.match(new RegExp(`^const ${name} =\\s*\\n?\\s*(.+)$`, 'm'))
  if (!m) throw new Error(`could not lift ${name} from ${where} — fix the marker, do not inline the text`)
  return m[1].trim()
}

describe('edge ↔ shared substance-check parity', () => {
  it('the first-person history pattern is character-identical', () => {
    // The most expensive check in the system: this pattern is the only thing
    // standing between a creator and a fabricated claim about their own life.
    expect(lift(EDGE, 'the edge function', 'FIRST_PERSON_HISTORY'))
      .toBe(lift(SHARED, 'shared', 'FIRST_PERSON_HISTORY'))
  })

  it('the stopword set is identical, so relevance is judged the same way', () => {
    // `tracesTo` decides whether a cited item counts as support. A different
    // stoplist means the same beat passes on one side and fails on the other.
    const edgeStop = lift(EDGE, 'the edge function', 'SUBSTANCE_STOP')
    const sharedStop = lift(SHARED, 'shared', 'STOP')
    expect(edgeStop).toBe(sharedStop)
  })

  it('the edge ladder promotes only what the shared ladder promotes', () => {
    // Written out rather than lifted, because the two functions have different
    // names and signatures. What must match is the RULE: experience requires
    // both the kind and the spoken basis; anything not spoken is coverage.
    for (const src of [EDGE, SHARED]) {
      expect(src).toMatch(/kind === 'experience' && \w+\.basis === 'stated'\)? return 'experience'/)
      expect(src).toMatch(/basis === 'stated'\)? return 'opinion'/)
    }
  })

  it('the edge declares the same three issue codes', () => {
    for (const code of ['unsupported_creator_claim', 'undeclared_evidence', 'unearned_first_person']) {
      expect(EDGE).toContain(code)
    }
  })

  it('the beat schema carries both declaration fields, and requires them', () => {
    // A field the model may omit is a field it will omit. Gemini treats
    // `required` as advisory, but leaving it out guarantees the gap.
    expect(EDGE).toMatch(/substance: str,\n\s*substance_evidence: str,/)
    expect(EDGE).toMatch(/'action_posing', 'substance', 'substance_evidence'\]/)
  })

  it('the check reads the knowledge the PROMPT carried, not the whole store', () => {
    // Checking against `kRows` would excuse the fabrication this exists to
    // catch: a beat could cite something the writer was never shown.
    expect(EDGE).toMatch(/substanceIssues\(declared, speakable\.map/)
  })
})
