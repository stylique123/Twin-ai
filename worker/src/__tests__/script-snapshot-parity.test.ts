// Parity: the worker-local recording-script snapshot (worker/src/jobs/editorManifest
// buildScriptSnapshot) must match the shared authority (packages/shared/src/editor/
// scriptSnapshot buildRecordingScriptSnapshot) — byte-identical canonical AND sha.
// Excluded from the worker tsc build, so it CAN import shared by relative path. This
// is the ONE canonical Recording-Script snapshot; if the worker mirror drifts from
// shared (or from the DB copy the DB↔TS parity harness pins), this fails.
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { buildScriptSnapshot, buildNoCapturedScriptSnapshot, reCanonicalizeBoundSnapshot } from '../jobs/editorManifest.js'
import {
  buildRecordingScriptSnapshot, buildNoCapturedScriptSnapshot as sharedNoScript,
  reCanonicalizeBoundSnapshot as sharedReCanon,
} from '../../../packages/shared/src/editor/scriptSnapshot'

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

// Each fixture is a generation row (id, selected_hook, scene_timeline). The shared
// authority receives the equivalent (generationId, hook from timeline, selectedHook,
// full scenes). Hostile strings exercise NFC + whitespace-collapse.
const NBSP = ' ', EMSP = ' ', IDSP = '　', BOM = '﻿'
const cases: Array<{ id: string; selected_hook: string | null; scene_timeline: unknown }> = [
  { id: 'g1', selected_hook: 'col hook', scene_timeline: { hook: 'Hello there', scenes: [
    { scene_number: 1, scene_type: 'talking_head', dialogue: 'Hello world', show_in_teleprompter: true },
  ] } },
  { id: 'g2', selected_hook: 'Fallback   hook', scene_timeline: { scenes: [
    { scene_number: 1, scene_type: 'talking_head', dialogue: 'one', show_in_teleprompter: true },
  ] } },
  { id: 'g3', selected_hook: null, scene_timeline: { hook: `  Big${NBSP}${NBSP}news${EMSP}today\t\n `, scenes: [
    { scene_number: 1, scene_type: 'talking_head', dialogue: `Café${IDSP}time${BOM}`, show_in_teleprompter: true },
    { scene_number: 3, scene_type: 'b_roll', dialogue: null, show_in_teleprompter: false },
    { scene_number: 7, scene_type: 'cta', dialogue: '  trailing\r\nspace  ', show_in_teleprompter: true },
  ] } },
  { id: 'g4', selected_hook: null, scene_timeline: null },
  { id: 'g5', selected_hook: 'h', scene_timeline: { hook: 'h', scenes: [
    { scene_type: 'talking_head', dialogue: 'a', show_in_teleprompter: true },
    { scene_number: 1.5, scene_type: 'talking_head', dialogue: 'b', show_in_teleprompter: true },
  ] } },
]

describe('recording-script snapshot parity: worker == shared', () => {
  for (const c of cases) {
    it(`snapshot for ${c.id} is byte-identical`, () => {
      const w = buildScriptSnapshot(c)
      const tl = (c.scene_timeline && typeof c.scene_timeline === 'object')
        ? c.scene_timeline as { hook?: unknown; scenes?: unknown[] } : null
      const s = buildRecordingScriptSnapshot({
        generationId: c.id,
        hook: tl?.hook,
        selectedHook: c.selected_hook,
        scenes: (tl?.scenes ?? []) as { scene_number?: unknown; scene_type?: unknown; dialogue?: unknown; show_in_teleprompter?: unknown }[],
      })
      // The worker returns the snapshot object; the shared returns the canonical too.
      // Compare canonical bytes AND the derived sha (worker's snapshotSha vs shared).
      expect(s.canonical).toBe(JSON.stringify(canonicalize(w.snapshot)))
      expect(w.snapshotSha).toBe(sha(s.canonical))
      expect(w.snapshotSha).toBe(sha(JSON.stringify(canonicalize(w.snapshot))))
    })
  }
})

describe('no-captured-script (upload) parity: worker == shared', () => {
  it('produces identical canonical + sha for the upload form', () => {
    const w = buildNoCapturedScriptSnapshot('g1')
    const s = sharedNoScript('g1')
    expect(JSON.stringify(canonicalize(w.snapshot))).toBe(s.canonical)
    expect(w.snapshotSha).toBe(sha(s.canonical))
    expect(w.snapshot).toEqual({ schemaVersion: 1, capturedScript: false, generationId: 'g1' })
  })
})

describe('reCanonicalizeBoundSnapshot parity: worker == shared', () => {
  const built = buildRecordingScriptSnapshot({
    generationId: 'g1', hook: 'Hook',
    scenes: [{ scene_number: 1, scene_type: 'talking_head', dialogue: 'Hello', show_in_teleprompter: true }],
  })
  it('re-canonicalizes a valid stored snapshot to identical canonical + sha', () => {
    const stored = JSON.parse(JSON.stringify(built.snapshot))
    const w = reCanonicalizeBoundSnapshot(stored)
    expect(JSON.stringify(canonicalize(w.snapshot))).toBe(sharedReCanon(stored).canonical)
    expect(w.snapshotSha).toBe(sha(built.canonical))
  })
  it('both fail closed on the same corrupt shape (worker throws script_binding_shape)', () => {
    let code: string | undefined
    try { reCanonicalizeBoundSnapshot({ evil: 1 }) } catch (e) { code = (e as { code?: string }).code }
    expect(code).toBe('script_binding_shape')
    expect(() => sharedReCanon({ evil: 1 })).toThrow('script_binding_shape')
  })
})

// Local canonical-JSON (sorted keys) so we can compare the worker snapshot OBJECT to
// the shared CANONICAL string without importing the worker's private canonicalJson.
function canonicalize(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(canonicalize)
  const o = v as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(o).sort()) out[k] = canonicalize(o[k])
  return out
}
