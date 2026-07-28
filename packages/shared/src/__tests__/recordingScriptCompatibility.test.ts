import { describe, expect, it } from 'vitest'
import { isRecordingScriptForGeneration, type RecordingScript } from '../recordingScript'

const valid = (): RecordingScript => ({
  version: 1,
  generation_id: 'gen-a',
  platform: 'reels',
  hook: 'Stop scrolling',
  wpm: 'natural',
  total_duration_sec: 2,
  scenes: [{
    scene_number: 1,
    scene_type: 'talking_head',
    purpose: 'Hook',
    dialogue: 'Stop scrolling',
    duration_sec: 2,
    camera_framing: 'Chest-up',
    background: 'Studio',
    movement: 'Look at camera',
    caption_text: 'Stop scrolling',
    pause_after: true,
    show_in_teleprompter: true,
  }],
})

describe('persisted Recording Script compatibility', () => {
  it('accepts the current wire contract for the owning generation', () => {
    expect(isRecordingScriptForGeneration(valid(), 'gen-a')).toBe(true)
  })

  it('rejects a script copied from another generation', () => {
    expect(isRecordingScriptForGeneration(valid(), 'gen-b')).toBe(false)
  })

  it('rejects pre-rebuild or corrupt scenes before teleprompter entry', () => {
    const legacy = valid() as unknown as { scenes: Array<Record<string, unknown>> }
    delete legacy.scenes[0].show_in_teleprompter
    expect(isRecordingScriptForGeneration(legacy, 'gen-a')).toBe(false)
  })

  it('rejects a script with no spoken teleprompter scene', () => {
    const silent = valid()
    silent.scenes[0] = { ...silent.scenes[0], dialogue: null, show_in_teleprompter: false }
    expect(isRecordingScriptForGeneration(silent, 'gen-a')).toBe(false)
  })

  it('rejects duplicate scene numbers that would corrupt capture identity', () => {
    const duplicate = valid()
    duplicate.scenes.push({ ...duplicate.scenes[0] })
    expect(isRecordingScriptForGeneration(duplicate, 'gen-a')).toBe(false)
  })
})
