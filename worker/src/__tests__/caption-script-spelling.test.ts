// CAPTIONS TAKE THE SCRIPT'S SPELLING AT THE RECORDING'S TIME — the first
// consumer of the alignment component (#242).
//
// The script is ground truth for SPELLING, the recording for TIMING. Captions
// used the ASR's spelling for both, so a brand name the ASR never heard
// correctly went on screen misspelled even though the creator typed it
// correctly minutes earlier.
//
// What these tests are actually for is the BOUND, not the feature. This can
// only change the spelling of a word the aligner already paired: it cannot add,
// drop, reorder or retime a caption word, and it must be a complete no-op
// wherever there is no alignment — an upload, a take with no captured script,
// or a project pinned before alignment existed. That last case is not
// hypothetical: every project pinned before #242 has no alignment digest in its
// manifest, and those renders must keep working untouched.
import { describe, expect, it } from 'vitest'
import { buildScriptSpellingMap, compileEditPlan, loadEditPolicy } from '../jobs/editorCompile.js'
import { readComponentScriptWordTimings } from '../jobs/editorCompileInput.js'
import { baseInput, buildWords, policy } from './fixtures/editPlanFixture.js'

const sub = (text: string, startMs: number, endMs: number, similarityMilli: number) =>
  ({ text, startMs, endMs, via: 'substitution', similarityMilli })

