// GATE 7 (parity): the worker's RUNTIME Director contract duplicate
// (src/jobs/directorContract.ts) must be byte-for-byte identical to the shared
// authority (packages/shared/src/editor/director.ts). This __tests__ file is
// excluded from the worker tsc build, so importing the shared module here never
// reaches the Docker runtime — it exists ONLY to pin the two copies together.
import { describe, expect, it } from 'vitest'
import * as W from '../jobs/directorContract'
import {
  buildMaxLegalSpeechComponent, buildMaxUpstreamCompatFixture, projectSpeechToEnvelope as sharedProject,
  serializeDirectorEnvelope as sharedSerialize, validateDirectorEnvelope as sharedValidateEnv,
  validateDirectorDecision as sharedValidateDecision,
  DIRECTOR_MODEL, DIRECTOR_PROVIDER, DIRECTOR_VERSION, DIRECTOR_INPUT_MAX_BYTES,
  EXPECTED_MAX_COMPAT_ENVELOPE_BYTES, MAX_WORDS, MAX_CANDIDATES, MAX_BOUNDARIES,
  type DirectorEnvelope as SharedEnvelope,
} from '../../../packages/shared/src/editor/director'

describe('Gate 7: worker director contract == shared authority', () => {
  it('frozen constants match', () => {
    expect(W.DIRECTOR_MODEL).toBe(DIRECTOR_MODEL)
    expect(W.DIRECTOR_PROVIDER).toBe(DIRECTOR_PROVIDER)
    expect(W.DIRECTOR_VERSION).toBe(DIRECTOR_VERSION)
    expect(W.DIRECTOR_INPUT_MAX_BYTES).toBe(DIRECTOR_INPUT_MAX_BYTES)
    expect(W.MAX_WORDS).toBe(MAX_WORDS)
    expect(W.MAX_CANDIDATES).toBe(MAX_CANDIDATES)
    expect(W.MAX_BOUNDARIES).toBe(MAX_BOUNDARIES)
  })

  it('projection is identical on the max legal component', () => {
    const comp = buildMaxLegalSpeechComponent()
    const s = sharedProject(comp)
    const w = W.projectSpeechToEnvelope(comp)
    expect(JSON.stringify(w)).toBe(JSON.stringify(s))
  })

  it('serializer produces the exact frozen bytes and validates in both copies', () => {
    const env = buildMaxUpstreamCompatFixture()
    const sBytes = new TextEncoder().encode(sharedSerialize(env)).length
    const wBytes = new TextEncoder().encode(W.serializeDirectorEnvelope(env as unknown as W.DirectorEnvelope)).length
    expect(wBytes).toBe(sBytes)
    expect(wBytes).toBe(EXPECTED_MAX_COMPAT_ENVELOPE_BYTES)
    expect(() => sharedValidateEnv(JSON.parse(JSON.stringify(env)))).not.toThrow()
    expect(() => W.validateDirectorEnvelope(JSON.parse(JSON.stringify(env)))).not.toThrow()
  })

  it('decision re-resolution is identical (incl. filler + fabricated-ref rejection)', () => {
    // small envelope: 0=silence(selectable), 1=filler(sel0), 2=repetition(selectable)
    const env = buildMaxUpstreamCompatFixture() as unknown as SharedEnvelope
    const small: SharedEnvelope = {
      ...env,
      words: [['a', 0, 90], ['b', 10, 90]],
      candidates: [
        [0, 3, 8, 1, 2, 1, []],
        [1, 0, 1, 0, 0, 0, [0]],
        [3, 0, 1, 1, 0, 1, [1]],
      ],
      boundaries: [[1, 0, 1]],
    }
    const raw = { selections: [{ candidateIndex: 0 }, { candidateIndex: 2 }], summary: 'x' }
    const s = sharedValidateDecision(raw, small)
    const w = W.validateDirectorDecision(raw, small as unknown as W.DirectorEnvelope)
    expect(JSON.stringify(w)).toBe(JSON.stringify(s))
    // filler rejected the same way in both
    const badFiller = { selections: [{ candidateIndex: 1 }] }
    const sc = (() => { try { sharedValidateDecision(badFiller, small); return 'ok' } catch (e) { return (e as { code: string }).code } })()
    const wc = (() => { try { W.validateDirectorDecision(badFiller, small as unknown as W.DirectorEnvelope); return 'ok' } catch (e) { return (e as { code: string }).code } })()
    expect(wc).toBe(sc)
    expect(wc).toBe('director_decision_filler')
    // fabricated ref rejected the same way
    const badRef = { selections: [{ candidateIndex: 99 }] }
    const sr = (() => { try { sharedValidateDecision(badRef, small); return 'ok' } catch (e) { return (e as { code: string }).code } })()
    const wr = (() => { try { W.validateDirectorDecision(badRef, small as unknown as W.DirectorEnvelope); return 'ok' } catch (e) { return (e as { code: string }).code } })()
    expect(wr).toBe(sr)
    expect(wr).toBe('director_decision_bad_ref')
  })

  it('decision v2 creative choices re-resolve identically (pacing/music/emphasis + fabricated rejection)', () => {
    const env = buildMaxUpstreamCompatFixture() as unknown as SharedEnvelope
    const small: SharedEnvelope = {
      ...env, words: [['a', 0, 90], ['b', 10, 90]], candidates: [[0, 3, 8, 1, 2, 1, []]], boundaries: [[1, 0, 1]],
    }
    const code = (fn: () => unknown) => { try { fn(); return 'ok' } catch (e) { return (e as { code: string }).code } }
    // valid v2 decision resolves identically in both copies
    const raw = { selections: [{ candidateIndex: 0 }], pacing: 'punchy', music: 'subtle', emphasisWordIndices: [0, 1] }
    const s = sharedValidateDecision(raw, small)
    const w = W.validateDirectorDecision(raw, small as unknown as W.DirectorEnvelope)
    expect(JSON.stringify(w)).toBe(JSON.stringify(s))
    expect(w.pacing).toBe('punchy'); expect(w.music).toBe('subtle'); expect(w.emphasisWordIndices).toEqual([0, 1])
    // absent → safe defaults, never invented
    const def = W.validateDirectorDecision({ selections: [] }, small as unknown as W.DirectorEnvelope)
    expect(def.pacing).toBe('balanced'); expect(def.music).toBe('none'); expect(def.emphasisWordIndices).toEqual([])
    // bad enums / fabricated + duplicate emphasis → same stable codes in both copies
    for (const [bad, expected] of [
      [{ selections: [], pacing: 'chaotic' }, 'director_decision_bad_pacing'],
      [{ selections: [], music: 'lofi' }, 'director_decision_bad_music'],
      [{ selections: [], emphasisWordIndices: [2] }, 'director_decision_bad_emphasis'],
      [{ selections: [], emphasisWordIndices: [0, 0] }, 'director_decision_duplicate'],
    ] as const) {
      expect(code(() => W.validateDirectorDecision(bad, small as unknown as W.DirectorEnvelope))).toBe(expected)
      expect(code(() => sharedValidateDecision(bad, small))).toBe(expected)
    }
  })
})
