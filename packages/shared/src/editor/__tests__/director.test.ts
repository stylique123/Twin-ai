import { describe, expect, it } from 'vitest'
import {
  buildMaxLegalSpeechComponent, buildMaxUpstreamCompatFixture, projectSpeechToEnvelope,
  serializeDirectorEnvelope, envelopeByteLength, conservativeTokenBound,
  validateDirectorEnvelope, DirectorEnvelopeError, canonicalJson, utf8ByteLength,
  UPSTREAM_SPEECH_BUDGET_BYTES, MIN_COMPACT_WORD_BYTES, MIN_COMPACT_CANDIDATE_BYTES,
  MIN_COMPACT_BOUNDARY_BYTES, MAX_WORDS, MAX_CANDIDATES, MAX_BOUNDARIES, MAX_TIME_CS,
  DIRECTOR_INPUT_MAX_BYTES, EXPECTED_MAX_COMPAT_ENVELOPE_BYTES, PROVIDER_TOKEN_CEILING,
  PROVIDER_CONTEXT_TOKENS, ANALYTIC_MAX_UPSTREAM_ENVELOPE_BYTES, IDENTITY_BUNDLE_MAX_BYTES,
  PIPELINE_EPOCH_V2, type DirectorEnvelope,
} from '../director'

// ===========================================================================
// GATE 0 — derived-bound integrity: the caps are FLOORS OF THE UPSTREAM
// BUDGET, not hand-picked numbers.
// ===========================================================================
describe('Gate 0: bounds derived from the Phase-5 contract', () => {
  it('element-count caps are exactly floor(budget / structural minimum)', () => {
    expect(MAX_WORDS).toBe(Math.floor(UPSTREAM_SPEECH_BUDGET_BYTES / MIN_COMPACT_WORD_BYTES))
    expect(MAX_CANDIDATES).toBe(Math.floor(UPSTREAM_SPEECH_BUDGET_BYTES / MIN_COMPACT_CANDIDATE_BYTES))
    expect(MAX_BOUNDARIES).toBe(Math.floor(UPSTREAM_SPEECH_BUDGET_BYTES / MIN_COMPACT_BOUNDARY_BYTES))
    expect(MAX_WORDS).toBe(16949)
    expect(MAX_CANDIDATES).toBe(4901)
    expect(MAX_BOUNDARIES).toBe(9523)
  })
  it('cap relations: analytic max <= byte cap <= token ceiling (80% context)', () => {
    expect(ANALYTIC_MAX_UPSTREAM_ENVELOPE_BYTES).toBeLessThanOrEqual(DIRECTOR_INPUT_MAX_BYTES)
    expect(DIRECTOR_INPUT_MAX_BYTES).toBeLessThanOrEqual(PROVIDER_TOKEN_CEILING)
    expect(PROVIDER_TOKEN_CEILING).toBe(Math.floor(PROVIDER_CONTEXT_TOKENS * 0.8))
  })
})