describe('script spelling map — only substitutions, only above the floor', () => {
  const FLOOR = loadEditPolicy().captions.scriptSpellingMinSimilarityMilli

  it('the floor is a real, frozen number in 0..1000', () => {
    expect(Number.isInteger(FLOOR)).toBe(true)
    expect(FLOOR).toBeGreaterThan(0)
    expect(FLOOR).toBeLessThanOrEqual(1000)
  })

  it('a high-similarity substitution supplies the script spelling', () => {
    const m = buildScriptSpellingMap([sub('TwinAI', 1000, 1400, 900)], FLOOR)
    expect(m.byTime.get('1000:1400')).toBe('TwinAI')
    expect(m.belowFloor).toBe(0)
  })

  it('a LOW-similarity substitution is refused and counted, never applied', () => {
    // The failure this floor exists to prevent: the aligner pairs two unrelated
    // words because they sit in the same position, and re-spelling would put a
    // word on screen the creator never said.
    const m = buildScriptSpellingMap([sub('kubernetes', 1000, 1400, 100)], FLOOR)
    expect(m.byTime.size).toBe(0)
    expect(m.belowFloor).toBe(1)
  })

  it('exactly at the floor is accepted; one below is not', () => {
    expect(buildScriptSpellingMap([sub('x', 0, 1, FLOOR)], FLOOR).byTime.size).toBe(1)
    expect(buildScriptSpellingMap([sub('x', 0, 1, FLOOR - 1)], FLOOR).byTime.size).toBe(0)
  })

  it('a MATCH is not re-spelled — the ASR already agrees', () => {
    const m = buildScriptSpellingMap([{ text: 'hello', startMs: 0, endMs: 1, via: 'match', similarityMilli: 1000 }], FLOOR)
    expect(m.byTime.size).toBe(0)
  })

  it('a NOT_SPOKEN word never reaches a caption — it was never said', () => {
    const m = buildScriptSpellingMap([{ text: 'skipped', startMs: null, endMs: null, via: 'not_spoken' }], FLOOR)
    expect(m.byTime.size).toBe(0)
  })

  it('an ad-lib keeps the ASR text — the transcript is evidence, not the plan', () => {
    // Insertions never appear in scriptWordTimings at all (they are spoken
    // words with no script word), so nothing can key onto them. This asserts
    // the shape that guarantees it: a spoken word with no entry gets no
    // override, which is what the compiler's `?? w.text` fallback relies on.
    const m = buildScriptSpellingMap([sub('scripted', 500, 700, 1000)], FLOOR)
    expect(m.byTime.get('900:1100')).toBeUndefined()
  })

  it('AMBIGUITY is dropped, not guessed — two timings claiming one span', () => {
    const m = buildScriptSpellingMap([sub('first', 100, 200, 1000), sub('second', 100, 200, 1000)], FLOOR)
    expect(m.byTime.has('100:200')).toBe(false)
    expect(m.ambiguous).toBe(1)
  })

  it('non-integer or absent times are skipped rather than keyed loosely', () => {
    const m = buildScriptSpellingMap([
      { text: 'a', startMs: 1.5 as unknown as number, endMs: 2, via: 'substitution', similarityMilli: 1000 },
      { text: 'b', startMs: null, endMs: 2, via: 'substitution', similarityMilli: 1000 },
      { text: 'c', startMs: 3, endMs: null, via: 'substitution', similarityMilli: 1000 },
    ], FLOOR)
    expect(m.byTime.size).toBe(0)
  })

  it('an empty script spelling is never applied — a blank caption word is worse than a wrong one', () => {
    expect(buildScriptSpellingMap([sub('', 1, 2, 1000)], FLOOR).byTime.size).toBe(0)
  })

  it('NO ALIGNMENT is a complete no-op — undefined and empty alike', () => {
    // The load-bearing case. Uploads, takes with no captured script, and every
    // project pinned before #242 land here, and their captions must be exactly
    // what they were before this consumer existed.
    for (const input of [undefined, []]) {
      const m = buildScriptSpellingMap(input, FLOOR)
      expect(m.byTime.size).toBe(0)
      expect(m.applied).toBe(0)
      expect(m.belowFloor).toBe(0)
      expect(m.ambiguous).toBe(0)
    }
  })

  it('malformed entries do not throw — a bad component degrades to no override', () => {
    const junk = [null, undefined, {}, { via: 'substitution' }, 'nope'] as unknown as never[]
    expect(() => buildScriptSpellingMap(junk, FLOOR)).not.toThrow()
    expect(buildScriptSpellingMap(junk, FLOOR).byTime.size).toBe(0)
  })

  it('the map keys on EXACT integer times — no tolerance to drift onto a neighbour', () => {
    const m = buildScriptSpellingMap([sub('TwinAI', 1000, 1400, 900)], FLOOR)
    expect(m.byTime.get('1000:1400')).toBe('TwinAI')
    for (const near of ['999:1400', '1000:1401', '1001:1399']) {
      expect(m.byTime.get(near)).toBeUndefined()
    }
  })

  it('FAIL CLOSED: a missing or non-numeric floor re-spells NOTHING', () => {
    // `(similarityMilli ?? 0) < undefined` is FALSE, so an absent threshold
    // would silently accept EVERY substitution — the fail-open direction, on
    // the one decision here that can put a word on screen the creator never
    // said. This is the same shape as the merge-gate exemption fixed in #243:
    // a comparison against a value that is not there, defaulting to permissive.
    for (const bad of [undefined, null, NaN, 'x']) {
      const m = buildScriptSpellingMap([sub('TwinAI', 1, 2, 1000)], bad as unknown as number)
      expect(m.byTime.size).toBe(0)
      expect(m.applied).toBe(0)
    }
  })

  it('applied starts at zero — the compiler counts real changes, the map does not presume any', () => {
    expect(buildScriptSpellingMap([sub('TwinAI', 1, 2, 1000)], FLOOR).applied).toBe(0)
  })
})

