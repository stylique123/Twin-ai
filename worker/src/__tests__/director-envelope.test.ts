// GATE 0 (worker side): re-derives the Director bounds from THE WORKER'S OWN
// compact Phase-5 emission shapes and runs the identical max-compat fixture
// assertion, importing the single-authority shared module directly (test files
// are excluded from the worker tsc build, so this cross-package import never
// affects the Docker runtime). This guards that the shared caps stay exactly
// floor(budget / structural-minimum) of the shapes editorSpeech.ts actually
// emits — the same integers, no drift.
import { describe, expect, it } from 'vitest'
import {
  buildMaxLegalSpeechComponent, buildMaxUpstreamCompatFixture, envelopeByteLength,
  conservativeTokenBound, validateDirectorEnvelope,
  UPSTREAM_SPEECH_BUDGET_BYTES, MIN_COMPACT_WORD_BYTES, MIN_COMPACT_CANDIDATE_BYTES,
  MIN_COMPACT_BOUNDARY_BYTES, MAX_WORDS, MAX_CANDIDATES, MAX_BOUNDARIES,
  DIRECTOR_INPUT_MAX_BYTES, EXPECTED_MAX_COMPAT_ENVELOPE_BYTES, PROVIDER_TOKEN_CEILING,
} from '../../../packages/shared/src/editor/director'

const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v), 'utf8')

describe('Gate 0 (worker): derived caps match the compact emission shapes', () => {
  it('structural minima re-derived from the literal compact shapes', () => {
    // Mirrors editorSpeech.ts compaction: leanWords {id,text,startMs,endMs,
    // confidence}; candidates keep the full field set; leanBoundaries drop
    // only `text`. Every real emission only ADDS bytes to these skeletons.
    // +1 = the array comma separator.
    const minWord = { confidence: 0, endMs: 0, id: 'w0', startMs: 0, text: '' }
    const minCand = {
      confidence: 'low', endMs: 0, evidence: {}, evidenceCodes: [], id: 'c0', kind: 'filler',
      nextWordId: null, prevWordId: null, ruleVersion: 'speech-rules-3', safeToConsider: true,
      startMs: 0, wordIds: [],
    }
    const minBound = { endMs: 0, endWordId: 'w0', evidence: [], id: 'u0', kind: 'asr_segment', startMs: 0, startWordId: 'w0' }
    expect(bytes(minWord) + 1).toBe(MIN_COMPACT_WORD_BYTES)
    expect(bytes(minCand) + 1).toBe(MIN_COMPACT_CANDIDATE_BYTES)
    expect(bytes(minBound) + 1).toBe(MIN_COMPACT_BOUNDARY_BYTES)
    expect(MAX_WORDS).toBe(Math.floor(UPSTREAM_SPEECH_BUDGET_BYTES / MIN_COMPACT_WORD_BYTES))
    expect(MAX_CANDIDATES).toBe(Math.floor(UPSTREAM_SPEECH_BUDGET_BYTES / MIN_COMPACT_CANDIDATE_BYTES))
    expect(MAX_BOUNDARIES).toBe(Math.floor(UPSTREAM_SPEECH_BUDGET_BYTES / MIN_COMPACT_BOUNDARY_BYTES))
  })
})

describe('Gate 0 (worker): max upstream-compatible envelope fits one inference', () => {
  const comp = buildMaxLegalSpeechComponent()
  const env = buildMaxUpstreamCompatFixture()
  const b = envelopeByteLength(env)

  it('source component is legal (within the Phase-5 budget)', () => {
    expect(comp.serializedBytes).toBeLessThanOrEqual(UPSTREAM_SPEECH_BUDGET_BYTES)
  })
  it('serializes to the EXACT frozen byte count and validates', () => {
    expect(b).toBe(EXPECTED_MAX_COMPAT_ENVELOPE_BYTES)
    expect(() => validateDirectorEnvelope(JSON.parse(JSON.stringify(env)))).not.toThrow()
  })
  it('fits the byte cap with >= 20% headroom', () => {
    expect(b).toBeLessThanOrEqual(DIRECTOR_INPUT_MAX_BYTES)
    expect(DIRECTOR_INPUT_MAX_BYTES / b).toBeGreaterThanOrEqual(1.2)
  })
  it('conservative token bound (tokens <= bytes) < 80% of provider context', () => {
    expect(conservativeTokenBound(env)).toBe(b)
    expect(b).toBeLessThanOrEqual(PROVIDER_TOKEN_CEILING)
    expect(DIRECTOR_INPUT_MAX_BYTES).toBeLessThanOrEqual(PROVIDER_TOKEN_CEILING)
  })
})