// ===========================================================================
// GATE 0 — maximum upstream-compatible fixture: a legal, budget-saturating
// Phase-5 component projected by the REAL projection fits ONE inference.
// ===========================================================================
describe('Gate 0: maximum upstream-compatible fixture', () => {
  const comp = buildMaxLegalSpeechComponent()
  const env = buildMaxUpstreamCompatFixture()
  const bytes = envelopeByteLength(env)

  it('the source component is LEGAL: within the Phase-5 byte budget', () => {
    expect(comp.serializedBytes).toBeLessThanOrEqual(UPSTREAM_SPEECH_BUDGET_BYTES)
    // and near-saturating (>= 99% of the budget), so this is a max-class input
    expect(comp.serializedBytes).toBeGreaterThanOrEqual(UPSTREAM_SPEECH_BUDGET_BYTES * 0.99)
  })

  it('serializes to the EXACT frozen byte count (no approximation)', () => {
    expect(bytes).toBe(EXPECTED_MAX_COMPAT_ENVELOPE_BYTES)
    expect(new TextEncoder().encode(serializeDirectorEnvelope(env)).length).toBe(EXPECTED_MAX_COMPAT_ENVELOPE_BYTES)
  })

  it('fits the byte cap with >= 20% headroom and stays under the analytic bound', () => {
    expect(bytes).toBeLessThanOrEqual(ANALYTIC_MAX_UPSTREAM_ENVELOPE_BYTES)
    expect(bytes).toBeLessThanOrEqual(DIRECTOR_INPUT_MAX_BYTES)
    expect(DIRECTOR_INPUT_MAX_BYTES / bytes).toBeGreaterThanOrEqual(1.2)
  })

  it('conservative token bound (tokens <= bytes) < 80% of provider context', () => {
    expect(conservativeTokenBound(env)).toBe(bytes)
    expect(bytes).toBeLessThanOrEqual(PROVIDER_TOKEN_CEILING)
  })

  it('VALIDATES as untrusted input (no truncation, no rejection)', () => {
    const parsed = validateDirectorEnvelope(JSON.parse(JSON.stringify(env)))
    expect(parsed.words.length).toBe(comp.words.length)
    expect(parsed.candidates.length).toBe(comp.candidates.length)
    expect(parsed.boundaries.length).toBe(comp.boundaries.length)
  })

  it('identity+bundle at max string lengths fits its enforced cap', () => {
    const idBytes = utf8ByteLength(canonicalJson({ bundle: env.bundle, identity: env.identity }))
    expect(idBytes).toBeLessThanOrEqual(IDENTITY_BUNDLE_MAX_BYTES)
  })

  it('projection is LOSSLESS in evidence identity (ids, anchors, full ref runs)', () => {
    const proj = projectSpeechToEnvelope(comp)
    expect(proj.words.length).toBe(comp.words.length)
    // every candidate keeps its anchors and its complete ref run
    for (let i = 0; i < comp.candidates.length; i++) {
      const c = comp.candidates[i]
      const t = proj.candidates[i]
      expect(t[3].length).toBe(c.wordIds.length)
      expect(t[1]).toBe(c.prevWordId === null ? -1 : Number(c.prevWordId.slice(1)))
      expect(t[2]).toBe(c.nextWordId === null ? -1 : Number(c.nextWordId.slice(1)))
    }
  })
})

