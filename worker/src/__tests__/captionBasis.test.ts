// A TITLE IS A PROMISE — enforced at the boundary, not requested in a prompt.
//
// Every fixture is a REAL title from the 2026-08-11 scan, with the basis the
// live extractor actually returned for it.
import { describe, expect, it } from 'vitest'

// ⚖️ Env first, THEN the module. `voice.ts` reaches `env.ts` through `gemini.ts`,
// which throws on a missing SUPABASE_URL at import time — and a static import
// hoists above any beforeAll, so the stub would arrive too late to help.
process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
process.env.GEMINI_API_KEY ||= 'stub-key'
const { clampCaptionBasis } = await import('../voice.js')

/** VERBATIM from the run. Nathan's declarative headlines came back `stated`;
 *  the same model returned `demonstrated` for all 22 of Johnny's. */
const AS_RETURNED = [
  { kind: 'opinion', text: 'Siri is ACTUALLY Good Now', basis: 'stated', times_seen: '1', confidence: '1', source_video: '' },
  { kind: 'opinion', text: 'Tesla Self-Driving is Better Than You Think', basis: 'stated', times_seen: '1', confidence: '1', source_video: '' },
  { kind: 'covered', text: 'Fitbit Air vs WHOOP after 50 days', basis: 'demonstrated', times_seen: '1', confidence: '1', source_video: '' },
] as never[]

describe('the extractor rounds a headline up, and the boundary rounds it back', () => {
  it('demotes every stated caption item to demonstrated', () => {
    const out = clampCaptionBasis(AS_RETURNED)
    expect(out.map((i) => i.basis)).toEqual(['demonstrated', 'demonstrated', 'demonstrated'])
  })

  it('changes nothing else about the item', () => {
    // The clamp must not become a general-purpose rewriter. Text, kind and
    // counts are the model's job and stay untouched.
    const out = clampCaptionBasis(AS_RETURNED)
    expect(out[0].text).toBe('Siri is ACTUALLY Good Now')
    expect(out[0].kind).toBe('opinion')
    expect(out[2]).toBe(AS_RETURNED[2])   // already correct → same object, no churn
  })

  it('an already-correct batch passes through untouched', () => {
    // Johnny's real result: 22 of 22 correct. The clamp must be a no-op there.
    const johnny = [
      { kind: 'product', text: 'Samsung Z Fold 8', basis: 'demonstrated' },
      { kind: 'covered', text: "the phone Google doesn't want you to buy", basis: 'demonstrated' },
    ] as never[]
    expect(clampCaptionBasis(johnny)).toEqual(johnny)
  })

  it('an absent or junk basis becomes demonstrated, never stated', () => {
    // Missing must not fall through as a stronger claim than we hold.
    const out = clampCaptionBasis([
      { kind: 'topic', text: 'x' },
      { kind: 'topic', text: 'y', basis: 'inferred' },
    ] as never[])
    expect(out.map((i) => i.basis)).toEqual(['demonstrated', 'demonstrated'])
  })
})
