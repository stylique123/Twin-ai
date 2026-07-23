import { describe, it, expect } from 'vitest'
import {
  buildRecordingScriptSnapshot, normalizeSnapshotString, SCRIPT_SNAPSHOT_MAX_BYTES,
} from '../scriptSnapshot'
import { captureScriptSha256, canonicalCaptureScript, sha256Hex } from '../capture'

describe('scriptSnapshot: normalizeSnapshotString', () => {
  it('NFC-folds and collapses ALL Unicode whitespace to single spaces + trims', () => {
    expect(normalizeSnapshotString('  a\t\n b  ')).toBe('a b')
    // NFC: e + combining acute → é
    expect(normalizeSnapshotString('Café')).toBe('Café')
    // nbsp, em space, ideographic space, BOM all collapse
    expect(normalizeSnapshotString('a  b　c﻿')).toBe('a b c')
    expect(normalizeSnapshotString('')).toBe('')
  })
})

describe('scriptSnapshot: buildRecordingScriptSnapshot', () => {
  it('keeps EVERY scene (unfiltered), sorts keys, defaults type + hidden flag', () => {
    const built = buildRecordingScriptSnapshot({
      generationId: 'g1',
      hook: '  Big   news ',
      scenes: [
        { scene_number: 1, scene_type: 'talking_head', dialogue: 'Hello', show_in_teleprompter: true },
        { scene_number: 2, dialogue: null, show_in_teleprompter: false }, // hidden b-roll kept
        { dialogue: 'no number' }, // scene_number missing → index+1 = 3
      ],
    })
    expect(built.snapshot.hook).toBe('Big news')
    expect(built.snapshot.scenes).toEqual([
      { sceneNumber: 1, sceneType: 'talking_head', dialogue: 'Hello', showInTeleprompter: true },
      { sceneNumber: 2, sceneType: 'talking_head', dialogue: null, showInTeleprompter: false },
      { sceneNumber: 3, sceneType: 'talking_head', dialogue: 'no number', showInTeleprompter: true },
    ])
    // canonical keys sorted: dialogue, sceneNumber, sceneType, showInTeleprompter
    expect(built.canonical.startsWith('{"generationId":"g1","hook":"Big news","scenes":[{"dialogue":"Hello","sceneNumber":1,')).toBe(true)
    expect(built.canonical.endsWith(',"schemaVersion":1}')).toBe(true)
  })

  it('hook falls back to selectedHook, then null when empty', () => {
    expect(buildRecordingScriptSnapshot({ generationId: 'g', selectedHook: 'from col', scenes: [] }).snapshot.hook).toBe('from col')
    expect(buildRecordingScriptSnapshot({ generationId: 'g', hook: '   ', selectedHook: '  ', scenes: [] }).snapshot.hook).toBeNull()
    expect(buildRecordingScriptSnapshot({ generationId: 'g', scenes: [] }).snapshot.hook).toBeNull()
  })

  it('fails closed (script_snapshot_too_large) past the byte cap', () => {
    let err: unknown
    try {
      buildRecordingScriptSnapshot({ generationId: 'g', hook: 'x'.repeat(SCRIPT_SNAPSHOT_MAX_BYTES), scenes: [] })
    } catch (e) { err = e }
    expect((err as { code?: string })?.code).toBe('script_snapshot_too_large')
  })
})

describe('scriptSnapshot: capture ↔ snapshot are ONE canonical', () => {
  it('captureScriptSha256 == sha256 of the snapshot canonical (same inputs)', async () => {
    const script = {
      generation_id: 'g1', hook: 'Hook line',
      scenes: [
        { scene_number: 1, scene_type: 'talking_head', dialogue: 'Line one', show_in_teleprompter: true },
        { scene_number: 2, scene_type: 'b_roll', dialogue: null, show_in_teleprompter: false },
      ],
    }
    const built = buildRecordingScriptSnapshot({
      generationId: 'g1', hook: 'Hook line',
      scenes: script.scenes,
    })
    // capture's canonical IS the snapshot canonical
    expect(canonicalCaptureScript(script)).toBe(built.canonical)
    expect(await captureScriptSha256(script)).toBe(await sha256Hex(built.canonical))
  })

  it('recorder fixture: the SHA covers hidden b-roll (full script), not just teleprompter', async () => {
    const withHidden = {
      generation_id: 'g', hook: 'h',
      scenes: [
        { scene_number: 1, scene_type: 'talking_head', dialogue: 'spoken', show_in_teleprompter: true },
        { scene_number: 2, scene_type: 'b_roll', dialogue: null, show_in_teleprompter: false },
      ],
    }
    const withoutHidden = { generation_id: 'g', hook: 'h', scenes: [withHidden.scenes[0]] }
    // Dropping the hidden scene MUST change the SHA — the full script is the identity.
    expect(await captureScriptSha256(withHidden)).not.toBe(await captureScriptSha256(withoutHidden))
  })
})