// ===========================================================================
// GATE 0 — hardened untrusted-input validator: every malformed case fails
// with a STABLE code, never an incidental TypeError.
// ===========================================================================
describe('Gate 0: hostile validator (untrusted-input boundary)', () => {
  const expectCode = (input: unknown, code: string) => {
    let err: unknown
    try { validateDirectorEnvelope(input) } catch (e) { err = e }
    expect(err).toBeInstanceOf(DirectorEnvelopeError)
    expect((err as DirectorEnvelopeError).code).toBe(code)
  }

  it('non-objects are rejected with a stable code', () => {
    for (const bad of [null, undefined, 'envelope', 42, true, ['a']]) {
      expectCode(bad, 'director_envelope_not_object')
    }
  })

  const cases: Array<[string, (e: Record<string, unknown>) => void, string]> = [
    ['missing top-level key (words removed)', (e) => { delete e.words }, 'director_envelope_missing_key'],
    ['unknown top-level key', (e) => { e.extra = 1 }, 'director_envelope_unknown_key'],
    ['schemaVersion mismatch', (e) => { e.schemaVersion = 99 }, 'director_envelope_schema_mismatch'],
    ['pipelineEpoch mismatch', (e) => { e.pipelineEpoch = 1 }, 'director_envelope_epoch_mismatch'],
    ['bundle not object', (e) => { e.bundle = 'x' }, 'director_envelope_bad_bundle'],
    ['bundle unknown key', (e) => { (e.bundle as Record<string, unknown>).x = 1 }, 'director_envelope_unknown_key'],
    ['bundle version over 64 bytes', (e) => { (e.bundle as Record<string, unknown>).version = 'v'.repeat(65) }, 'director_envelope_bad_string'],
    ['bundle promptSha not 64-hex', (e) => { (e.bundle as Record<string, unknown>).promptSha256 = 'xyz' }, 'director_envelope_bad_string'],
    ['identity bad uuid', (e) => { (e.identity as Record<string, unknown>).projectId = 'not-a-uuid' }, 'director_envelope_bad_string'],
    ['identity oversized string field', (e) => { (e.identity as Record<string, unknown>).sourceChecksum = 'f'.repeat(6000) }, 'director_envelope_bad_string'],
    ['identity unknown key', (e) => { (e.identity as Record<string, unknown>).evil = 'x' }, 'director_envelope_unknown_key'],
    ['componentVersions unknown key', (e) => { ((e.identity as Record<string, unknown>).componentVersions as Record<string, unknown>).visual = 'v' }, 'director_envelope_unknown_key'],
    ['words not an array', (e) => { e.words = { 0: ['a', 0, 9] } }, 'director_envelope_bad_word'],
    ['word tuple too short', (e) => { e.words = [['a', 0]] }, 'director_envelope_bad_word'],
    ['word tuple extra field', (e) => { e.words = [['a', 0, 9, 9]] }, 'director_envelope_bad_word'],
    ['word text not a string', (e) => { e.words = [[7, 0, 9]] }, 'director_envelope_bad_word'],
    ['word startCs NaN', (e) => { e.words = [['a', NaN, 9]] }, 'director_envelope_bad_word'],
    ['word startCs float', (e) => { e.words = [['a', 1.5, 9]] }, 'director_envelope_bad_word'],
    ['word startCs Infinity', (e) => { e.words = [['a', Infinity, 9]] }, 'director_envelope_bad_word'],
    ['word startCs above 30-minute cap', (e) => { e.words = [['a', MAX_TIME_CS + 1, 9]] }, 'director_envelope_bad_word'],
    ['word confPct non-integer', (e) => { e.words = [['a', 0, 99.5]] }, 'director_envelope_bad_word'],
    ['word confPct above 100', (e) => { e.words = [['a', 0, 101]] }, 'director_envelope_bad_word'],
    ['candidates not an array', (e) => { e.candidates = 'nope' }, 'director_envelope_bad_candidate'],
    ['candidate tuple too short', (e) => { e.candidates = [[0, -1, -1]] }, 'director_envelope_bad_candidate'],
    ['candidate tuple extra field', (e) => { e.candidates = [[0, -1, -1, [], 'x']] }, 'director_envelope_bad_candidate'],
    ['candidate kind out of range', (e) => { e.candidates = [[9, -1, -1, []]] }, 'director_envelope_bad_candidate'],
    ['candidate prevIdx below -1', (e) => { e.candidates = [[0, -2, -1, []]] }, 'director_envelope_bad_candidate'],
    ['candidate refs not an array', (e) => { e.candidates = [[0, -1, -1, 'w1']] }, 'director_envelope_bad_candidate'],
    ['candidate refs out of range', (e) => { e.candidates = [[0, -1, -1, [99]]] }, 'director_envelope_bad_candidate'],
    ['candidate refs descending', (e) => { e.candidates = [[0, -1, -1, [1, 0]]] }, 'director_envelope_bad_candidate'],
    ['candidate refs duplicate', (e) => { e.candidates = [[0, -1, -1, [1, 1]]] }, 'director_envelope_bad_candidate'],
    ['boundaries not an array', (e) => { e.boundaries = null }, 'director_envelope_bad_boundary'],
    ['boundary tuple shape', (e) => { e.boundaries = [[1, 0]] }, 'director_envelope_bad_boundary'],
    ['boundary REVERSED (start > end)', (e) => { e.boundaries = [[1, 1, 0]] }, 'director_envelope_bad_boundary'],
    ['boundary word out of range', (e) => { e.boundaries = [[1, 0, 42]] }, 'director_envelope_bad_boundary'],
    ['too many words', (e) => { e.words = new Array(MAX_WORDS + 1).fill(['a', 0, 9]) }, 'director_input_too_many_words'],
    ['too many candidates', (e) => { e.candidates = new Array(MAX_CANDIDATES + 1).fill([0, -1, -1, []]) }, 'director_input_too_many_candidates'],
    ['too many boundaries', (e) => { e.boundaries = new Array(MAX_BOUNDARIES + 1).fill([1, 0, 0]) }, 'director_input_too_many_boundaries'],
    ['oversized script', (e) => { e.script = { pad: 'a'.repeat(70000) } }, 'director_script_too_large'],
    ['oversized summaries', (e) => { e.summaries = { pad: 'a'.repeat(20000) } }, 'director_summaries_too_large'],
    ['unsupported value in summaries (function)', (e) => { e.summaries = { f: () => 1 } }, 'director_envelope_unserializable'],
  ]
  for (const [name, mutate, code] of cases) {
    it(`${name} => ${code}`, () => {
      const e = baseEnvelope() as unknown as Record<string, unknown>
      mutate(e)
      expectCode(e, code)
    })
  }

  it('CYCLIC script fails with a stable code, not a raw RangeError', () => {
    const e = baseEnvelope() as unknown as Record<string, unknown>
    const cyc: Record<string, unknown> = {}
    cyc.self = cyc
    e.script = cyc
    expectCode(e, 'director_envelope_unserializable')
  })

  it('a minimal legal envelope passes and round-trips', () => {
    const env = baseEnvelope()
    expect(() => validateDirectorEnvelope(JSON.parse(JSON.stringify(env)))).not.toThrow()
  })

  it('projection rejects malformed / out-of-range / non-positional word ids', () => {
    const words = [{ id: 'w0', text: 'a', startMs: 0, confidence: 0.9 }]
    const bad = [
      { words: [{ ...words[0], id: 'x0' }], candidates: [], boundaries: [] },
      { words, candidates: [{ id: 'c0', kind: 'filler', wordIds: ['w9'], prevWordId: null, nextWordId: null }], boundaries: [] },
      { words, candidates: [{ id: 'c0', kind: 'mystery', wordIds: [], prevWordId: null, nextWordId: null }], boundaries: [] },
    ]
    for (const s of bad) {
      let err: unknown
      try { projectSpeechToEnvelope(s as never) } catch (x) { err = x }
      expect(err).toBeInstanceOf(DirectorEnvelopeError)
      expect((err as DirectorEnvelopeError).code).toBe('director_projection_bad_ref')
    }
  })
})

function baseEnvelope(): DirectorEnvelope {
  const HEX64 = 'f'.repeat(64)
  const UUID0 = '00000000-0000-0000-0000-000000000000'
  return {
    schemaVersion: 1,
    pipelineEpoch: PIPELINE_EPOCH_V2,
    bundle: { version: 'director-1', provider: 'google', model: 'gemini-3.5-flash', promptSha256: HEX64, schemaSha256: HEX64, configSha256: HEX64 },
    identity: {
      projectId: UUID0, generationId: UUID0, sourceAssetId: UUID0, sourceChecksum: HEX64,
      bootManifestSha: HEX64, scriptSnapshotSha: HEX64,
      componentVersions: { inspection: 'inspection-1', speech: 'speech-6' },
      componentDigests: { visual: HEX64, audio: HEX64, hook: HEX64 },
    },
    script: { schemaVersion: 1, generationId: UUID0, hook: null, scenes: [] },
    summaries: {},
    words: [['hello', 0, 99], ['world', 10, 87]],
    candidates: [[0, -1, 1, []], [1, 0, -1, [1]]],
    boundaries: [[1, 0, 1]],
  }
}
