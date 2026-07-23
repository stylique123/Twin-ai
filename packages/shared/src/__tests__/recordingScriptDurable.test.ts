import { describe, it, expect, vi } from 'vitest'
import {
  establishDurableRecordingScript, recordingScriptCanonical, type DurableScriptDeps,
} from '../recordingScriptApi'
import type { RecordingScript, RecordingScene } from '../recordingScript'

function scene(n: number, dialogue: string | null, shown = true): RecordingScene {
  return {
    scene_number: n, scene_type: shown ? 'talking_head' : 'b_roll', purpose: '',
    dialogue, duration_sec: 2, camera_framing: '', background: '', movement: '',
    caption_text: '', pause_after: false, show_in_teleprompter: shown,
  }
}
function script(over: Partial<RecordingScript> = {}): RecordingScript {
  return {
    version: 1, generation_id: 'g1', platform: 'tiktok', hook: 'Hook', wpm: 'natural',
    total_duration_sec: 0, scenes: [scene(1, 'Hello world'), scene(2, null, false)], ...over,
  }
}

describe('recordingScriptCanonical: the ONE seam (full script, wpm-independent)', () => {
  it('is stable across wpm (wpm never feeds provenance) and covers hidden scenes', () => {
    const a = script({ wpm: 'natural' })
    const b = script({ wpm: 'creator' })
    expect(recordingScriptCanonical(a)).toBe(recordingScriptCanonical(b)) // wpm irrelevant
    const dropHidden = script({ scenes: [scene(1, 'Hello world')] })
    expect(recordingScriptCanonical(a)).not.toBe(recordingScriptCanonical(dropHidden)) // full script is identity
  })
})

describe('establishDurableRecordingScript: durable authority before recording', () => {
  it('FIXTURE synth+persist success: legacy null timeline synthesized, persisted, re-read equal -> ok', async () => {
    const synth = script() // e.g. built from blueprint because scene_timeline was null
    const deps: DurableScriptDeps = {
      persist: vi.fn(async () => ({ ok: true })),
      reload: vi.fn(async () => script()), // DB now returns the same script
    }
    const r = await establishDurableRecordingScript(synth, deps)
    expect(r.ok).toBe(true)
    expect(r.script && recordingScriptCanonical(r.script)).toBe(recordingScriptCanonical(synth))
    expect(deps.persist).toHaveBeenCalledTimes(1)
  })

  it('FIXTURE persistence denial/network failure: record disabled (persist_failed), no source create', async () => {
    const reload = vi.fn()
    const deps: DurableScriptDeps = {
      persist: vi.fn(async () => ({ ok: false, error: 'permission denied' })),
      reload,
    }
    const r = await establishDurableRecordingScript(script(), deps)
    expect(r).toEqual({ ok: false, reason: 'persist_failed' })
    expect(reload).not.toHaveBeenCalled() // never proceeds toward recording/create
  })

  it('FIXTURE reload failure: cannot prove durability -> reload_failed', async () => {
    const deps: DurableScriptDeps = {
      persist: vi.fn(async () => ({ ok: true })),
      reload: vi.fn(async () => null),
    }
    expect(await establishDurableRecordingScript(script(), deps)).toEqual({ ok: false, reason: 'reload_failed' })
  })

  it('FIXTURE concurrent/script drift: re-read differs -> mismatch (fail before create, no orphan)', async () => {
    const inMemory = script()
    const deps: DurableScriptDeps = {
      persist: vi.fn(async () => ({ ok: true })),
      // someone else edited the generation between load and persist
      reload: vi.fn(async () => script({ scenes: [scene(1, 'DIFFERENT words'), scene(2, null, false)] })),
    }
    expect(await establishDurableRecordingScript(inMemory, deps)).toEqual({ ok: false, reason: 'mismatch' })
  })
})
