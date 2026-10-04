// @vitest-environment jsdom
//
// Result rebuilds its normalised blueprint object on every render, and the
// editor reports each script up through `onScriptChange`, which re-renders
// Result. Keyed on the blueprint's identity, that was a render loop reading
// `generations?select=scene_timeline` nonstop. The load must run once per
// generation / hook / blueprint CONTENT, never per render.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, waitFor, act } from '@testing-library/react'
import { useCallback, useState } from 'react'
import type { RecordingScript } from '@twinai/shared'

class FakeIntersectionObserver { observe() {} unobserve() {} disconnect() {} }
;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIntersectionObserver

const SCRIPT: RecordingScript = {
  version: 1, generation_id: 'gen-1', platform: 'tiktok', hook: 'Hook line.', wpm: 'natural', total_duration_sec: 4,
  scenes: [{
    scene_number: 1, scene_type: 'talking_head', purpose: 'hook', dialogue: 'Hook line.',
    beat_index: 0, duration_sec: 4, camera_framing: '', background: '', movement: '',
    caption_text: '', pause_after: false, show_in_teleprompter: true,
  }],
}
const loadRecordingScript = vi.fn(async () => ({ ...SCRIPT }))

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, loadRecordingScript: () => loadRecordingScript() }
})
vi.mock('../lib/scriptEdits', () => ({ recordScriptEdit: vi.fn() }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('ScriptEditor does not reload the timeline on every parent render', () => {
  it('loads once even when the parent passes a fresh blueprint object each render', async () => {
    const { ScriptEditor } = await import('./ScriptEditor')
    let bump: () => void = () => {}
    function Parent() {
      const [, setLive] = useState<RecordingScript | null>(null)
      const [n, setN] = useState(0)
      bump = () => setN((x) => x + 1)
      const onScriptChange = useCallback((s: RecordingScript | null) => setLive(s), [])
      // A NEW object every render, exactly as Result's normaliser produces.
      const blueprint = { script: [], hook_options: [], render: n % 1 } as never
      return <ScriptEditor generationId="gen-1" blueprint={blueprint} selectedHook={null} fallback={<div>fb</div>} onScriptChange={onScriptChange} />
    }
    render(<Parent />)
    await waitFor(() => expect(loadRecordingScript).toHaveBeenCalledTimes(1))
    for (let i = 0; i < 5; i++) await act(async () => { bump() })
    await new Promise((r) => setTimeout(r, 50))
    expect(loadRecordingScript).toHaveBeenCalledTimes(1)
  })
})
