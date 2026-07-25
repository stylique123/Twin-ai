// Boot script-snapshot POLICY (Constitution §5.1) — executed, not just compiled.
// resolveBootScriptSnapshot is injectable (readState/readRow), so the full linkage ×
// marker × origin × binding matrix runs without a live DB. Proves Boot enforces
// asset+intent linkage BEFORE any branch, NEVER pins the live generation for a new-era
// source, treats marker-null as legacy ONLY with no new-era rows, and fails closed on
// every contradiction/drift.
import { describe, it, expect } from 'vitest'
import { resolveBootScriptSnapshot, type BootSnapshotDeps, type SourceProvenanceState } from '../jobs/bootScriptPolicy.js'
import { buildScriptSnapshot, buildNoCapturedScriptSnapshot } from '../jobs/editorManifest.js'

const gen = {
  id: 'g1', selected_hook: 'col hook',
  scene_timeline: { hook: 'Hook', scenes: [{ scene_number: 1, scene_type: 'talking_head', dialogue: 'Hello', show_in_teleprompter: true }] },
}
const good = buildScriptSnapshot(gen)
const OWNER = 'o1', GENID = 'g1', SRC = 'src1'
type Row = { snapshot: unknown; snapshotSha: string; ownerId: string; generationId: string } | null

// Fully-linked, marked, teleprompter defaults; override per case.
function state(over: Partial<SourceProvenanceState>): SourceProvenanceState {
  return {
    marker: 1, assetOwner: OWNER, assetGeneration: GENID,
    origin: 'teleprompter', intentOwner: OWNER, intentGeneration: GENID, intentSource: SRC,
    intentScriptSha: good.snapshotSha, hasManifest: true, hasBinding: true, ...over,
  }
}
function deps(over: Partial<SourceProvenanceState>, row: Row = null): BootSnapshotDeps {
  return { readState: async () => state(over), readRow: async () => row }
}
async function code(p: Promise<unknown>): Promise<string | undefined> {
  try { await p; return undefined } catch (e) { return (e as { code?: string }).code }
}
const goodRow: Row = { snapshot: good.snapshot, snapshotSha: good.snapshotSha, ownerId: OWNER, generationId: GENID }

describe('resolveBootScriptSnapshot: asset+intent linkage enforced first', () => {
  it('wrong asset owner → source_state_contradiction', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ assetOwner: 'x' }, goodRow)))).toBe('source_state_contradiction')
  })
  it('wrong asset generation → source_state_contradiction', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ assetGeneration: 'gX' }, goodRow)))).toBe('source_state_contradiction')
  })
  it('wrong intent owner → source_state_contradiction', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ intentOwner: 'x' }, goodRow)))).toBe('source_state_contradiction')
  })
  it('wrong intent generation → source_state_contradiction', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ intentGeneration: 'gX' }, goodRow)))).toBe('source_state_contradiction')
  })
  it('wrong intent source_asset_id → source_state_contradiction', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ intentSource: 'other' }, goodRow)))).toBe('source_state_contradiction')
  })
})

describe('resolveBootScriptSnapshot: legacy (marker NULL) is real only with no new-era rows', () => {
  it('marker NULL + no new-era rows → live-generation fallback', async () => {
    const r = await resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ marker: null, origin: null, hasManifest: false, hasBinding: false }))
    expect(r.snapshotSha).toBe(good.snapshotSha)
  })
  it('marker NULL + intent → source_state_contradiction (no live fallback)', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ marker: null, origin: 'teleprompter', hasManifest: false, hasBinding: false })))).toBe('source_state_contradiction')
  })
  it('marker NULL + manifest → source_state_contradiction', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ marker: null, origin: null, hasManifest: true, hasBinding: false })))).toBe('source_state_contradiction')
  })
  it('marker NULL + binding → source_state_contradiction', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ marker: null, origin: null, hasManifest: false, hasBinding: true })))).toBe('source_state_contradiction')
  })
})

describe('resolveBootScriptSnapshot: marker/origin branches', () => {
  it('marker not 1 → source_marker_unsupported', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ marker: 2 })))).toBe('source_marker_unsupported')
  })
  it('marker=1 + NO manifest → capture_manifest_required (before origin branching)', async () => {
    // enforced for BOTH origins, before we look at origin
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ hasManifest: false, origin: 'teleprompter' }, goodRow)))).toBe('capture_manifest_required')
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ hasManifest: false, origin: 'upload', hasBinding: false })))).toBe('capture_manifest_required')
  })
  it('marker=1 + no intent → source_state_contradiction', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ origin: null, intentOwner: null, intentGeneration: null, intentSource: null })))).toBe('source_state_contradiction')
  })
  it('marker=1 + upload → no-captured-script form (no live generation)', async () => {
    const r = await resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ origin: 'upload', hasBinding: false }))
    expect(r.snapshotSha).toBe(buildNoCapturedScriptSnapshot(GENID).snapshotSha)
    expect(r.snapshot).toEqual({ schemaVersion: 1, capturedScript: false, generationId: GENID })
  })
  it('marker=1 + upload + binding present → source_state_contradiction', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ origin: 'upload', hasBinding: true })))).toBe('source_state_contradiction')
  })
  it('marker=1 + unknown origin → source_state_contradiction', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ origin: 'weird' })))).toBe('source_state_contradiction')
  })
})

describe('resolveBootScriptSnapshot: teleprompter binding verification', () => {
  it('valid binding → re-verified source-bound snapshot', async () => {
    const r = await resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({}, goodRow))
    expect(r.snapshotSha).toBe(good.snapshotSha)
  })
  it('missing binding → script_binding_missing', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({}, null)))).toBe('script_binding_missing')
  })
  it('linkage mismatch → script_binding_linkage', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({}, { ...goodRow!, ownerId: 'x' })))).toBe('script_binding_linkage')
  })
  it('content/SHA drift → script_binding_drift', async () => {
    const tampered = JSON.parse(JSON.stringify(good.snapshot)); tampered.scenes[0].dialogue = 'Goodbye'
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({}, { ...goodRow!, snapshot: tampered })))).toBe('script_binding_drift')
  })
  it('intent SHA mismatch → script_binding_intent_mismatch', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({ intentScriptSha: 'f'.repeat(64) }, goodRow)))).toBe('script_binding_intent_mismatch')
  })
  it('corrupt binding shape → script_binding_shape', async () => {
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({}, { ...goodRow!, snapshot: { evil: 1 } })))).toBe('script_binding_shape')
  })
  it('wrong generationId inside the bound snapshot → script_binding_shape', async () => {
    const wrongGen = JSON.parse(JSON.stringify(good.snapshot)); wrongGen.generationId = 'gX'
    expect(await code(resolveBootScriptSnapshot(SRC, GENID, OWNER, gen, deps({}, { ...goodRow!, snapshot: wrongGen })))).toBe('script_binding_shape')
  })
})
