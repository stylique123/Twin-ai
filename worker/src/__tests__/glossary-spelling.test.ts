// THE GLOSSARY LOWERS THE FLOOR FOR ONE WORD — §6's "any hard words?".
//
// What these tests are for is the BOUND, not the feature. A glossary term can
// only ever adjust the floor for a pairing the ALIGNER already made: it cannot
// match against the transcript on its own, cannot add, drop, reorder or retime
// a caption word, and a take with no alignment is completely unaffected.
//
// The load-bearing one is the last describe block: a glossary that is empty, or
// misconfigured, or has no alignment to work with, must produce captions
// byte-identical to a render from before the glossary existed.
import { describe, expect, it } from 'vitest'

process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
import {
  buildScriptSpellingMap, compileEditPlan, foldGlossaryKey, loadEditPolicy,
} from '../jobs/editorCompile.js'
import { baseInput, buildWords, policy } from './fixtures/editPlanFixture.js'

const FLOOR = loadEditPolicy().captions.scriptSpellingMinSimilarityMilli
const GLOSSARY_FLOOR = loadEditPolicy().captions.glossaryMinSimilarityMilli as number

const sub = (text: string, startMs: number, endMs: number, similarityMilli: number) =>
  ({ text, startMs, endMs, via: 'substitution', similarityMilli })

const floorFor = (terms: string[], min = GLOSSARY_FLOOR) =>
  ({ keys: new Set(terms.map(foldGlossaryKey)), minSimilarityMilli: min })

describe('the two floors are real, frozen, and ordered', () => {
  it('the glossary floor is BELOW the ordinary one, or it does nothing', () => {
    // A higher "floor" would remove re-spellings for exactly the words the
    // creator flagged as important — the opposite of what typing them meant.
    expect(Number.isInteger(GLOSSARY_FLOOR)).toBe(true)
    expect(GLOSSARY_FLOOR).toBeGreaterThan(0)
    expect(GLOSSARY_FLOOR).toBeLessThan(FLOOR)
  })

  it('folds a term to the AGREED form — the same table the shared module pins', () => {
    // A term folded two ways is a term the two halves of the product disagree
    // about: the client stores one entry and the compiler looks up another.
    //
    // Pinned against a TABLE rather than by importing the shared module, on
    // purpose. The worker deliberately does not depend on @twinai/shared, and
    // its CI job runs `npm ci` inside worker/ — an import would either couple
    // the packages or pass here and fail there. The identical table is asserted
    // in packages/shared/src/editor/__tests__/glossary.test.ts, so a drift in
    // EITHER implementation fails its own suite.
    const AGREED: Array<[string, string]> = [
      ['TwinAI', 'twinai'], ['twinai', 'twinai'], ['TWINAI', 'twinai'],
      ['Renée', 'renee'], ['Renee', 'renee'], ['ÄÖÜ', 'aou'],
      ['Kubernetes', 'kubernetes'], ['café', 'cafe'],
    ]
    for (const [input, folded] of AGREED) expect(foldGlossaryKey(input)).toBe(folded)
  })
})

