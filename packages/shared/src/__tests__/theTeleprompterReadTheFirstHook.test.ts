// SHE TAPPED THE FOURTH HOOK AND THE TELEPROMPTER READ THE FIRST — STILL.
//
// ⚠️⚠️ THAT IS THE TITLE OF #927, AND IT WAS STILL TRUE AFTER #927. That change
// put `withSelectedHook` inside `ScriptEditor`, so the editor on the result page
// rendered the chosen hook. The teleprompter does not go through `ScriptEditor`.
// It goes through `prepareCaptureMode`, whose record path is:
//
//     const persisted = await deps.loadScript()
//     if (persisted) return { ready: true, mode: 'record', script: persisted }
//
// — the PERSISTED script, with no hook patch anywhere. Only the `synthScript`
// fallback passed `selectedHook`, and that branch runs solely when NOTHING is
// persisted. Every generation a creator has opened in the editor HAS a
// `scene_timeline`, so every one of them took the unpatched branch.
//
// ⚖️ AND IT IS RECONCILED BY PERSISTING, NEVER BY PATCHING IN MEMORY.
// `editor_recording_script_canonical` (0091) computes the capture SHA from the
// PERSISTED `scene_timeline`; a client that recorded against a locally-patched
// scene 1 would produce an `intendedDialogueSha256` the create RPC refuses. So
// a memory-only fix would trade a wrong teleprompter for a refused take.
import { describe, it, expect, vi } from 'vitest'
import { prepareCaptureMode } from '../recordingScriptApi'
import type { RecordingScript } from '../recordingScript'

const script = (hook: string, scene1: string): RecordingScript => ({
  generation_id: 'g1',
  hook,
  wpm: 'normal',
  total_duration_sec: 10,
  scenes: [
    { scene_number: 1, scene_type: 'talking_head', dialogue: scene1, duration_sec: 5, caption_text: scene1 },
    { scene_number: 2, scene_type: 'talking_head', dialogue: 'the body', duration_sec: 5, caption_text: 'the body' },
  ],
} as unknown as RecordingScript)

const FIRST = 'Most people rebind a Bible wrong.'
const FOURTH = 'I charge four hundred pounds and here is why.'

