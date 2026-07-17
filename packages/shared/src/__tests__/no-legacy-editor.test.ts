// Guard suite for Part 1 of the one-click-editor rebuild.
//
// The old AI editor was removed. These are BEHAVIORAL contract tests, not greps:
// they import the real shared API surface — the ONLY way the web client reaches the
// backend — and assert the client can no longer even CONSTRUCT an editor call,
// while the recording + teleprompter data path it must keep still works.
import { describe, it, expect } from 'vitest'
import * as shared from '../index.js'
import * as capture from '../capture.js'
import { buildTimeline } from '../timelineAdapter.js'
import { teleprompterScenes, estimateDurationSec, sceneTimeCapSec, WPM_PRESETS } from '../timeline.js'
import type { Blueprint } from '../types.js'

describe('old AI editor is gone from the client API surface', () => {
  // If any of these come back, the web app can enqueue an old-editor render again.
  const REMOVED = [
    'autoEditTake',
    'autoEditFromPath',
    'reEditWithEdl',
    'fetchEdl',
    'pollEditJob',
  ] as const

  it.each(REMOVED)('does not export %s', (name) => {
    expect((shared as Record<string, unknown>)[name]).toBeUndefined()
  })

  it('capture.ts no longer exposes an edit-job poller', () => {
    expect((capture as Record<string, unknown>).pollEditJob).toBeUndefined()
    // ...but still exposes the recorder MIME picker (recording must keep working).
    expect(typeof capture.pickRecorderMime).toBe('function')
  })

  it('keeps the recording + playback primitives the recorder/library depend on', () => {
    expect(typeof shared.uploadTakeToBucket).toBe('function') // save a take
    expect(typeof shared.getJob).toBe('function') // poll ingest jobs
    expect(typeof shared.signEditUrls).toBe('function') // play finished videos
  })

  it('exposes no function whose name implies an auto-editor', () => {
    const leaks = Object.keys(shared).filter((k) => /autoedit|reEdit|fetchEdl|pollEdit/i.test(k))
    expect(leaks).toEqual([])
  })
})

describe('recording + teleprompter data path still builds from a blueprint (no editor)', () => {
  const blueprint = {
    reference_read: { platform: 'reels', format_label: 'Test', why_it_works: [], retention_map: [] },
    hook_options: ['This is the hook line.'],
    script: [
      { section: 'hook', line: 'This is the hook line.', direction: '' },
      { section: 'body', line: 'Here is the second scene with a few words.', direction: '' },
    ],
    shot_list: [],
    captions: [],
    edit_checklist: [],
    caption_packet: { caption_style: '', pacing: '', emphasis: '', export: '' },
    publish_plan: [],
    production_sprint: [],
  } as unknown as Blueprint

  it('buildTimeline turns a blueprint into recordable teleprompter scenes', () => {
    const tl = buildTimeline({ generationId: 'g1', blueprint, selectedHook: 'This is the hook line.' })
    const scenes = teleprompterScenes(tl)
    expect(scenes.length).toBeGreaterThan(0)
    // The chosen hook opens the teleprompter.
    expect(scenes[0]?.dialogue ?? '').toContain('hook line')
  })

  it('duration + per-scene cap helpers stay pure and finite', () => {
    const secs = estimateDurationSec('one two three four five', 'natural')
    expect(secs).toBeGreaterThan(0)
    expect(Number.isFinite(sceneTimeCapSec(secs))).toBe(true)
    expect(WPM_PRESETS.natural).toBeGreaterThan(0)
  })

  it('the Scene Timeline is RECORDING-ONLY — no render/edit fields on any scene', () => {
    const tl = buildTimeline({ generationId: 'g1', blueprint, selectedHook: 'This is the hook line.' })
    // These are the old editor's per-scene render instructions — they must not be
    // part of the recording model anymore (Stage 2.3 separation).
    const FORBIDDEN = ['broll_instruction', 'cut_point', 'transition', 'edl', 'zoom', 'keyframe', 'render', 'output_path', 'segments']
    for (const scene of tl.scenes) {
      for (const key of FORBIDDEN) {
        expect(scene as Record<string, unknown>).not.toHaveProperty(key)
      }
      // recording fields ARE present
      expect(scene).toHaveProperty('dialogue')
      expect(scene).toHaveProperty('show_in_teleprompter')
    }
  })
})