describe('a known term clears a lower floor', () => {
  it('admits a substitution the ordinary floor would refuse', () => {
    const below = sub('TwinAI', 1000, 1400, GLOSSARY_FLOOR + 10)
    // Without the glossary: refused, and counted.
    const plain = buildScriptSpellingMap([below], FLOOR)
    expect(plain.byTime.size).toBe(0)
    expect(plain.belowFloor).toBe(1)
    // With it: admitted, and counted SEPARATELY so the effect is measurable.
    const withG = buildScriptSpellingMap([below], FLOOR, true, floorFor(['TwinAI']))
    expect(withG.byTime.get('1000:1400')).toBe('TwinAI')
    expect(withG.glossaryAdmitted).toBe(1)
  })

  it('a term matches case- and accent-insensitively', () => {
    const t = sub('Renée', 0, 100, GLOSSARY_FLOOR + 10)
    expect(buildScriptSpellingMap([t], FLOOR, true, floorFor(['renee'])).byTime.size).toBe(1)
  })

  it('still refuses a term BELOW even the glossary floor', () => {
    // The floor is lowered, not removed. A pairing this weak is still more
    // likely two unrelated words in the same position.
    const m = buildScriptSpellingMap(
      [sub('TwinAI', 0, 100, GLOSSARY_FLOOR - 1)], FLOOR, true, floorFor(['TwinAI']))
    expect(m.byTime.size).toBe(0)
    expect(m.belowFloor).toBe(1)
    expect(m.glossaryAdmitted).toBe(0)
  })

  it('a word that is NOT a term still faces the ordinary floor', () => {
    const m = buildScriptSpellingMap(
      [sub('cucumbers', 0, 100, GLOSSARY_FLOOR + 10)], FLOOR, true, floorFor(['TwinAI']))
    expect(m.byTime.size).toBe(0)
    expect(m.belowFloor).toBe(1)
  })

  it('a substitution ALREADY above the ordinary floor is not counted as glossary work', () => {
    // `glossaryAdmitted` must mean "admitted ONLY because of the glossary",
    // or it cannot be used to judge whether the lower floor is safe.
    const m = buildScriptSpellingMap([sub('TwinAI', 0, 100, 950)], FLOOR, true, floorFor(['TwinAI']))
    expect(m.byTime.size).toBe(1)
    expect(m.glossaryAdmitted).toBe(0)
  })

  it('matches the SCRIPT side, never the ASR side', () => {
    // The term the creator typed is the word they meant to say. Matching the
    // ASR's mangling against the glossary would be asking whether the
    // microphone knows the term.
    const m = buildScriptSpellingMap(
      [sub('TwinAI', 0, 100, GLOSSARY_FLOOR + 10)], FLOOR, true, floorFor(['twinny']))
    expect(m.byTime.size).toBe(0)
  })
})

describe('A MISCONFIGURED GLOSSARY IS NO GLOSSARY, never a stricter rule', () => {
  it('a floor at or ABOVE the ordinary one is ignored', () => {
    // Otherwise the words the creator flagged as most important would be the
    // only ones that stopped being re-spelled.
    const t = sub('TwinAI', 0, 100, 800)
    for (const bad of [FLOOR, FLOOR + 100]) {
      const m = buildScriptSpellingMap([t], FLOOR, true, floorFor(['TwinAI'], bad))
      expect(m.byTime.size).toBe(1) // admitted by the ORDINARY floor, unchanged
      expect(m.glossaryAdmitted).toBe(0)
    }
  })

  it('a non-finite glossary floor is ignored rather than admitting everything', () => {
    const m = buildScriptSpellingMap(
      [sub('TwinAI', 0, 100, 10)], FLOOR, true, floorFor(['TwinAI'], Number.NaN))
    expect(m.byTime.size).toBe(0)
  })

  it('an EMPTY glossary changes nothing', () => {
    const t = [sub('TwinAI', 0, 100, GLOSSARY_FLOOR + 10)]
    expect(buildScriptSpellingMap(t, FLOOR, true, floorFor([])).byTime.size).toBe(0)
    expect(buildScriptSpellingMap(t, FLOOR).byTime.size).toBe(0)
  })

  it('the master OFF switch still wins over the glossary', () => {
    const m = buildScriptSpellingMap(
      [sub('TwinAI', 0, 100, 999)], FLOOR, false, floorFor(['TwinAI']))
    expect(m.byTime.size).toBe(0)
    expect(m.glossaryAdmitted).toBe(0)
  })
})

