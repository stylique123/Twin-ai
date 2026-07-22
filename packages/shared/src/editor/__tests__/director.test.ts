import { describe, expect, it } from 'vitest'
import {
  buildMaxLegalEnvelope, envelopeByteLength, conservativeTokenBound, serializeDirectorEnvelope,
  validateDirectorEnvelope, wordTextSerializedBytes, DirectorEnvelopeError,
  DIRECTOR_INPUT_MAX_BYTES, EXPECTED_MAX_ENVELOPE_BYTES, PROVIDER_TOKEN_CEILING,
  PROVIDER_CONTEXT_TOKENS, MAX_WORDS, MAX_WORD_TEXT_SERIALIZED_BYTES, MAX_CANDIDATES,
  MAX_WORD_REFS_PER_CANDIDATE, MAX_BOUNDARIES, MAX_TIME_CS, PIPELINE_EPOCH_V2,
  type DirectorEnvelope,
} from '../director'

// ===========================================================================
// GATE 0 — the envelope must FIT ONE inference for the worst-case 30-minute
// source with mathematical certainty, before any migration/RPC/provider work.
// ===========================================================================
describe('Gate 0: maximum-legal 30-minute envelope', () => {
  const env = buildMaxLegalEnvelope()
  const bytes = envelopeByteLength(env)

  it('is the largest legal envelope: every sub-cap saturated', () => {
    expect(env.words.length).toBe(MAX_WORDS)
    expect(env.candidates.length).toBe(MAX_CANDIDATES)
    expect(env.boundaries.length).toBe(MAX_BOUNDARIES)
    expect(env.candidates[0][1].length).toBe(MAX_WORD_REFS_PER_CANDIDATE)
    // every word text is EXACTLY at the escaped-serialized cap
    for (const w of env.words) expect(wordTextSerializedBytes(w[0])).toBe(MAX_WORD_TEXT_SERIALIZED_BYTES)
    // worst-case escaping is exercised: the max token contains backslashes that
    // each serialize to two bytes.
    expect(env.words[0][0]).toContain('\\')
    // and it still validates as legal input.
    expect(() => validateDirectorEnvelope(env)).not.toThrow()
  })

  it('serializes to the EXACT frozen byte count (no approximation)', () => {
    expect(bytes).toBe(EXPECTED_MAX_ENVELOPE_BYTES)
    // recompute from the raw serializer output, independently.
    expect(new TextEncoder().encode(serializeDirectorEnvelope(env)).length).toBe(EXPECTED_MAX_ENVELOPE_BYTES)
  })

  it('fits the byte cap with >= 20% headroom', () => {
    expect(bytes).toBeLessThanOrEqual(DIRECTOR_INPUT_MAX_BYTES)
    expect(DIRECTOR_INPUT_MAX_BYTES / bytes).toBeGreaterThanOrEqual(1.2)
  })

  it('rigorous conservative token bound < 80% of provider context', () => {
    // A provider token spans >= 1 UTF-8 byte, so tokens <= serialized bytes.
    const tokenUpperBound = conservativeTokenBound(env)
    expect(tokenUpperBound).toBe(bytes)
    expect(tokenUpperBound).toBeLessThanOrEqual(PROVIDER_TOKEN_CEILING) // 80% of context
    // and the byte cap itself sits under the ceiling, so ANY envelope that
    // passes the byte cap has tokens < 80% context — a single-check guarantee.
    expect(DIRECTOR_INPUT_MAX_BYTES).toBeLessThanOrEqual(PROVIDER_TOKEN_CEILING)
    expect(PROVIDER_TOKEN_CEILING).toBe(Math.floor(PROVIDER_CONTEXT_TOKENS * 0.8))
  })
})

