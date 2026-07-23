// Editor v2 — the PURE authority for the browser recorder's SCENE-PROVENANCE state
// (Constitution §5.1 / §10D). V2Capture holds the in-progress take in React refs,
// but EVERY mutation of the accepted scene windows — go back a scene, retake a
// scene, and the final projection into the capture intent — goes through this
// module, so the recorded provenance stays 1:1 with the teleprompter scenes and
// can never drift into duplicate or misaligned segments.
//
// Recorder model: one continuous blob written on a MONOTONIC active-time clock (ms
// of un-paused recording). An "accepted window" is the [startMs, endMs) slice of
// that blob kept for one scene. Rejected reads — flubs, retakes, go-backs — fall in
// the GAPS between accepted windows and are never rewound: navigating back only
// discards accepted windows, never blob/clock time, and the next recording opens a
// new window PAST the discarded bytes. This file has no browser dependencies so it
// is covered by the shared Vitest suite; V2Capture must call it, never re-implement
// the transition inline.

export interface AcceptedWindow {
  startMs: number
  endMs: number
}

export interface AcceptedSegment {
  sceneNumber: number
  startMs: number
  endMs: number
}

// Re-recording a scene appends EXACTLY ONE replacement window, in recording order.
// (Thin by design — it exists so the "append one" half of the contract has a single
// named authority and is asserted alongside the truncation half.)
export function appendWindow<T>(windows: readonly T[], w: T): T[] {
  return [...windows, w]
}

// Navigate BACK to `targetIndex` (0-based recorded-scene index). Every accepted
// window from the target onward is now invalid — the target scene will be
// re-recorded, and any scenes recorded AFTER the target's now-discarded take
// followed a take that no longer exists — so keep ONLY the windows STRICTLY BEFORE
// the target. Retake-the-just-finished-scene is the same transition with the target
// set to the last recorded index. This never rewinds the recorder clock.
//
// This is the corrected behavior: the old recorder popped a SINGLE trailing entry,
// which is correct only at the last recorded scene. After navigating back once
// (recording ahead, then stepping back), a single pop leaves the target scene's
// stale window in place, so re-recording APPENDS a duplicate and the arrays lose
// their 1:1 scene alignment (→ duplicate/mismatched provenance at save).
export function keepBeforeScene<T>(windows: readonly T[], targetIndex: number): T[] {
  if (!Number.isInteger(targetIndex) || targetIndex <= 0) return []
  if (targetIndex >= windows.length) return windows.slice()
  return windows.slice(0, targetIndex)
}

// Project the accepted windows onto the teleprompter scenes (already filtered to
// `show_in_teleprompter`, in order) to build the ordered, unique accepted_segments
// of the capture intent. windows[k] is the k-th recorded scene ↔ teleprompterScenes[k].
// Fails closed on ANY structural mismatch so provenance that doesn't match the take
// is never uploaded: it verifies the windows are strictly ordered and
// non-overlapping (so every rejected byte lies in a gap OUTSIDE an accepted window)
// and that the resulting scene numbers are unique. Returns segments in recording
// order; scene numbers may be noncontiguous (hidden b-roll scenes are filtered out
// upstream) but must be unique.
export function projectAcceptedSegments(
  windows: readonly AcceptedWindow[],
  teleprompterScenes: readonly { scene_number: number }[],
): AcceptedSegment[] {
  if (windows.length === 0) throw new Error('capture_provenance_empty')
  if (windows.length > teleprompterScenes.length) throw new Error('capture_provenance_scene_mismatch')
  const out: AcceptedSegment[] = []
  const seen = new Set<number>()
  let prevEnd = -1
  for (let k = 0; k < windows.length; k++) {
    const scene = teleprompterScenes[k]
    if (!scene) throw new Error('capture_provenance_scene_mismatch')
    const w = windows[k]
    if (!Number.isFinite(w.startMs) || !Number.isFinite(w.endMs) || w.endMs <= w.startMs) {
      throw new Error('capture_provenance_bad_window')
    }
    // Strictly after the previous window's end — rejected bytes fall in the gap.
    if (w.startMs < prevEnd) throw new Error('capture_provenance_overlap')
    prevEnd = w.endMs
    if (seen.has(scene.scene_number)) throw new Error('capture_provenance_dup_scene')
    seen.add(scene.scene_number)
    out.push({ sceneNumber: scene.scene_number, startMs: w.startMs, endMs: w.endMs })
  }
  return out
}