describe('NO GLOSSARY CHANGES NOTHING — the property that lets this land', () => {
  it('a compile with no glossary is byte-identical to one with the field absent', () => {
    const a = compileEditPlan({ ...baseInput(), policy: policy() })
    const b = compileEditPlan({ ...baseInput(), glossaryTerms: [], policy: policy() })
    expect(b.canonical).toBe(a.canonical)
    expect(b.planSha256).toBe(a.planSha256)
  })

  it('a glossary with NO ALIGNMENT to work with changes nothing', () => {
    // The bound, stated as a test: a term only ever adjusts a pairing the
    // aligner already made. An upload has no captured script, so it has no
    // pairings — and gets nothing from the glossary. That cost is real and is
    // written down rather than hidden.
    const a = compileEditPlan({ ...baseInput(), policy: policy() })
    const b = compileEditPlan({
      ...baseInput(), glossaryTerms: ['TwinAI', 'Kubernetes'], policy: policy(),
    })
    expect(b.canonical).toBe(a.canonical)
  })

  it('with alignment, a term reaches the caption — and only its letters', () => {
    const words = buildWords()
    const input = baseInput()
    // A substitution the ORDINARY floor would refuse.
    input.evidence.scriptWordTimings = [{
      text: 'TwinAI', startMs: words[26].startMs, endMs: words[26].endMs,
      via: 'substitution', similarityMilli: GLOSSARY_FLOOR + 10,
    }]
    const without = compileEditPlan({ ...input, policy: policy() }).plan
    expect(without.captions.cues.flatMap((c) => c.lines.join(' ').split(' '))).not.toContain('TwinAI')

    const withG = compileEditPlan({ ...input, glossaryTerms: ['TwinAI'], policy: policy() }).plan
    expect(withG.captions.cues.flatMap((c) => c.lines.join(' ').split(' '))).toContain('TwinAI')
    // LETTERS ONLY: same timeline, same cue count, same cue timings.
    expect(withG.timeline).toEqual(without.timeline)
    expect(withG.output.durationMs).toBe(without.output.durationMs)
    expect(withG.captions.cues.length).toBe(without.captions.cues.length)
    for (let i = 0; i < without.captions.cues.length; i++) {
      expect(withG.captions.cues[i].outputStartMs).toBe(without.captions.cues[i].outputStartMs)
      expect(withG.captions.cues[i].outputEndMs).toBe(without.captions.cues[i].outputEndMs)
      expect(withG.captions.cues[i].lines.join(' ').split(' ').length)
        .toBe(without.captions.cues[i].lines.join(' ').split(' ').length)
    }
  })
})

// Top level, after the env stubs: `glossaryResolve` reaches `db.js`, which
// refuses to load without a Supabase URL and key. It never connects — only the
// pure result reader is called.
const { readGlossaryResult, MAX_GLOSSARY_TERM_CHARS: MAXCH } =
  await import('../jobs/glossaryResolve.js')

describe('THE DEPLOY WINDOW — the pin runs before the migration does', () => {
  // `resolveGlossary` runs inside `pinManifest`, which EVERY editor project
  // passes through at its first stage. A push to `main` touching `worker/`
  // deploys the worker while migrations are applied by hand, so without the
  // branch under test that window is a total editor outage — every project
  // failing to pin — rather than a degraded caption.
  it('an ABSENT TABLE pins an EMPTY glossary — which is entailed, not assumed', () => {
    // No table means no row means no creator has stored a term, so the
    // glossary genuinely IS empty at pin time. Freezing an empty one is the
    // pin doing its job.
    const out = readGlossaryResult({
      data: null, error: { code: '42P01', message: 'relation "brand_glossary_terms" does not exist' },
    })
    expect(out.terms).toEqual([])
    expect(out.sha).toMatch(/^[0-9a-f]{64}$/)
  })

  it('EVERY OTHER database error still throws', () => {
    // A permission failure or a timeout is a database that MIGHT be holding
    // terms it will not hand over, and pinning empty from one of those would
    // silently drop every hard word the creator typed — for the life of the
    // project, because the pin is frozen.
    for (const code of ['42501', '57014', '08006', undefined]) {
      expect(() => readGlossaryResult({ data: null, error: { code, message: 'nope' } }))
        .toThrow(/glossary read failed/)
    }
  })

  it('sorts by folded key and drops what may never become a caption', () => {
    const out = readGlossaryResult({
      data: [
        { term: 'zeta' }, { term: 'TwinAI' }, { term: 'twinai' },
        { term: 'has space' }, { term: '' }, { term: 'x'.repeat(MAXCH + 1) }, { term: 42 },
      ],
      error: null,
    })
    // Deduplicated by fold with the first spelling kept, sorted by key, and
    // every entry that could not legally become caption text removed.
    expect(out.terms).toEqual(['TwinAI', 'zeta'])
  })

  it('the pinned digest does not depend on ROW ORDER', () => {
    // The manifest hashes this list. A digest that moved with row order would
    // make a resumed project read an unchanged glossary as a changed input.
    const a = readGlossaryResult({ data: [{ term: 'alpha' }, { term: 'Mu' }], error: null })
    const b = readGlossaryResult({ data: [{ term: 'Mu' }, { term: 'alpha' }], error: null })
    expect(a.terms).toEqual(b.terms)
    expect(a.sha).toBe(b.sha)
  })
})