describe('the chosen hook reaches the script the camera reads', () => {
  it('reconciles a persisted script whose scene 1 is the OLD hook', async () => {
    // The exact production shape: `selected_hook` says the fourth, the stored
    // timeline still says the first.
    const stale = script(FIRST, FIRST)
    const establish = vi.fn(async (t: RecordingScript) => ({ ok: true, script: t }))
    const r = await prepareCaptureMode('record', {
      loadScript: async () => stale,
      synthScript: async () => null,
      establish,
      selectedHook: async () => FOURTH,
    })
    expect(r.ready).toBe(true)
    expect(establish).toHaveBeenCalledTimes(1)
    const out = (r as { script: RecordingScript }).script
    expect(out.scenes[0].dialogue).toBe(FOURTH)
    expect(out.hook).toBe(FOURTH)
    // ⚠️ AND THE REST OF THE SCRIPT IS UNTOUCHED. A rebuild would throw away
    // the creator's edits to change one line.
    expect(out.scenes[1].dialogue).toBe('the body')
  })

  it('an already-agreeing script is returned unchanged and persists NOTHING', async () => {
    // ⚖️ The fast path has to stay fast: a write on every teleprompter entry
    // would be a round trip, a failure mode and a new `updated_at` for nothing.
    const agreed = script(FOURTH, FOURTH)
    const establish = vi.fn(async (t: RecordingScript) => ({ ok: true, script: t }))
    const r = await prepareCaptureMode('record', {
      loadScript: async () => agreed,
      synthScript: async () => null,
      establish,
      selectedHook: async () => FOURTH,
    })
    expect(establish).not.toHaveBeenCalled()
    expect((r as { script: RecordingScript }).script).toBe(agreed)
  })

  it('no chosen hook reconciles nothing — absent is not "there is no hook"', async () => {
    const stale = script(FIRST, FIRST)
    const establish = vi.fn(async (t: RecordingScript) => ({ ok: true, script: t }))
    const r = await prepareCaptureMode('record', {
      loadScript: async () => stale,
      synthScript: async () => null,
      establish,
      selectedHook: async () => null,
    })
    expect(establish).not.toHaveBeenCalled()
    expect((r as { script: RecordingScript }).script).toBe(stale)
  })

  it('a caller that supplies no selectedHook at all behaves exactly as before', async () => {
    // Every existing caller and fixture keeps its meaning.
    const stale = script(FIRST, FIRST)
    const r = await prepareCaptureMode('record', {
      loadScript: async () => stale,
      synthScript: async () => null,
      establish: async (t) => ({ ok: true, script: t }),
    })
    expect((r as { script: RecordingScript }).script).toBe(stale)
  })

  it('⚠️ a failed persist refuses VISIBLY rather than recording against a stale script', async () => {
    // Continuing here is the defect: the creator would film a hook she did not
    // choose, and the capture RPC would refuse the take anyway on its SHA.
    const stale = script(FIRST, FIRST)
    const r = await prepareCaptureMode('record', {
      loadScript: async () => stale,
      synthScript: async () => null,
      establish: async () => ({ ok: false, reason: 'persist_failed' as const, error: 'rls' }),
      selectedHook: async () => FOURTH,
    })
    expect(r.ready).toBe(false)
    expect((r as { reason: string }).reason).toBe('persist_failed')
  })

  it('⚠️ a drifted re-read refuses too, and does not hand back the drifted script', async () => {
    const stale = script(FIRST, FIRST)
    const r = await prepareCaptureMode('record', {
      loadScript: async () => stale,
      synthScript: async () => null,
      establish: async () => ({ ok: false, reason: 'mismatch' as const }),
      selectedHook: async () => FOURTH,
    })
    expect(r.ready).toBe(false)
    expect((r as { reason: string }).reason).toBe('mismatch')
  })
})

describe('⚠️ UPLOAD still does ZERO script work', () => {
  it('reads nothing at all — not the script, and not the generation', async () => {
    // ⚠️⚠️ THE INVARIANT I NEARLY RETIRED. A first draft resolved `selectedHook`
    // as a VALUE, which the caller had to await BEFORE entering this function —
    // making every upload pay a generation read it does not need. It is a
    // function for exactly this reason, and this test is why it stays one.
    const loadScript = vi.fn(async () => null)
    const synthScript = vi.fn(async () => null)
    const establish = vi.fn(async (t: RecordingScript) => ({ ok: true, script: t }))
    const selectedHook = vi.fn(async () => FOURTH)
    const r = await prepareCaptureMode('upload', { loadScript, synthScript, establish, selectedHook })
    expect(r).toEqual({ ready: true, mode: 'upload' })
    expect(loadScript).not.toHaveBeenCalled()
    expect(synthScript).not.toHaveBeenCalled()
    expect(establish).not.toHaveBeenCalled()
    expect(selectedHook).not.toHaveBeenCalled()
  })
})

describe('the synthesis path is unchanged', () => {
  it('still builds, establishes and returns the durable script', async () => {
    const built = script(FOURTH, FOURTH)
    const r = await prepareCaptureMode('record', {
      loadScript: async () => null,
      synthScript: async () => built,
      establish: async (t) => ({ ok: true, script: t }),
      selectedHook: async () => FOURTH,
    })
    expect(r.ready).toBe(true)
    expect((r as { script: RecordingScript }).script).toBe(built)
  })

  it('still reports `load` when nothing can be built', async () => {
    const r = await prepareCaptureMode('record', {
      loadScript: async () => null,
      synthScript: async () => null,
      establish: async (t) => ({ ok: true, script: t }),
      selectedHook: async () => FOURTH,
    })
    expect(r).toEqual({ ready: false, mode: 'record', reason: 'load' })
  })
})
