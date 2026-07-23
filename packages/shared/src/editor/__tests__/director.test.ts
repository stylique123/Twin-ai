import { describe, expect, it } from 'vitest'
import {
  buildMaxLegalSpeechComponent, buildMaxUpstreamCompatFixture, projectSpeechToEnvelope,
  serializeDirectorEnvelope, envelopeByteLength, conservativeTokenBound,
  validateDirectorEnvelope, DirectorEnvelopeError, canonicalJson, utf8ByteLength,
  UPSTREAM_SPEECH_BUDGET_BYTES, MIN_COMPACT_WORD_BYTES, MIN_COMPACT_CANDIDATE_BYTES,
  MIN_COMPACT_BOUNDARY_BYTES, MAX_WORDS, MAX_CANDIDATES, MAX_BOUNDARIES, MAX_TIME_CS,
  DIRECTOR_INPUT_MAX_BYTES, EXPECTED_MAX_COMPAT_ENVELOPE_BYTES, PROVIDER_TOKEN_CEILING,
  PROVIDER_CONTEXT_TOKENS, ANALYTIC_MAX_UPSTREAM_ENVELOPE_BYTES, IDENTITY_BUNDLE_MAX_BYTES,
  PIPELINE_EPOCH_V2, SPEECH_CANDIDATE_KINDS, CANDIDATE_CONFIDENCE_CODES, SILENCE_CLASS_CODES,
  kindSelectionEnabled, validateDirectorDecision, DirectorDecisionError,
  directorResponseSchema, DIRECTOR_DECISION_SCHEMA_VERSION, MAX_DECISION_SUMMARY_CHARS,
  type DirectorEnvelope,
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
  it('feature safety: filler is NEVER selectable; every other kind is', () => {
    expect(kindSelectionEnabled('filler')).toBe(0)
    expect(kindSelectionEnabled('silence')).toBe(1)
    expect(kindSelectionEnabled('false_start')).toBe(1)
    expect(kindSelectionEnabled('repetition')).toBe(1)
  })
})

