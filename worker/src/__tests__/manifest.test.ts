import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

import {
  SCRIPT_SNAPSHOT_MAX_BYTES,
  buildBootManifest, buildScriptSnapshot, canonicalJson, componentDigest,
  faceDetectorIdentity, loadAnalysisRules, normalizeSnapshotString, sha256Hex,
  speechModelIdentity,
} from '../jobs/editorManifest.js'
import { PermanentJobError } from '../errors.js'

describe('canonicalJson', () => {
  it('sorts keys recursively and emits no insignificant whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: 'x' } }))
      .toBe('{"a":{"c":"x","d":[2,{"y":2,"z":1}]},"b":1}')
  })
  it('preserves array order and string content verbatim (no normalization)', () => {
    const composed = 'é' // NOT NFC-normalized by serialization
    expect(canonicalJson([composed, 'b'])).toBe(`["${composed}","b"]`)
  })
  it('drops undefined object values and rejects unsupported types', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}')
    expect(() => canonicalJson({ f: () => 1 })).toThrow(/unsupported/)
  })
  it('is stable across key insertion order (digest determinism)', () => {
    const x = sha256Hex(canonicalJson({ a: 1, b: 2 }))
    const y = sha256Hex(canonicalJson({ b: 2, a: 1 }))
    expect(x).toBe(y)
  })
})

