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
  DIRECTOR_DECISION_SCHEMA_VERSION, DECISION_PACING, DECISION_MUSIC, DECISION_HOOK,
  MAX_EMPHASIS_WORDS, MAX_VISUAL_WASTE, MAX_ZOOM_REQUESTS, VISUAL_WASTE_CLASSES,
  MAX_DECISION_OUTPUT_BYTES, DIRECTOR_MAX_OUTPUT_TOKENS, DIRECTOR_THINKING_BUDGET_TOKENS,
  MAX_DECISION_KEPT_BOUNDARIES, MAX_DECISION_SELECTIONS, MAX_DECISION_SUMMARY_CHARS,
  directorResponseSchema as sharedResponseSchema,
  type DirectorEnvelope as SharedEnvelope,
} from '../../../packages/shared/src/editor/director'
import {
  CAPTION_PRESET_IDS as SHARED_CAPTIONS, TRANSITION_POLICIES as SHARED_TRANSITIONS,
  ZOOM_INTENSITIES as SHARED_ZOOM_I, ZOOM_REASON_CODES as SHARED_ZOOM_R,
} from '../../../packages/shared/src/editor/catalogs'

process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
const { RESPONSE_SCHEMA } = await import('../jobs/directorProvider')

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
    const raw = { selections: [0, 2], summary: 'x' }
    const s = sharedValidateDecision(raw, small)
    const w = W.validateDirectorDecision(raw, small as unknown as W.DirectorEnvelope)
    expect(JSON.stringify(w)).toBe(JSON.stringify(s))
    // filler rejected the same way in both
    const badFiller = { selections: [1] }
    const sc = (() => { try { sharedValidateDecision(badFiller, small); return 'ok' } catch (e) { return (e as { code: string }).code } })()
    const wc = (() => { try { W.validateDirectorDecision(badFiller, small as unknown as W.DirectorEnvelope); return 'ok' } catch (e) { return (e as { code: string }).code } })()
    expect(wc).toBe(sc)
    expect(wc).toBe('director_decision_filler')
    // fabricated ref rejected the same way
    const badRef = { selections: [99] }
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
    const raw = { selections: [0], pacing: 'punchy', music: 'subtle', emphasisWordIndices: [0, 1] }
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
    // hook: keep by default; open_at_word must name a real word past the first; fabricated rejected
    expect(def.hookTreatment).toBe('keep'); expect(def.hookStartWordIndex).toBe(null)
    const openHook = { selections: [], hookTreatment: 'open_at_word', hookStartWordIndex: 1 }
    const wh = W.validateDirectorDecision(openHook, small as unknown as W.DirectorEnvelope)
    expect(JSON.stringify(wh)).toBe(JSON.stringify(sharedValidateDecision(openHook, small)))
    expect(wh.hookTreatment).toBe('open_at_word'); expect(wh.hookStartWordIndex).toBe(1)
    for (const bad of [
      { selections: [], hookTreatment: 'rewrite' },                              // bad enum
      { selections: [], hookTreatment: 'open_at_word' },                         // missing index
      { selections: [], hookTreatment: 'open_at_word', hookStartWordIndex: 0 },  // index 0 (can't drop nothing)
      { selections: [], hookTreatment: 'open_at_word', hookStartWordIndex: 9 },  // fabricated (out of range)
    ]) {
      expect(code(() => W.validateDirectorDecision(bad, small as unknown as W.DirectorEnvelope))).toBe('director_decision_bad_hook')
      expect(code(() => sharedValidateDecision(bad, small))).toBe('director_decision_bad_hook')
    }
  })

  it('Decision v2 constants + catalogs match the shared authority (full set)', () => {
    expect(W.DIRECTOR_DECISION_SCHEMA_VERSION).toBe(DIRECTOR_DECISION_SCHEMA_VERSION)
    expect([...W.DECISION_PACING]).toEqual([...DECISION_PACING])
    expect([...W.DECISION_MUSIC]).toEqual([...DECISION_MUSIC])
    expect([...W.DECISION_HOOK]).toEqual([...DECISION_HOOK])
    expect(W.MAX_EMPHASIS_WORDS).toBe(MAX_EMPHASIS_WORDS)
    expect(W.MAX_VISUAL_WASTE).toBe(MAX_VISUAL_WASTE)
    expect(W.MAX_ZOOM_REQUESTS).toBe(MAX_ZOOM_REQUESTS)
    expect([...W.VISUAL_WASTE_CLASSES]).toEqual([...VISUAL_WASTE_CLASSES])
    expect([...W.CAPTION_PRESET_IDS]).toEqual([...SHARED_CAPTIONS])
    expect([...W.TRANSITION_POLICIES]).toEqual([...SHARED_TRANSITIONS])
    expect([...W.ZOOM_INTENSITIES]).toEqual([...SHARED_ZOOM_I])
    expect([...W.ZOOM_REASON_CODES]).toEqual([...SHARED_ZOOM_R])
    expect(W.MAX_DECISION_KEPT_BOUNDARIES).toBe(MAX_DECISION_KEPT_BOUNDARIES)
    expect(W.MAX_DECISION_OUTPUT_BYTES).toBe(MAX_DECISION_OUTPUT_BYTES)
    expect(W.DIRECTOR_MAX_OUTPUT_TOKENS).toBe(DIRECTOR_MAX_OUTPUT_TOKENS)
    expect(W.DIRECTOR_THINKING_BUDGET_TOKENS).toBe(DIRECTOR_THINKING_BUDGET_TOKENS)
  })

  it('directorResponseSchema() is byte-identical across the copies', () => {
    expect(JSON.stringify(W.directorResponseSchema())).toBe(JSON.stringify(sharedResponseSchema()))
  })

  it("the provider's Gemini RESPONSE_SCHEMA is the SAME schema, dialect-normalized", () => {
    // Normalize the Gemini uppercase dialect to the lowercase JSON-schema dialect:
    // lowercase `type`, drop `format:'enum'` (pure Gemini marker). Anything else that
    // differs is real drift — the audit-trail schemaSha256 must attest what is SENT.
    const norm = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(norm)
      if (v && typeof v === 'object') {
        const out: Record<string, unknown> = {}
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          if (k === 'format' && val === 'enum') continue
          out[k] = k === 'type' && typeof val === 'string' ? val.toLowerCase() : norm(val)
        }
        return out
      }
      return v
    }
    expect(JSON.stringify(norm(RESPONSE_SCHEMA))).toBe(JSON.stringify(sharedResponseSchema()))
  })

  it('OUTPUT budget: an UPPER BOUND on any Decision v2 response fits under maxOutputTokens - thinking', () => {
    // Recompute the worst-case response bytes from the frozen caps.
    //
    // What this proves, precisely: the object built below is an UPPER BOUND, not itself
    // a legal decision — the index generator repeats values (4901 selections drawn from
    // 3901 distinct indices), which validateDirectorDecision rejects as duplicates. That
    // is deliberate: relaxing legality can only make the encoding LONGER (every element
    // is already the widest 4-digit form and every optional array is at its cap), so a
    // bound proven here holds for every decision that IS legal.
    //
    // Nothing enforces MAX_DECISION_OUTPUT_BYTES at runtime — it is a budget-sizing
    // constant, and this test is its only enforcement. Its job is to fail the build if a
    // future field or a raised cap pushes the worst case past the provider's usable
    // output budget (maxOutputTokens - thinking), where the model would be truncated
    // mid-JSON instead of returning a decision.
    //
    // `summary` is capped in JS string LENGTH (UTF-16 units), NOT bytes — so an ascii
    // summary is NOT the worst case and must never be used as the bound. Both real
    // amplifiers are exercised: multi-byte UTF-8 (an ordinary non-English summary) and
    // JSON escaping of control characters (\uXXXX = 6 B each, the true maximum).
    const build = (summary: string) => JSON.stringify({
      schemaVersion: DIRECTOR_DECISION_SCHEMA_VERSION,
      // widest indices: every value 4 digits so each element costs the maximum
      selections: Array.from({ length: MAX_DECISION_SELECTIONS }, (_, i) => 1000 + (i % 3901)),
      keptBoundaries: Array.from({ length: MAX_DECISION_KEPT_BOUNDARIES }, () => 9522),
      summary,
      pacing: 'balanced', music: 'energetic',
      emphasisWordIndices: Array.from({ length: MAX_EMPHASIS_WORDS }, () => 16948),
      hookTreatment: 'open_at_word', hookStartWordIndex: 16948,
      visualWasteSelections: Array.from({ length: MAX_VISUAL_WASTE }, (_, i) => i),
      captionPresetId: 'caption-minimal-subtitle-v1', transitionPolicy: 'hard_cuts_only',
      zoomRequests: Array.from({ length: MAX_ZOOM_REQUESTS }, () => ({ anchorWordIndex: 16948, intensity: 'medium', reasonCode: 'retention_beat' })),
    })
    const summaries = [
      'a'.repeat(MAX_DECISION_SUMMARY_CHARS),            // ascii            (~31,330 B)
      '中'.repeat(MAX_DECISION_SUMMARY_CHARS),       // BMP 3-byte / CJK (~35,330 B)
      '\u{1F600}'.repeat(MAX_DECISION_SUMMARY_CHARS / 2), // astral 4-byte   (~33,330 B)
      ''.repeat(MAX_DECISION_SUMMARY_CHARS),       // control escape   (~41,330 B) <- TRUE worst
    ]
    const worstBytes = Math.max(...summaries.map((s) => new TextEncoder().encode(build(s)).length))
    // The ascii-only estimate must NOT be mistaken for the bound (regression guard).
    const asciiBytes = new TextEncoder().encode(build(summaries[0])).length
    expect(worstBytes).toBeGreaterThan(asciiBytes)
    expect(worstBytes).toBeLessThanOrEqual(MAX_DECISION_OUTPUT_BYTES)
    expect(MAX_DECISION_OUTPUT_BYTES).toBeLessThanOrEqual(DIRECTOR_MAX_OUTPUT_TOKENS - DIRECTOR_THINKING_BUDGET_TOKENS)
  })

  it('Decision v2 full choice set re-resolves identically in both copies', () => {
    const base = buildMaxUpstreamCompatFixture() as unknown as SharedEnvelope
    const small: SharedEnvelope = { ...base, words: [['a', 0, 90], ['b', 10, 90]], candidates: [], boundaries: [],
      visualWaste: [[0, 5, 0, 1], [10, 20, 1, 0]] }
    const raw = {
      selections: [], visualWasteSelections: [0],
      captionPresetId: 'caption-punchy-word-v1', transitionPolicy: 'restrained',
      zoomRequests: [{ anchorWordIndex: 1, intensity: 'medium', reasonCode: 'retention_beat' }],
    }
    const w = W.validateDirectorDecision(raw, small as unknown as W.DirectorEnvelope)
    expect(JSON.stringify(w)).toBe(JSON.stringify(sharedValidateDecision(raw, small)))
    expect(w.visualWasteSelections).toEqual([{ wasteIndex: 0, classCode: 0, startCs: 0, endCs: 5 }])
    const code2 = (fn: () => unknown): string => { try { fn(); return 'NONE' } catch (e) { return (e as { code: string }).code } }
    for (const [bad, expected] of [
      [{ selections: [], visualWasteSelections: [1] }, 'director_decision_not_selectable'],
      [{ selections: [], captionPresetId: 'neon' }, 'director_decision_bad_caption'],
      [{ selections: [], transitionPolicy: 'wipe' }, 'director_decision_bad_transition'],
      [{ selections: [], zoomRequests: [{ anchorWordIndex: 9 }] }, 'director_decision_bad_zoom'],
    ] as const) {
      expect(code2(() => W.validateDirectorDecision(bad, small as unknown as W.DirectorEnvelope))).toBe(expected)
      expect(code2(() => sharedValidateDecision(bad, small))).toBe(expected)
    }
  })
})