describe('Gate 0: word-text bound is escaped-serialized-byte enforceable', () => {
  it('measures the ESCAPED serialized contribution, not raw length', () => {
    expect(wordTextSerializedBytes('a')).toBe(1)
    expect(wordTextSerializedBytes('\\')).toBe(2) // backslash escapes to two bytes
    expect(wordTextSerializedBytes('"')).toBe(2) // quote escapes to two bytes
    expect(wordTextSerializedBytes('é')).toBe(2) // é = 2 UTF-8 bytes
    expect(wordTextSerializedBytes('中')).toBe(3) // CJK = 3 UTF-8 bytes
  })

  it('rejects a word whose escaped text exceeds the cap (fail closed)', () => {
    const env = baseEnvelope()
    env.words = [['\\'.repeat(MAX_WORD_TEXT_SERIALIZED_BYTES), 0, 0.9]] // 2 bytes each -> over cap
    expect(() => validateDirectorEnvelope(env)).toThrow(DirectorEnvelopeError)
    try { validateDirectorEnvelope(env) } catch (e) {
      expect((e as DirectorEnvelopeError).code).toBe('director_word_text_too_long')
    }
  })
})

describe('Gate 0: sub-cap validators fail closed', () => {
  const cases: Array<[string, (e: DirectorEnvelope) => void, string]> = [
    ['too many words', (e) => { e.words = new Array(MAX_WORDS + 1).fill(['a', 0, 0.9]) }, 'director_input_too_many_words'],
    ['too many candidates', (e) => { e.candidates = new Array(MAX_CANDIDATES + 1).fill([0, [0]]) }, 'director_input_too_many_candidates'],
    ['too many boundaries', (e) => { e.boundaries = new Array(MAX_BOUNDARIES + 1).fill([0, 0, 0]) }, 'director_input_too_many_boundaries'],
    ['too many refs', (e) => { e.words = [['a', 0, 0.9]]; e.candidates = [[0, new Array(MAX_WORD_REFS_PER_CANDIDATE + 1).fill(0)]] }, 'director_input_too_many_refs'],
    ['candidate ref out of range', (e) => { e.words = [['a', 0, 0.9]]; e.candidates = [[0, [5]]] }, 'director_envelope_invalid'],
    ['boundary ref out of range', (e) => { e.words = [['a', 0, 0.9]]; e.boundaries = [[0, 0, 9]] }, 'director_envelope_invalid'],
    ['startCs out of range', (e) => { e.words = [['a', MAX_TIME_CS + 1, 0.9]] }, 'director_envelope_invalid'],
    ['confidence out of range', (e) => { e.words = [['a', 0, 1.5]] }, 'director_envelope_invalid'],
    ['bad epoch', (e) => { e.pipelineEpoch = 1 }, 'director_envelope_epoch_mismatch'],
  ]
  for (const [name, mutate, code] of cases) {
    it(name + ' => ' + code, () => {
      const e = baseEnvelope()
      mutate(e)
      let err: unknown
      try { validateDirectorEnvelope(e) } catch (x) { err = x }
      expect(err).toBeInstanceOf(DirectorEnvelopeError)
      expect((err as DirectorEnvelopeError).code).toBe(code)
    })
  }

  it('a minimal legal envelope passes', () => {
    expect(() => validateDirectorEnvelope(baseEnvelope())).not.toThrow()
  })
})

// A small legal envelope with the correct identity shape.
function baseEnvelope(): DirectorEnvelope {
  const HEX64 = 'f'.repeat(64)
  return {
    schemaVersion: 1,
    pipelineEpoch: PIPELINE_EPOCH_V2,
    bundle: { version: 'director-1', provider: 'google', model: 'gemini-3.5-flash', promptSha256: HEX64, schemaSha256: HEX64, configSha256: HEX64 },
    identity: {
      projectId: 'p', generationId: 'g', sourceAssetId: 's', sourceChecksum: HEX64,
      bootManifestSha: HEX64, scriptSnapshotSha: HEX64,
      componentVersions: { inspection: 'inspection-1', speech: 'speech-6' },
      componentDigests: { visual: HEX64, audio: HEX64, hook: HEX64 },
    },
    script: { schemaVersion: 1, generationId: 'g', hook: null, scenes: [] },
    summaries: {},
    words: [['hello', 0, 0.99]],
    candidates: [[0, [0]]],
    boundaries: [[1, 0, 0]],
  }
}
