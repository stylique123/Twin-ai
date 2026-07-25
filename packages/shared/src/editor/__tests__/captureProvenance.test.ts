import { describe, it, expect } from 'vitest'
import {
  appendWindow, keepBeforeScene, projectAcceptedSegments, type AcceptedWindow,
} from '../captureProvenance'
import { teleprompterScenes, type RecordingScript, type RecordingScene } from '../../recordingScript'

// A recorded take is a list of accepted windows in the recorder's monotonic
// active-time clock (ms). Rejected bytes fall in the GAPS between windows.
const W = (startMs: number, endMs: number): AcceptedWindow => ({ startMs, endMs })

// Simulate the recorder timeline: each scene records for `durMs` starting AFTER the
// current clock (which only moves forward — never rewound). Returns the appended
// window and the new clock. This mirrors V2Capture's closeScene using the shared
// append authority.
function record(windows: AcceptedWindow[], clockMs: number, durMs: number, gapMs = 0) {
  const start = clockMs + gapMs
  const end = start + durMs
  return { windows: appendWindow(windows, W(start, end)), clockMs: end }
}

describe('captureProvenance: keepBeforeScene truncation (go-back / retake)', () => {
  it('2 scenes: go back to scene 0 discards the target onward, then re-record appends one', () => {
    // record scene 0 [0,1000), scene 1 [1000,2000)
    let s = record([], 0, 1000)
    s = record(s.windows, s.clockMs, 1000)
    expect(s.windows).toEqual([W(0, 1000), W(1000, 2000)])
    // at scene 1, go back to target index 0 → keep strictly before 0 → []
    const back = keepBeforeScene(s.windows, 0)
    expect(back).toEqual([])
    // re-record scene 0 appends EXACTLY ONE replacement (clock never rewound: 2000+)
    const re = record(back, s.clockMs, 900, 50)
    expect(re.windows).toEqual([W(2050, 2950)])
  })

  it('3+ scenes: go back to a middle scene truncates that scene AND all after it', () => {
    // record 0..3
    let s = { windows: [] as AcceptedWindow[], clockMs: 0 }
    for (let k = 0; k < 4; k++) s = record(s.windows, s.clockMs, 1000)
    expect(s.windows.length).toBe(4)
    // positioned at scene 4 (not recorded); go back to scene 1 → keep [0]
    const back = keepBeforeScene(s.windows, 1)
    expect(back).toEqual([W(0, 1000)])
  })

  it('repeated go-backs stay 1:1 (each step discards target-onward, never leaves a stale window)', () => {
    let s = { windows: [] as AcceptedWindow[], clockMs: 0 }
    for (let k = 0; k < 4; k++) s = record(s.windows, s.clockMs, 1000) // len 4, at scene 4
    let w = s.windows
    let i = 4
    // step back twice
    i -= 1; w = keepBeforeScene(w, i) // target 3 → keep [0..2]
    expect(w.length).toBe(3)
    i -= 1; w = keepBeforeScene(w, i) // target 2 → keep [0..1]
    expect(w.length).toBe(2)
    // re-record scene 2 then 3 → exactly one per scene, still ordered/non-overlapping
    let clock = s.clockMs
    let r = record(w, clock, 500, 10); w = r.windows; clock = r.clockMs
    r = record(w, clock, 500, 10); w = r.windows; clock = r.clockMs
    expect(w.length).toBe(4)
    for (let k = 1; k < w.length; k++) expect(w[k].startMs).toBeGreaterThanOrEqual(w[k - 1].endMs)
  })

  it('retake == go-back to the last recorded index (drops exactly the just-finished window)', () => {
    let s = record([], 0, 1000)
    s = record(s.windows, s.clockMs, 1000) // len 2, just finished scene 1 (index 1)
    const retook = keepBeforeScene(s.windows, s.windows.length - 1) // target = 1
    expect(retook).toEqual([W(0, 1000)])
    // retake of the ONLY scene → empty
    const one = record([], 0, 1000)
    expect(keepBeforeScene(one.windows, one.windows.length - 1)).toEqual([])
  })

  it('never rewinds the clock: a discarded window\'s bytes stay in the blob, next window is strictly later', () => {
    let s = record([], 0, 1000)              // scene 0 [0,1000)
    s = record(s.windows, s.clockMs, 1000)   // scene 1 [1000,2000)
    const back = keepBeforeScene(s.windows, 1) // discard scene 1 → [0,1000)
    const re = record(back, s.clockMs, 800)  // clock is still 2000, not 1000
    expect(re.windows[re.windows.length - 1].startMs).toBe(2000)
  })

  it('guards: negative / non-integer / zero target → empty; target past the end → unchanged', () => {
    const ws = [W(0, 1000), W(1000, 2000)]
    expect(keepBeforeScene(ws, 0)).toEqual([])
    expect(keepBeforeScene(ws, -1)).toEqual([])
    expect(keepBeforeScene(ws, 1.5)).toEqual([])
    expect(keepBeforeScene(ws, 5)).toEqual(ws)
    expect(keepBeforeScene(ws, 5)).not.toBe(ws) // a copy, not the same ref
  })
})

// Build a minimal RecordingScript with the given per-scene (shown?) flags.
function script(scenes: Array<{ n: number; shown: boolean; dialogue?: string }>): RecordingScript {
  return {
    version: 1, generation_id: 'g', platform: 'tiktok', hook: 'h', wpm: 'natural',
    total_duration_sec: 0,
    scenes: scenes.map((c): RecordingScene => ({
      scene_number: c.n, scene_type: c.shown ? 'talking_head' : 'b_roll', purpose: '',
      dialogue: c.dialogue ?? (c.shown ? 'line' : null), duration_sec: 2, camera_framing: '',
      background: '', movement: '', caption_text: '', pause_after: false, show_in_teleprompter: c.shown,
    })),
  }
}