// ===========================================================================
// GATE 0 — the enriched candidate tuple is DECISION-SUFFICIENT: two pure-
// silence candidates ([]-refs) with different spans/classes must project to
// DIFFERENT tuples. (The old [k,prev,next,refs] tuple made them identical.)
// ===========================================================================
describe('Gate 0: enriched candidate tuple preserves silence decision info', () => {
  it('two []-ref silence candidates with different spans/classes differ', () => {
    const words = [
      { id: 'w0', text: 'a', startMs: 0, confidence: 0.9 },
      { id: 'w1', text: 'b', startMs: 20000, confidence: 0.9 },
      { id: 'w2', text: 'c', startMs: 60000, confidence: 0.9 },
    ]
    const candidates = [
      { id: 'c0', kind: 'silence', wordIds: [] as string[], prevWordId: 'w0', nextWordId: 'w1',
        startMs: 3000, endMs: 8000, confidence: 'medium', evidence: { class: 'removable' } },
      { id: 'c1', kind: 'silence', wordIds: [] as string[], prevWordId: 'w1', nextWordId: 'w2',
        startMs: 30000, endMs: 55000, confidence: 'high', evidence: { class: 'dead_air' } },
    ]
    const proj = projectSpeechToEnvelope({ words, candidates, boundaries: [] })
    const [a, b] = proj.candidates
    // Both are silence, both []-refs, yet fully distinguishable:
    expect(a[6]).toEqual([]) // refs
    expect(b[6]).toEqual([])
    expect(a).not.toEqual(b)
    // c0: [silence, 300cs, 800cs, medium, removable, sel=1, []]
    expect(a).toEqual([0, 300, 800, CANDIDATE_CONFIDENCE_CODES.indexOf('medium'), SILENCE_CLASS_CODES.indexOf('removable'), 1, []])
    // c1: [silence, 3000cs, 5500cs, high, dead_air, sel=1, []]
    expect(b).toEqual([0, 3000, 5500, CANDIDATE_CONFIDENCE_CODES.indexOf('high'), SILENCE_CLASS_CODES.indexOf('dead_air'), 1, []])
  })

  it('a filler candidate projects to selectionEnabled=0 (auto filler removal off)', () => {
    const words = [{ id: 'w0', text: 'um', startMs: 0, confidence: 0.4 }]
    const proj = projectSpeechToEnvelope({
      words,
      candidates: [{ id: 'c0', kind: 'filler', wordIds: ['w0'], prevWordId: null, nextWordId: null,
        startMs: 0, endMs: 100, confidence: 'low', evidence: {} }],
      boundaries: [],
    })
    expect(proj.candidates[0][0]).toBe(SPEECH_CANDIDATE_KINDS.indexOf('filler'))
    expect(proj.candidates[0][5]).toBe(0) // selectionEnabled MUST be 0 for filler
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
    expect(comp.serializedBytes).toBeGreaterThanOrEqual(UPSTREAM_SPEECH_BUDGET_BYTES * 0.99)
  })

  it('serializes to the EXACT frozen byte count (no approximation)', () => {
    expect(bytes).toBe(EXPECTED_MAX_COMPAT_ENVELOPE_BYTES)
    expect(new TextEncoder().encode(serializeDirectorEnvelope(env)).length).toBe(EXPECTED_MAX_COMPAT_ENVELOPE_BYTES)
  })

  it('exercises SELECTABLE non-filler candidates (selection semantics)', () => {
    // The fixture uses `repetition` (selectable), not filler — so it actually
    // tests the shipped selection path.
    for (const c of env.candidates) {
      expect(c[0]).toBe(SPEECH_CANDIDATE_KINDS.indexOf('repetition'))
      expect(c[5]).toBe(1)
      expect(c[4]).toBe(0) // non-silence => class none
    }
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

  it('projection is DECISION-SUFFICIENT: positional ids + full ref runs kept', () => {
    const proj = projectSpeechToEnvelope(comp)
    expect(proj.words.length).toBe(comp.words.length)
    for (let i = 0; i < comp.candidates.length; i++) {
      const c = comp.candidates[i]
      const t = proj.candidates[i]
      expect(t[6].length).toBe(c.wordIds.length) // full ref run preserved
      expect(t[1]).toBe(Math.round(c.startMs / 10)) // span carried directly
      expect(t[2]).toBe(Math.round(c.endMs / 10))
    }
  })
})

// ===========================================================================
// GATE 0 — the STRICT canonical serializer refuses to coerce.
// ===========================================================================
describe('Gate 0: strict canonicalJson', () => {
  it('throws on non-finite numbers, undefined, and non-plain objects', () => {
    expect(() => canonicalJson(NaN)).toThrow()
    expect(() => canonicalJson(Infinity)).toThrow()
    expect(() => canonicalJson(-Infinity)).toThrow()
    expect(() => canonicalJson({ a: NaN })).toThrow()
    expect(() => canonicalJson([undefined])).toThrow()
    expect(() => canonicalJson({ a: undefined })).toThrow()
    expect(() => canonicalJson(new Date(0))).toThrow()
    expect(() => canonicalJson({ d: new Date(0) })).toThrow()
    expect(() => canonicalJson(new (class { x = 1 })())).toThrow()
  })
  it('serializes plain values with sorted keys', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
    expect(canonicalJson([1, 'x', true, null])).toBe('[1,"x",true,null]')
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
    ['bundle version not director-1', (e) => { (e.bundle as Record<string, unknown>).version = 'director-2' }, 'director_envelope_bad_bundle'],
    ['bundle version padded (vvvv...) rejected', (e) => { (e.bundle as Record<string, unknown>).version = 'v'.repeat(64) }, 'director_envelope_bad_bundle'],
    ['bundle provider not google', (e) => { (e.bundle as Record<string, unknown>).provider = 'openai' }, 'director_envelope_bad_bundle'],
    ['bundle model not gemini-3.5-flash', (e) => { (e.bundle as Record<string, unknown>).model = 'gpt' }, 'director_envelope_bad_bundle'],
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
    ['word starts NOT nondecreasing', (e) => { e.words = [['a', 10, 9], ['b', 5, 9]] }, 'director_envelope_bad_word'],
    ['candidates not an array', (e) => { e.candidates = 'nope' }, 'director_envelope_bad_candidate'],
    ['candidate tuple too short (old 4-tuple)', (e) => { e.candidates = [[0, -1, -1, []]] }, 'director_envelope_bad_candidate'],
    ['candidate tuple extra field', (e) => { e.candidates = [[3, 0, 0, 1, 0, 1, [], 9]] }, 'director_envelope_bad_candidate'],
    ['candidate kind out of range', (e) => { e.candidates = [[9, 0, 0, 1, 0, 1, []]] }, 'director_envelope_bad_candidate'],
    ['candidate startCs > endCs', (e) => { e.candidates = [[3, 100, 0, 1, 0, 1, []]] }, 'director_envelope_bad_candidate'],
    ['candidate startCs above cap', (e) => { e.candidates = [[3, MAX_TIME_CS + 1, MAX_TIME_CS + 1, 1, 0, 1, []]] }, 'director_envelope_bad_candidate'],
    ['candidate confidenceCode out of range', (e) => { e.candidates = [[3, 0, 0, 9, 0, 1, []]] }, 'director_envelope_bad_candidate'],
    ['candidate silenceClass out of range', (e) => { e.candidates = [[0, 0, 0, 1, 9, 1, []]] }, 'director_envelope_bad_candidate'],
    ['silence with class none', (e) => { e.candidates = [[0, 0, 0, 1, 0, 1, []]] }, 'director_envelope_bad_candidate'],
    ['non-silence with a silence class', (e) => { e.candidates = [[3, 0, 0, 1, 2, 1, []]] }, 'director_envelope_bad_candidate'],
    ['selectionEnabled out of range', (e) => { e.candidates = [[3, 0, 0, 1, 0, 2, []]] }, 'director_envelope_bad_candidate'],
    ['FILLER marked selection-enabled', (e) => { e.candidates = [[1, 0, 0, 1, 0, 1, []]] }, 'director_envelope_filler_selectable'],
    ['candidate refs not an array', (e) => { e.candidates = [[3, 0, 0, 1, 0, 1, 'w1']] }, 'director_envelope_bad_candidate'],
    ['candidate refs out of range', (e) => { e.candidates = [[3, 0, 0, 1, 0, 1, [99]]] }, 'director_envelope_bad_candidate'],
    ['candidate refs descending', (e) => { e.candidates = [[3, 0, 0, 1, 0, 1, [1, 0]]] }, 'director_envelope_bad_candidate'],
    ['candidate refs duplicate', (e) => { e.candidates = [[3, 0, 0, 1, 0, 1, [1, 1]]] }, 'director_envelope_bad_candidate'],
    ['boundaries not an array', (e) => { e.boundaries = null }, 'director_envelope_bad_boundary'],
    ['boundary tuple shape', (e) => { e.boundaries = [[1, 0]] }, 'director_envelope_bad_boundary'],
    ['boundary REVERSED (start > end)', (e) => { e.boundaries = [[1, 1, 0]] }, 'director_envelope_bad_boundary'],
    ['boundary word out of range', (e) => { e.boundaries = [[1, 0, 42]] }, 'director_envelope_bad_boundary'],
    ['too many words', (e) => { e.words = new Array(MAX_WORDS + 1).fill(['a', 0, 9]) }, 'director_input_too_many_words'],
    ['too many candidates', (e) => { e.candidates = new Array(MAX_CANDIDATES + 1).fill([3, 0, 0, 1, 0, 1, []]) }, 'director_input_too_many_candidates'],
    ['too many boundaries', (e) => { e.boundaries = new Array(MAX_BOUNDARIES + 1).fill([1, 0, 0]) }, 'director_input_too_many_boundaries'],
    ['oversized script', (e) => { e.script = { pad: 'a'.repeat(70000) } }, 'director_script_too_large'],
    ['oversized summaries', (e) => { e.summaries = { pad: 'a'.repeat(20000) } }, 'director_summaries_too_large'],
    ['unsupported value in summaries (function)', (e) => { e.summaries = { f: () => 1 } }, 'director_envelope_unserializable'],
    ['NaN in summaries', (e) => { e.summaries = { x: NaN } }, 'director_envelope_unserializable'],
    ['Infinity in script', (e) => { e.script = { x: Infinity } }, 'director_envelope_unserializable'],
    ['Date instance in summaries', (e) => { e.summaries = { d: new Date(0) } }, 'director_envelope_unserializable'],
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
})

// ===========================================================================
// GATE 0 — projection REJECTS (never clamps/coerces) malformed component input.
// ===========================================================================
describe('Gate 0: projection rejects malformed input', () => {
  const okWords = [
    { id: 'w0', text: 'a', startMs: 0, confidence: 0.9 },
    { id: 'w1', text: 'b', startMs: 20, confidence: 0.8 },
  ]
  const okCand = { id: 'c0', kind: 'repetition', wordIds: ['w0', 'w1'], prevWordId: null, nextWordId: null, startMs: 0, endMs: 10, confidence: 'medium', evidence: {} }
  const okBound = { id: 'u0', kind: 'asr_segment', startWordId: 'w0', endWordId: 'w1' }
  const expectReject = (speech: unknown) => {
    let err: unknown
    try { projectSpeechToEnvelope(speech as never) } catch (x) { err = x }
    expect(err).toBeInstanceOf(DirectorEnvelopeError)
    expect((err as DirectorEnvelopeError).code).toBe('director_projection_bad_ref')
  }
  const cases: Array<[string, unknown]> = [
    ['non-positional word id', { words: [{ ...okWords[0], id: 'x0' }], candidates: [], boundaries: [] }],
    ['word non-finite startMs', { words: [{ ...okWords[0], startMs: NaN }], candidates: [], boundaries: [] }],
    ['word startMs beyond cap', { words: [{ ...okWords[0], startMs: 2_000_000 }], candidates: [], boundaries: [] }],
    ['word confidence out of [0,1]', { words: [{ ...okWords[0], confidence: 1.5 }], candidates: [], boundaries: [] }],
    ['non-positional candidate id', { words: okWords, candidates: [{ ...okCand, id: 'c9' }], boundaries: [] }],
    ['unknown candidate kind', { words: okWords, candidates: [{ ...okCand, kind: 'mystery' }], boundaries: [] }],
    ['candidate span reversed', { words: okWords, candidates: [{ ...okCand, startMs: 100, endMs: 0 }], boundaries: [] }],
    ['candidate invalid confidence', { words: okWords, candidates: [{ ...okCand, confidence: 'bogus' }], boundaries: [] }],
    ['candidate ref out of range', { words: okWords, candidates: [{ ...okCand, wordIds: ['w9'] }], boundaries: [] }],
    ['silence missing class', { words: okWords, candidates: [{ id: 'c0', kind: 'silence', wordIds: [], prevWordId: null, nextWordId: null, startMs: 0, endMs: 10, confidence: 'low', evidence: {} }], boundaries: [] }],
    ['silence invalid class', { words: okWords, candidates: [{ id: 'c0', kind: 'silence', wordIds: [], prevWordId: null, nextWordId: null, startMs: 0, endMs: 10, confidence: 'low', evidence: { class: 'bogus' } }], boundaries: [] }],
    ['non-positional boundary id', { words: okWords, candidates: [], boundaries: [{ ...okBound, id: 'u9' }] }],
    ['boundary reversed', { words: okWords, candidates: [], boundaries: [{ ...okBound, startWordId: 'w1', endWordId: 'w0' }] }],
  ]
  for (const [name, speech] of cases) {
    it(`rejects: ${name}`, () => expectReject(speech))
  }
})

// ===========================================================================
// GATE-7 — Director DECISION contract: re-resolve against the pinned envelope,
// reject fabricated ids / non-selectable / filler / raw-timestamp authority.
// ===========================================================================
describe('Phase 7: validateDirectorDecision (server-side re-resolution)', () => {
  // envelope with candidates: 0=silence(removable,selectable), 1=filler(sel=0), 2=repetition(selectable)
  function env(): DirectorEnvelope {
    const e = baseEnvelope()
    e.words = [['a', 0, 90], ['b', 10, 90], ['c', 20, 90]]
    e.candidates = [
      [0, 30, 80, 1, 2, 1, []],            // silence removable, selectable
      [1, 0, 5, 0, 0, 0, [0]],             // filler, NOT selectable
      [3, 0, 10, 1, 0, 1, [1, 2]],         // repetition, selectable
    ]
    e.boundaries = [[1, 0, 1], [1, 1, 2]]
    return e
  }
  const expectCode = (raw: unknown, code: string) => {
    let err: unknown
    try { validateDirectorDecision(raw, env()) } catch (e) { err = e }
    expect(err).toBeInstanceOf(DirectorDecisionError)
    expect((err as DirectorDecisionError).code).toBe(code)
  }

  it('re-resolves selectable candidates and copies span/kind FROM the envelope', () => {
    const d = validateDirectorDecision({
      selections: [{ candidateIndex: 0 }, { candidateIndex: 2, reason: 'stutter' }],
      keptBoundaries: [0], summary: 'trim dead air + a repeat',
    }, env())
    expect(d.schemaVersion).toBe(DIRECTOR_DECISION_SCHEMA_VERSION)
    expect(d.selections[0]).toEqual({ candidateIndex: 0, kind: 'silence', selectionEnabled: 1, startCs: 30, endCs: 80 })
    expect(d.selections[1]).toEqual({ candidateIndex: 2, kind: 'repetition', selectionEnabled: 1, startCs: 0, endCs: 10 })
    expect(d.keptBoundaries).toEqual([0])
  })

  it('IGNORES model-supplied timestamps/ids (uses envelope authority)', () => {
    const d = validateDirectorDecision({
      selections: [{ candidateIndex: 0, startCs: 999999, endCs: 0, id: 'evil', kind: 'filler' } as never],
      summary: '',
    }, env())
    // span comes from the envelope (30,80), NOT the model's 999999/0
    expect(d.selections[0].startCs).toBe(30)
    expect(d.selections[0].endCs).toBe(80)
    expect(d.selections[0].kind).toBe('silence')
  })

  const cases: Array<[string, unknown, string]> = [
    ['not an object', 42, 'director_decision_not_object'],
    ['selections missing', { summary: 'x' }, 'director_decision_bad_selections'],
    ['fabricated candidateIndex', { selections: [{ candidateIndex: 99 }] }, 'director_decision_bad_ref'],
    ['negative candidateIndex', { selections: [{ candidateIndex: -1 }] }, 'director_decision_bad_ref'],
    ['non-integer candidateIndex', { selections: [{ candidateIndex: 1.5 }] }, 'director_decision_bad_ref'],
    ['selecting a FILLER candidate', { selections: [{ candidateIndex: 1 }] }, 'director_decision_filler'],
    ['duplicate selection', { selections: [{ candidateIndex: 0 }, { candidateIndex: 0 }] }, 'director_decision_duplicate'],
    ['keptBoundaries out of range', { selections: [], keptBoundaries: [9] }, 'director_decision_bad_boundary'],
    ['summary too long', { selections: [], summary: 'a'.repeat(MAX_DECISION_SUMMARY_CHARS + 1) }, 'director_decision_bad_summary'],
    ['reason too long', { selections: [{ candidateIndex: 0, reason: 'a'.repeat(600) }] }, 'director_decision_bad_summary'],
  ]
  for (const [name, raw, code] of cases) it(`${name} => ${code}`, () => expectCode(raw, code))

  it('response schema is a well-formed object schema requiring selections', () => {
    const s = directorResponseSchema() as { type: string; required: string[] }
    expect(s.type).toBe('object')
    expect(s.required).toContain('selections')
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
    // word starts nondecreasing (0 <= 10)
    words: [['hello', 0, 99], ['world', 10, 87]],
    // c0: silence [removable] []-refs, selectable; c1: repetition, ref [1]
    candidates: [
      [0, 0, 100, CANDIDATE_CONFIDENCE_CODES.indexOf('medium'), SILENCE_CLASS_CODES.indexOf('removable'), 1, []],
      [3, 0, 10, CANDIDATE_CONFIDENCE_CODES.indexOf('medium'), 0, 1, [1]],
    ],
    boundaries: [[1, 0, 1]],
  }
}
