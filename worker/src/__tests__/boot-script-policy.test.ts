// Boot script-snapshot POLICY (Constitution §5.1) — executed, not just compiled.
// resolveBootScriptSnapshot is injectable (readState/readRow), so the full marker ×
// origin × binding matrix runs without a live DB. This proves Boot NEVER pins the live
// generation for a new-era source and fails closed on every contradiction/drift.
import { describe, it, expect } from 'vitest'
import { resolveBootScriptSnapshot, type BootSnapshotDeps, type SourceProvenanceState } from '../jobs/bootScriptPolicy.js'
import { buildScriptSnapshot, buildNoCapturedScriptSnapshot } from '../jobs/editorManifest.js'

const gen = {
  id: 'g1', selected_hook: 'col hook',
  scene_timeline: { hook: 'Hook', scenes: [{ scene_number: 1, scene_type: 'talking_head', dialogue: 'Hello', show_in_teleprompter: true }] },
}
const good = buildScriptSnapshot(gen)
const OWNER = 'o1', GENID = 'g1', SRC = 'src1'

function deps(state: Partial<SourceProvenanceState>, row: BootSnapshotDeps['readRow'] extends (a: string) => Promise<infer R> ? R : never = null): BootSnapshotDeps {
  return {
    readState: async () => ({ marker: null, assetOwner: OWNER, assetGeneration: GENID, origin: null, intentScriptSha: null, ...state }),
    readRow: async () => row,
  }
}
async function code(p: Promise<unknown>): Promise<string | undefined> {
  try { await p; return undefined } catch (e) { return (e as { code?: string }).code }
}

describe('resolveBootScriptSnapshot: one explicit marker/origin policy', () => {
  it('marker NULL (true legacy) → documented live-generation fallback', async () => {
    const r = await resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ marker: null }))
    expect(r.snapshotSha).toBe(good.snapshotSha) // == live buildScriptSnapshot
  })
  it('marker not 1 → source_marker_unsupported (fail closed)', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ marker: 2, origin: 'teleprompter' })))).toBe('source_marker_unsupported')
  })
  it('marker=1 + upload → no-captured-script form (no row, no live generation)', async () => {
    const r = await resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ marker: 1, origin: 'upload' }))
    expect(r.snapshotSha).toBe(buildNoCapturedScriptSnapshot(GENID).snapshotSha)
    expect(r.snapshot).toEqual({ schemaVersion: 1, capturedScript: false, generationId: GENID })
  })
  it('marker=1 + no intent → source_state_contradiction', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ marker: 1, origin: null })))).toBe('source_state_contradiction')
  })
  it('marker=1 + unknown origin → source_state_contradiction', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ marker: 1, origin: 'weird' })))).toBe('source_state_contradiction')
  })

  const teleState = { marker: 1, origin: 'teleprompter', intentScriptSha: good.snapshotSha }
  const goodRow = { snapshot: good.snapshot, snapshotSha: good.snapshotSha, ownerId: OWNER, generationId: GENID }

  it('marker=1 + teleprompter + valid binding → re-verified source-bound snapshot', async () => {
    const r = await resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps(teleState, goodRow))
    expect(r.snapshotSha).toBe(good.snapshotSha)
  })
  it('marker=1 + teleprompter + missing binding → script_binding_missing', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps(teleState, null)))).toBe('script_binding_missing')
  })
  it('marker=1 + teleprompter + linkage mismatch → script_binding_linkage', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps(teleState, { ...goodRow, ownerId: 'someone-else' })))).toBe('script_binding_linkage')
  })
  it('marker=1 + teleprompter + content/SHA drift → script_binding_drift', async () => {
    const tampered = JSON.parse(JSON.stringify(good.snapshot)); tampered.scenes[0].dialogue = 'Goodbye'
    // stored sha still the old one → recomputed content sha differs
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps(teleState, { ...goodRow, snapshot: tampered })))).toBe('script_binding_drift')
  })
  it('marker=1 + teleprompter + intent SHA mismatch → script_binding_intent_mismatch', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ ...teleState, intentScriptSha: 'f'.repeat(64) }, goodRow)))).toBe('script_binding_intent_mismatch')
  })
  it('marker=1 + teleprompter + corrupt binding shape → script_binding_shape', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps(teleState, { ...goodRow, snapshot: { evil: 1 } })))).toBe('script_binding_shape')
  })
})