describe('reading the alignment component — a malformed one must not fail a render', () => {
  it('extracts usable entries', () => {
    const got = readComponentScriptWordTimings({
      scriptWordTimings: [{ text: 'TwinAI', startMs: 5, endMs: 9, via: 'substitution', similarityMilli: 900 }],
    })
    expect(got).toEqual([{ text: 'TwinAI', startMs: 5, endMs: 9, via: 'substitution', similarityMilli: 900 }])
  })

  it('a not_spoken entry keeps null times rather than inventing them', () => {
    const got = readComponentScriptWordTimings({
      scriptWordTimings: [{ text: 'skipped', startMs: null, endMs: null, via: 'not_spoken' }],
    })
    expect(got[0]).toEqual({ text: 'skipped', startMs: null, endMs: null, via: 'not_spoken' })
  })

  it('every not-an-array shape degrades to [] — never a throw', () => {
    for (const bad of [null, {}, { scriptWordTimings: null }, { scriptWordTimings: 'nope' }, { scriptWordTimings: 7 }]) {
      expect(readComponentScriptWordTimings(bad as Record<string, unknown> | null)).toEqual([])
    }
  })

  it('junk entries are skipped individually, good ones survive beside them', () => {
    const got = readComponentScriptWordTimings({
      scriptWordTimings: [null, 'x', {}, { text: 'a' }, { via: 'match' },
        { text: 'ok', startMs: 1, endMs: 2, via: 'substitution', similarityMilli: 800 }],
    })
    expect(got).toHaveLength(1)
    expect(got[0].text).toBe('ok')
  })
})

describe('END TO END through compileEditPlan — the bound that matters', () => {
  const FLOOR = loadEditPolicy().captions.scriptSpellingMinSimilarityMilli
  const words = buildWords()
  // A word that certainly survives into the output: the fixture keeps
  // selections [0,2,3,4], and w0 sits at 1000ms inside the first window.
  const target = words[0]

  const cueText = (input: Parameters<typeof compileEditPlan>[0]): string =>
    compileEditPlan({ ...input, policy: policy() }).plan.captions.cues.map((c) => c.lines.join(' ')).join(' | ')

  it('WITHOUT alignment the captions are exactly what they always were', () => {
    const before = cueText(baseInput())
    const withEmpty = cueText(baseInput({
      evidence: { ...baseInput().evidence, scriptWordTimings: [] },
    }))
    expect(withEmpty).toBe(before)
    expect(before).toContain('w0')
  })

  it('a high-similarity substitution puts the SCRIPT spelling on screen', () => {
    const out = cueText(baseInput({
      evidence: {
        ...baseInput().evidence,
        scriptWordTimings: [{
          text: 'TwinAI', startMs: target.startMs, endMs: target.endMs,
          via: 'substitution', similarityMilli: 950,
        }],
      },
    }))
    expect(out).toContain('TwinAI')
    expect(out).not.toContain('w0 ')
  })

  it('a BELOW-FLOOR substitution leaves the ASR text alone', () => {
    const out = cueText(baseInput({
      evidence: {
        ...baseInput().evidence,
        scriptWordTimings: [{
          text: 'kubernetes', startMs: target.startMs, endMs: target.endMs,
          via: 'substitution', similarityMilli: FLOOR - 1,
        }],
      },
    }))
    expect(out).not.toContain('kubernetes')
    expect(out).toContain('w0')
  })

  it('re-spelling changes NO timing and NO word count — only the letters', () => {
    const plain = compileEditPlan({ ...baseInput(), policy: policy() }).plan
    const respelt = compileEditPlan({ ...baseInput({
      evidence: {
        ...baseInput().evidence,
        scriptWordTimings: [{
          text: 'TwinAI', startMs: target.startMs, endMs: target.endMs,
          via: 'substitution', similarityMilli: 950,
        }],
      },
    }), policy: policy() }).plan
    expect(respelt.captions.cues).toHaveLength(plain.captions.cues.length)
    expect(respelt.captions.cues.map((c) => [c.startMs, c.endMs]))
      .toEqual(plain.captions.cues.map((c) => [c.startMs, c.endMs]))
    expect(respelt.captions.cues.map((c) => c.lines.join(' ').split(' ').length))
      .toEqual(plain.captions.cues.map((c) => c.lines.join(' ').split(' ').length))
  })

  it('a timing that matches NO spoken word changes nothing', () => {
    const out = cueText(baseInput({
      evidence: {
        ...baseInput().evidence,
        scriptWordTimings: [{
          text: 'ghost', startMs: 999999, endMs: 1000001,
          via: 'substitution', similarityMilli: 1000,
        }],
      },
    }))
    expect(out).toBe(cueText(baseInput()))
  })
})
