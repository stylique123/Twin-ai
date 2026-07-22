// GATE 0 (worker side): the IDENTICAL max-envelope fixture assertion, importing
// the SINGLE-authority shared serializer directly (test files are excluded from
// the worker tsc build, so this cross-package import never affects the Docker
// runtime). This guards that the worker's view of the frozen envelope budget
// matches shared exactly — the same integers, no drift.
import { describe, expect, it } from 'vitest'
import {
  buildMaxLegalEnvelope, envelopeByteLength, conservativeTokenBound,
  validateDirectorEnvelope,
  DIRECTOR_INPUT_MAX_BYTES, EXPECTED_MAX_ENVELOPE_BYTES, PROVIDER_TOKEN_CEILING,
} from '../../../packages/shared/src/editor/director'

describe('Gate 0 (worker): max 30-minute envelope fits one inference', () => {
  const env = buildMaxLegalEnvelope()
  const bytes = envelopeByteLength(env)

  it('serializes to the EXACT frozen byte count', () => {
    expect(bytes).toBe(EXPECTED_MAX_ENVELOPE_BYTES)
    expect(() => validateDirectorEnvelope(env)).not.toThrow()
  })
  it('fits the byte cap with >= 20% headroom', () => {
    expect(bytes).toBeLessThanOrEqual(DIRECTOR_INPUT_MAX_BYTES)
    expect(DIRECTOR_INPUT_MAX_BYTES / bytes).toBeGreaterThanOrEqual(1.2)
  })
  it('conservative token bound (tokens <= bytes) < 80% of provider context', () => {
    expect(conservativeTokenBound(env)).toBe(bytes)
    expect(bytes).toBeLessThanOrEqual(PROVIDER_TOKEN_CEILING)
    expect(DIRECTOR_INPUT_MAX_BYTES).toBeLessThanOrEqual(PROVIDER_TOKEN_CEILING)
  })
})
