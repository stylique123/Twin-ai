// @vitest-environment jsdom
//
// FIX 8b's judge writes `generations.beat_audit.semantic_repetition
// .repair_candidates`, and nothing in `apps/web/src` or `worker/src` read
// it — the field had zero reader. This proves it now does: a scene whose
// `beat_index` matches `repair_target` gets a rewrite card, and "Use this"
// lands the candidate through the SAME commit path `SceneCard` uses
// (`applyDialogueEdit` → `establishDurableRecordingScriptLive`).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { RecordingScript } from '@twinai/shared'

// jsdom has no IntersectionObserver; the editor only uses it to drive the
// setup strip, which this test does not assert on.
class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIntersectionObserver

const establishDurableRecordingScriptLive = vi.fn()

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {
    ...actual,
    loadRecordingScript: vi.fn(async () => SCRIPT),
    establishDurableRecordingScriptLive: (script: RecordingScript) => establishDurableRecordingScriptLive(script),
  }
})
vi.mock('../lib/scriptEdits', () => ({ recordScriptEdit: vi.fn() }))

const SCRIPT: RecordingScript = {
  version: 1,
  generation_id: 'gen-1',
  platform: 'tiktok',
  hook: 'You are doing this wrong.',
  wpm: 'natural',
  total_duration_sec: 20,
  scenes: [
    {
      scene_number: 1, scene_type: 'talking_head', purpose: 'hook', dialogue: 'You are doing this wrong.',
      beat_index: 0, duration_sec: 4, camera_framing: '', background: '', movement: '',
      caption_text: '', pause_after: false, show_in_teleprompter: true,
    },
    {
      scene_number: 2, scene_type: 'talking_head', purpose: 'story', dialogue: 'I spent three years failing at this.',
      beat_index: 4, duration_sec: 4, camera_framing: '', background: '', movement: '',
      caption_text: '', pause_after: false, show_in_teleprompter: true,
    },
  ],
}

const BEAT_AUDIT = {
  semantic_repetition: {
    ran: true, trigger: true, repair_target: 4,
    repair_candidates: ['I struggled for years before this clicked.', 'Three years of getting it wrong, then this.', 'It took me three years to figure out.'],
  },
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('ScriptEditor renders the semantic-repetition repair', () => {
  it('shows the offered rewrites on the scene the judge targeted', async () => {
    const { ScriptEditor } = await import('./ScriptEditor')
    render(
      <ScriptEditor
        generationId="gen-1"
        blueprint={{} as never}
        selectedHook={null}
        fallback={<div>fallback</div>}
        beatAudit={BEAT_AUDIT}
      />,
    )
    expect(await screen.findByText(/This restates an earlier beat/i)).toBeTruthy()
    expect(screen.getByText(/I struggled for years before this clicked\./)).toBeTruthy()
    expect(screen.getByText(/Three years of getting it wrong, then this\./)).toBeTruthy()
  })

  it('"Use this" commits the candidate through the same edit path as an ordinary dialogue edit', async () => {
    establishDurableRecordingScriptLive.mockResolvedValue({ ok: true, script: SCRIPT })
    const { ScriptEditor } = await import('./ScriptEditor')
    render(
      <ScriptEditor
        generationId="gen-1"
        blueprint={{} as never}
        selectedHook={null}
        fallback={<div>fallback</div>}
        beatAudit={BEAT_AUDIT}
      />,
    )
    const useButtons = await screen.findAllByRole('button', { name: 'Use this' })
    fireEvent.click(useButtons[0])
    await waitFor(() => expect(establishDurableRecordingScriptLive).toHaveBeenCalledTimes(1))
    const passed = establishDurableRecordingScriptLive.mock.calls[0][0] as RecordingScript
    const rewritten = passed.scenes.find((s) => s.beat_index === 4)
    expect(rewritten?.dialogue).toBe('I struggled for years before this clicked.')
  })

  it('no repair card appears when repair_candidates is absent', async () => {
    const { ScriptEditor } = await import('./ScriptEditor')
    render(
      <ScriptEditor
        generationId="gen-1"
        blueprint={{} as never}
        selectedHook={null}
        fallback={<div>fallback</div>}
        beatAudit={{ semantic_repetition: { ran: true, trigger: false, repair_target: null, repair_candidates: null } }}
      />,
    )
    await screen.findByText(/I spent three years failing at this\./)
    expect(screen.queryByText(/This restates an earlier beat/i)).toBeNull()
  })
})