describe('captureProvenance: projectAcceptedSegments (final save projection)', () => {
  it('produces ordered, unique segments paired 1:1 with the teleprompter scenes', () => {
    const scenes = teleprompterScenes(script([{ n: 1, shown: true }, { n: 2, shown: true }]))
    const out = projectAcceptedSegments([W(0, 1000), W(1200, 2000)], scenes)
    expect(out).toEqual([
      { sceneNumber: 1, startMs: 0, endMs: 1000 },
      { sceneNumber: 2, startMs: 1200, endMs: 2000 },
    ])
  })

  it('noncontiguous scene numbers: hidden b-roll scenes are filtered out upstream', () => {
    // scenes 1(shown) 2(hidden b-roll) 3(shown) → teleprompter = [1,3]
    const scenes = teleprompterScenes(script([{ n: 1, shown: true }, { n: 2, shown: false }, { n: 3, shown: true }]))
    expect(scenes.map((s) => s.scene_number)).toEqual([1, 3])
    const out = projectAcceptedSegments([W(0, 1000), W(1000, 2000)], scenes)
    expect(out.map((o) => o.sceneNumber)).toEqual([1, 3]) // noncontiguous but valid
  })

  it('rejected bytes lie OUTSIDE accepted windows: a gap between windows is fine, overlap fails', () => {
    const scenes = teleprompterScenes(script([{ n: 1, shown: true }, { n: 2, shown: true }]))
    // gap [1000,1500) = rejected bytes → OK
    expect(projectAcceptedSegments([W(0, 1000), W(1500, 2500)], scenes)).toHaveLength(2)
    // overlap → the second window would include already-accepted bytes → fail closed
    expect(() => projectAcceptedSegments([W(0, 1200), W(1000, 2000)], scenes)).toThrow('capture_provenance_overlap')
  })

  it('fails closed on empty / more windows than scenes / bad window', () => {
    const scenes = teleprompterScenes(script([{ n: 1, shown: true }]))
    expect(() => projectAcceptedSegments([], scenes)).toThrow('capture_provenance_empty')
    expect(() => projectAcceptedSegments([W(0, 1000), W(1000, 2000)], scenes)).toThrow('capture_provenance_scene_mismatch')
    expect(() => projectAcceptedSegments([W(1000, 1000)], scenes)).toThrow('capture_provenance_bad_window')
    expect(() => projectAcceptedSegments([W(2000, 1000)], scenes)).toThrow('capture_provenance_bad_window')
  })

  it('fails closed on duplicate scene numbers (would be a dup_scene at the DB validator)', () => {
    // two teleprompter scenes that (pathologically) carry the SAME scene_number
    const scenes = [{ scene_number: 5 }, { scene_number: 5 }]
    expect(() => projectAcceptedSegments([W(0, 1000), W(1000, 2000)], scenes)).toThrow('capture_provenance_dup_scene')
  })

  // NEGATIVE CONTROL: the OLD recorder behavior — pop a SINGLE trailing entry per
  // go-back — is provably wrong. It only removes the LAST recorded window, so when
  // the creator steps back past the tail it leaves the target scene's stale window
  // in place; re-recording then appends a SECOND window for the same scene position,
  // duplicating a scene and misaligning provenance. The authority truncates correctly.
  it('MUTATION control: old pop-one leaves a stale window + duplicate scene; authority does not', () => {
    const scenes = teleprompterScenes(script([
      { n: 1, shown: true }, { n: 2, shown: true }, { n: 3, shown: true },
    ]))
    // record scenes 0,1,2 (windows for teleprompter scenes 1,2,3), now positioned at index 3
    let s = { windows: [] as AcceptedWindow[], clockMs: 0 }
    for (let k = 0; k < 3; k++) s = record(s.windows, s.clockMs, 1000)

    // Creator steps BACK to scene index 1 (re-record scene 2). Correct = discard the
    // target (index 1) AND everything after (index 2) → keep only [index 0].
    const authority = keepBeforeScene(s.windows, 1)
    const popOne = s.windows.slice(0, -1) // OLD behavior: remove only the last window
    expect(authority).toEqual([W(0, 1000)])
    expect(popOne).toEqual([W(0, 1000), W(1000, 2000)]) // scene index 1's stale window survives
    expect(popOne).not.toEqual(authority)

    // Re-record scene index 1, then continue and re-record scene index 2:
    const clockAfter = s.clockMs
    // AUTHORITY path → exactly 3 windows, 1:1 with scenes [1,2,3], strictly ordered.
    let a = record(authority, clockAfter, 1000, 10)
    a = record(a.windows, a.clockMs, 1000, 10)
    const goodSegs = projectAcceptedSegments(a.windows, scenes)
    expect(goodSegs.map((g) => g.sceneNumber)).toEqual([1, 2, 3]) // unique + ordered

    // OLD path → the stale window + one re-record + one continue = FOUR windows for
    // THREE teleprompter scenes → projection fails closed (more windows than scenes),
    // which in the real recorder manifests as a duplicated/misaligned scene at save.
    let b = record(popOne, clockAfter, 1000, 10)
    b = record(b.windows, b.clockMs, 1000, 10)
    expect(b.windows.length).toBe(4)
    expect(() => projectAcceptedSegments(b.windows, scenes)).toThrow('capture_provenance_scene_mismatch')
  })
})