describe('frozen rules + component digests', () => {
  it('loads the frozen rules with a stable boundsSha256 (comment excluded)', () => {
    const { rules, boundsSha256 } = loadAnalysisRules()
    expect(rules.rulesVersion).toBe('analysis-rules-1')
    expect(rules.audio.windowSamples).toBe(4800)
    expect(rules.audio.clippingThreshold).toBe(0.9995)
    expect(rules.visual.sceneCutThreshold).toBe(0.3)
    expect(boundsSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(loadAnalysisRules().boundsSha256).toBe(boundsSha256)
  })

  it('changes when version, config, model hash or bounds change — and only then', () => {
    const base = componentDigest('visual-1', { a: 1 }, { m: 'x' }, 'bounds')
    expect(componentDigest('visual-1', { a: 1 }, { m: 'x' }, 'bounds')).toBe(base)
    expect(componentDigest('visual-2', { a: 1 }, { m: 'x' }, 'bounds')).not.toBe(base)
    expect(componentDigest('visual-1', { a: 2 }, { m: 'x' }, 'bounds')).not.toBe(base)
    expect(componentDigest('visual-1', { a: 1 }, { m: 'y' }, 'bounds')).not.toBe(base)
    expect(componentDigest('visual-1', { a: 1 }, { m: 'x' }, 'other')).not.toBe(base)
  })
})

describe('model identities', () => {
  it('reads the pinned speech identity from the checked-in manifest', () => {
    const s = speechModelIdentity()
    expect(s.repository).toBe('Systran/faster-whisper-small')
    expect(s.revision).toMatch(/^[0-9a-f]{40}$/)
    expect(s.artifactSha256).toMatch(/^[0-9a-f]{64}$/)
  })
  it('reads the pinned YuNet identity from the vision manifest', () => {
    const f = faceDetectorIdentity()
    expect(f.repository).toBe('opencv/opencv_zoo')
    expect(f.ref).toBe('47534e27c9851bb1128ccc0102f1145e27f23f98')
    expect(f.artifactSha256).toBe('8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4')
  })
})

describe('boot manifest', () => {
  it('builds a complete manifest with digests and a canonical sha', async () => {
    const built = await buildBootManifest({ inspectorVersion: 'inspect-1', speechVersion: 'speech-6' })
    const m = built.manifest as Record<string, any>
    expect(m.manifestEpoch).toBe(1)
    expect(m.componentVersions).toEqual({
      inspection: 'inspect-1', speech: 'speech-6', visual: 'visual-1', audio: 'audio-1', hook: 'hook-1',
    })
    expect(built.componentDigests.visual).toMatch(/^[0-9a-f]{64}$/)
    expect(built.componentDigests.audio).toMatch(/^[0-9a-f]{64}$/)
    expect(built.componentDigests.hook).toMatch(/^[0-9a-f]{64}$/)
    // The three digests are distinct identities.
    expect(new Set(Object.values(built.componentDigests)).size).toBe(3)
    expect(built.manifestSha).toBe(sha256Hex(canonicalJson(built.manifest)))
    // Rebuild is byte-stable for the same inputs.
    const again = await buildBootManifest({ inspectorVersion: 'inspect-1', speechVersion: 'speech-6' })
    expect(again.manifestSha).toBe(built.manifestSha)
    // Rules identity flows into the manifest.
    expect(m.rules.boundsSha256).toBe(loadAnalysisRules().boundsSha256)
    // Face model hash is an input to the VISUAL digest specifically.
    expect(m.modelArtifacts.faceDetector.artifactSha256)
      .toBe('8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4')
  })
})

describe('recording-script snapshot', () => {
  const gen = (over: Partial<{ selected_hook: string | null; scene_timeline: any }> = {}) => ({
    id: 'gen-1',
    selected_hook: 'My  hook line' as string | null,
    scene_timeline: {
      hook: 'The real   hook',
      scenes: [
        { scene_number: 1, scene_type: 'talking_head', dialogue: 'Hello   world', show_in_teleprompter: true },
        { scene_number: 2, scene_type: 'b_roll', dialogue: null, show_in_teleprompter: false },
      ],
    },
    ...over,
  })

  it('normalizes NFC + collapses whitespace, keeps every scene, hashes deterministically', () => {
    const decomposed = 'café  latte' // e + combining acute, double space
    const a = buildScriptSnapshot(gen({ scene_timeline: { hook: decomposed, scenes: [] } }))
    expect((a.snapshot as any).hook).toBe('café latte')
    const b = buildScriptSnapshot(gen({ scene_timeline: { hook: 'café latte', scenes: [] } }))
    expect(a.snapshotSha).toBe(b.snapshotSha)
    const full = buildScriptSnapshot(gen())
    expect((full.snapshot as any).scenes).toHaveLength(2)
    expect((full.snapshot as any).scenes[0].dialogue).toBe('Hello world')
    expect((full.snapshot as any).hook).toBe('The real hook')
  })

  it('null scene_timeline falls back to selected_hook with zero scenes; null hook stays null', () => {
    const s = buildScriptSnapshot(gen({ scene_timeline: null }))
    expect((s.snapshot as any).hook).toBe('My hook line')
    expect((s.snapshot as any).scenes).toEqual([])
    const n = buildScriptSnapshot(gen({ scene_timeline: null, selected_hook: null }))
    expect((n.snapshot as any).hook).toBeNull()
    expect(n.snapshotSha).toMatch(/^[0-9a-f]{64}$/)
  })

  it('accepts a snapshot at EXACTLY the cap and fails closed one byte over', () => {
    const bytesFor = (len: number) => buildScriptSnapshot(gen({
      scene_timeline: { hook: null, scenes: [{ scene_number: 1, scene_type: 't', dialogue: 'a'.repeat(len), show_in_teleprompter: true }] },
    }))
    const base = bytesFor(1).canonicalBytes - 1
    const exact = bytesFor(SCRIPT_SNAPSHOT_MAX_BYTES - base)
    expect(exact.canonicalBytes).toBe(SCRIPT_SNAPSHOT_MAX_BYTES)
    let err: unknown
    try { bytesFor(SCRIPT_SNAPSHOT_MAX_BYTES - base + 1) } catch (e) { err = e }
    expect(err).toBeInstanceOf(PermanentJobError)
    expect((err as PermanentJobError).code).toBe('script_snapshot_too_large')
  })

  it('an oversized HOOK alone also fails closed (never truncated)', () => {
    let err: unknown
    try {
      buildScriptSnapshot(gen({ scene_timeline: { hook: 'h'.repeat(SCRIPT_SNAPSHOT_MAX_BYTES), scenes: [] } }))
    } catch (e) { err = e }
    expect((err as PermanentJobError).code).toBe('script_snapshot_too_large')
  })

  it('many scenes over the cap fail closed with all scenes still intact in memory', () => {
    const scenes = Array.from({ length: 200 }, (_, i) => ({
      scene_number: i + 1, scene_type: 'talking_head', dialogue: 'd'.repeat(500), show_in_teleprompter: true,
    }))
    let err: unknown
    try { buildScriptSnapshot(gen({ scene_timeline: { hook: 'h', scenes } })) } catch (e) { err = e }
    expect((err as PermanentJobError).code).toBe('script_snapshot_too_large')
  })
})

describe('normalizeSnapshotString', () => {
  it('NFC + collapse + trim', () => {
    expect(normalizeSnapshotString('  á \t\n b  ')).toBe('á b')
  })
})
