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
