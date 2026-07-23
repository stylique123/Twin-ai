// Phase 7 — deterministic cancellation-window tests for the Director call
// driver. Uses the injectable `driveDirectorCall` seam (fake ledger + fake
// provider), so all four windows are exercised with NO live DB or network.
// Proves: at most ONE provider call, the conservative ledger outcome per
// window, no decision persisted after cancellation (except after-persist), and
// that the driver NEVER advances a stage (it throws DirectorCancelledError,
// which the outer loop turns into a cancelled settle).
import { describe, expect, it } from 'vitest'

// The Director stage imports db/env at module load — stub the required env so
// the dynamic import succeeds (no live connection is ever made in these tests).
process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'

const HEX64 = 'a'.repeat(64)
// minimal valid envelope: one selectable repetition candidate.
const ENVELOPE = {
  schemaVersion: 1, pipelineEpoch: 2,
  bundle: { version: 'director-1', provider: 'google', model: 'gemini-3.5-flash', promptSha256: 'f'.repeat(64), schemaSha256: 'f'.repeat(64), configSha256: 'f'.repeat(64) },
  identity: {
    projectId: '00000000-0000-0000-0000-000000000000', generationId: '00000000-0000-0000-0000-000000000000',
    sourceAssetId: '00000000-0000-0000-0000-000000000000', sourceChecksum: 'f'.repeat(64), bootManifestSha: 'f'.repeat(64), scriptSnapshotSha: 'f'.repeat(64),
    componentVersions: { inspection: 'i', speech: 's' }, componentDigests: { visual: 'f'.repeat(64), audio: 'f'.repeat(64), hook: 'f'.repeat(64) },
  },
  script: {}, summaries: {},
  words: [['a', 0, 90], ['b', 10, 90]],
  candidates: [[3, 0, 1, 1, 0, 1, [0]]],
  boundaries: [],
}
const GOOD_RESPONSE = { raw: { selections: [{ candidateIndex: 0 }] }, responseText: '{"selections":[{"candidateIndex":0}]}' }

function fakeLedger(begin = 'started') {
  const calls = []
  return {
    calls,
    ledger: {
      async begin() { calls.push('begin'); return begin },
      async receive(h) { calls.push(`receive:${h.slice(0, 4)}`) },
      async succeed() { calls.push('succeed') },
      async fail(code) { calls.push(`fail:${code}`) },
      async markUnknown(reason) { calls.push(`markUnknown:${reason}`) },
      async event(code) { calls.push(`event:${code}`) },
      async priorSelections() { return 3 },
    },
  }
}

describe('Phase 7: Director cancellation windows (driveDirectorCall)', () => {
  it('(a) before dispatch: no provider call, fail-clean, no decision', async () => {
    const { driveDirectorCall } = await import('../jobs/editorDirector.js')
    const { DirectorCancelledError } = await import('../jobs/editorCancel.js')
    const { calls, ledger } = fakeLedger()
    let providerCalls = 0
    const ctrl = new AbortController()
    let err
    try {
      await driveDirectorCall({
        ledger, envelope: ENVELOPE, envelopeSha256: HEX64, signal: ctrl.signal,
        cancelled: () => true, // cancelled from the start
        callProvider: async () => { providerCalls++; return GOOD_RESPONSE },
      })
    } catch (e) { err = e }
    expect(err).toBeInstanceOf(DirectorCancelledError)
    expect(providerCalls).toBe(0) // NEVER called the provider
    expect(calls).toContain('fail:cancelled_before_call')
    expect(calls).not.toContain('succeed')
    expect(calls).not.toContain('markUnknown:cancelled_after_response')
  })

  it('(b) in-flight: exactly one call, mark UNKNOWN (charge uncertain), no decision', async () => {
    const { driveDirectorCall } = await import('../jobs/editorDirector.js')
    const { DirectorCancelledError } = await import('../jobs/editorCancel.js')
    const { DirectorProviderError } = await import('../jobs/directorProvider.js')
    const { calls, ledger } = fakeLedger()
    let providerCalls = 0
    let err
    try {
      await driveDirectorCall({
        ledger, envelope: ENVELOPE, envelopeSha256: HEX64, signal: new AbortController().signal,
        cancelled: () => false,
        callProvider: async () => { providerCalls++; throw new DirectorProviderError('cancelled in-flight', 'director_cancelled') },
      })
    } catch (e) { err = e }
    expect(err).toBeInstanceOf(DirectorCancelledError)
    expect(providerCalls).toBe(1)
    expect(calls).toContain('markUnknown:cancelled_in_flight')
    expect(calls).not.toContain('succeed')
    expect(calls.filter((c) => c === 'begin')).toHaveLength(1)
  })

  it('(c) after response, before persist: one call, mark UNKNOWN, no decision', async () => {
    const { driveDirectorCall } = await import('../jobs/editorDirector.js')
    const { DirectorCancelledError } = await import('../jobs/editorCancel.js')
    const { calls, ledger } = fakeLedger()
    let providerCalls = 0
    let cancelAfterResponse = false
    let err
    try {
      await driveDirectorCall({
        ledger, envelope: ENVELOPE, envelopeSha256: HEX64, signal: new AbortController().signal,
        cancelled: () => cancelAfterResponse, // false pre-call, true after receive
        callProvider: async () => { providerCalls++; cancelAfterResponse = true; return GOOD_RESPONSE },
      })
    } catch (e) { err = e }
    expect(err).toBeInstanceOf(DirectorCancelledError)
    expect(providerCalls).toBe(1)
    expect(calls.some((c) => c.startsWith('receive:'))).toBe(true)
    expect(calls).toContain('markUnknown:cancelled_after_response')
    expect(calls).not.toContain('succeed')
  })

  it('(d) happy path / after persist: one call, decision persisted (immutable evidence)', async () => {
    const { driveDirectorCall } = await import('../jobs/editorDirector.js')
    const { calls, ledger } = fakeLedger()
    let providerCalls = 0
    const out = await driveDirectorCall({
      ledger, envelope: ENVELOPE, envelopeSha256: HEX64, signal: new AbortController().signal,
      cancelled: () => false,
      callProvider: async () => { providerCalls++; return GOOD_RESPONSE },
    })
    expect(providerCalls).toBe(1)
    expect(out.reused).toBe(false)
    expect(out.selections).toBe(1)
    expect(calls).toContain('succeed')
    expect(calls).not.toContain('markUnknown:cancelled_after_response')
    // exactly one begin, one receive, one succeed — no second provider call.
    expect(calls.filter((c) => c === 'begin')).toHaveLength(1)
  })

  it('already_succeeded resume: no provider call, reuse the persisted decision', async () => {
    const { driveDirectorCall } = await import('../jobs/editorDirector.js')
    const { ledger } = fakeLedger('already_succeeded')
    let providerCalls = 0
    const out = await driveDirectorCall({
      ledger, envelope: ENVELOPE, envelopeSha256: HEX64, signal: new AbortController().signal,
      cancelled: () => false,
      callProvider: async () => { providerCalls++; return GOOD_RESPONSE },
    })
    expect(providerCalls).toBe(0)
    expect(out.reused).toBe(true)
    expect(out.selections).toBe(3)
  })

  it('indeterminate resume: no provider call, permanent fail (never a second call)', async () => {
    const { driveDirectorCall } = await import('../jobs/editorDirector.js')
    const { PermanentJobError } = await import('../errors.js')
    const { ledger } = fakeLedger('indeterminate')
    let providerCalls = 0
    let err
    try {
      await driveDirectorCall({
        ledger, envelope: ENVELOPE, envelopeSha256: HEX64, signal: new AbortController().signal,
        cancelled: () => false, callProvider: async () => { providerCalls++; return GOOD_RESPONSE },
      })
    } catch (e) { err = e }
    expect(err).toBeInstanceOf(PermanentJobError)
    expect((err as { code?: string }).code).toBe('director_call_indeterminate')
    expect(providerCalls).toBe(0)
  })
})
