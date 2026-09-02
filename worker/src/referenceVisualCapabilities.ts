// WHAT WE CAN LEARN ABOUT A REFERENCE WITHOUT ASKING A MODEL.
//
// ⚠️ THIS EXISTS BECAUSE THE ONLY VISUAL READER WE HAVE IS QUOTA-BOUND.
// `visualPass.ts` samples frames and sends them to Gemini. Measured 2026-09-01:
// of 52 failed `assess_reference` jobs in 24h, 52 were
// RESOURCE_EXHAUSTED on the daily per-model quota — across BOTH TikTok and
// YouTube, while 239 other jobs on the same platforms finished fine. The
// download works. The reading budget is what runs out, and when it does a
// creator gets nothing about their reference at all.
//
// These three signals come off the file itself. They cost no tokens, cannot be
// rate-limited, and still work on the day the quota is gone.
//
// ⚖️ THREE QUESTIONS, NAMED SEPARATELY, NEVER A RANKED LADDER. This is the
// lesson `alignmentCapabilities.ts` was written to record, and it is repeated
// here deliberately rather than referenced, because the failure it prevents is
// a reading failure:
//
//   speechActivity   "when is anyone talking, and when is it silent?"
//   sceneChange      "where does the picture cut?"
//   faceFraming      "how much of the frame is the person, and where?"
//
// A cut is not a silence and a silence is not a cut. A talking-head video with
// no cuts and a montage with no speech are opposite formats that a collapsed
// "visual richness" score would rank identically. Keep the names apart.
//
// ⚠️ AND THEY ARE NOT ALL AVAILABLE, WHICH IS THE POINT OF PROBING RATHER THAN
// DECLARING. Measured against `worker/requirements.txt` as pinned today:
//
//   speechActivity   Silero VAD, inside faster-whisper, run by onnxruntime.
//   sceneChange      `editor_visual.py` boundaries — sceneCutThreshold with a
//                    merge window, already tuned and shipped.
//   faceFraming      YuNet via OpenCV, in that same script.
//
// ⚠️ ALL THREE ARE ALREADY BUILT, AND THAT IS THE FINDING. This item was
// carried on the list as "build VAD, face detection, scene detect", and none of
// it needs building. `worker/editor_visual.py` emits `faces`, `boundaries` and
// `motion` today, against a YuNet ONNX pinned by digest and an
// opencv-python-headless wheel installed with `pip --require-hashes`, so the
// exact SHA-256 is ENFORCED at install time. The speech path already runs VAD.
//
// ⚖️ WHAT IS MISSING IS NOT A CAPABILITY, IT IS AN AIM. Every one of these runs
// on the creator's OWN take, in Editor v2 Phase 6. None has ever been pointed
// at a REFERENCE. The reference path (`visualPass.ts`) samples frames and asks
// Gemini — which is why a spent daily quota takes the whole visual profile with
// it. Tier 0 is that same, already-verified analysis aimed at the reference.
//
// ⚠️ SO THIS MODULE DELIBERATELY DOES NOT DECLARE THEM AVAILABLE. It probes.
// The first draft of this file asserted `faceFraming: 'unavailable'` on the
// grounds that no vision library was pinned — read off a truncated view of
// requirements.txt, which names opencv only in a comment pointing at
// requirements-opencv.txt. Its own guard caught it. The lesson is the module's
// reason for existing: what an image can do is measured, never read off a
// dependency list.

import { spawn } from 'node:child_process'

export const REFERENCE_VISUAL_CAPABILITIES = [
  'speechActivity', 'sceneChange', 'faceFraming',
] as const
export type ReferenceVisualCapability = (typeof REFERENCE_VISUAL_CAPABILITIES)[number]

/** ⚠️ THREE STATES, NOT TWO. `unknown` is what you get before the probe ran, or
 *  when the probe itself failed. It must never read as `unavailable`: one says
 *  "this image cannot do it", the other says "nobody asked". Collapsing the
 *  second into the first turns a broken probe into a confident false negative,
 *  and a false negative here silently disables a signal that works. */
export type CapabilityStatus = 'available' | 'unavailable' | 'unknown'

export type ReferenceVisualCapabilities = Record<ReferenceVisualCapability, CapabilityStatus>

/** The honest starting point: nothing has been asked yet. */
export const UNPROBED: ReferenceVisualCapabilities = {
  speechActivity: 'unknown',
  sceneChange: 'unknown',
  faceFraming: 'unknown',
}

/**
 * Python modules each capability needs.
 *
 * ⚠️ IMPORT, NOT `pip show`. A declared dependency is not an installed one, an
 * installed one is not importable, and an importable one is not compatible.
 * Only the running interpreter can answer this, and only by importing.
 *
 * `sceneChange` is absent on purpose — it needs no Python at all, and listing
 * an empty array for it would make `.every(Boolean)` return true vacuously,
 * reporting `available` without checking anything.
 */
const REQUIRES: Partial<Record<ReferenceVisualCapability, readonly string[]>> = {
  speechActivity: ['onnxruntime', 'faster_whisper'],
  // ⚠️ `cv2` IS NOT ENOUGH ON ITS OWN. YuNet is a weights file, and OpenCV
  // imports perfectly well without it. Importability answers "is the runtime
  // here", not "can it see a face" — the model path is checked separately by
  // the caller, the same way `editor_visual.py` verifies its manifest digest
  // rather than trusting the file's presence.
  faceFraming: ['cv2'],
  sceneChange: ['cv2', 'numpy'],
}

function importable(mod: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('python3', ['-c', `import ${mod}`], { stdio: 'ignore' })
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(false) }, timeoutMs)
    child.on('error', () => { clearTimeout(timer); resolve(false) })
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0) })
  })
}

/**
 * Ask the machine, once, at startup.
 *
 * ⚖️ BEST-EFFORT AND NEVER FATAL. A worker that cannot answer this can still
 * transcribe, render and scan. Crashing on a diagnostic would turn a reporting
 * gap into an outage. The cost of failing is `unknown`, a state every reader
 * here is built for.
 */
export async function probeReferenceVisual(timeoutMs = 20_000): Promise<ReferenceVisualCapabilities> {
  const out: ReferenceVisualCapabilities = { ...UNPROBED }
  for (const cap of REFERENCE_VISUAL_CAPABILITIES) {
    try {
      const mods = REQUIRES[cap]
      // ⚠️ NO MODULE LIST MEANS NOTHING WAS CHECKED — `unknown`, never
      // `available`. An empty `.every(Boolean)` is true, and that is precisely
      // how a capability nobody probed starts reporting itself as working.
      if (!mods || mods.length === 0) { out[cap] = 'unknown'; continue }
      const results = await Promise.all(mods.map((m) => importable(m, timeoutMs)))
      out[cap] = results.every(Boolean) ? 'available' : 'unavailable'
    } catch {
      // Leave it `unknown`. A failed probe is not evidence of absence.
      out[cap] = 'unknown'
    }
  }
  return out
}

/** One line for the startup log. Names every capability and its status, so a
 *  missing one is visible in the log rather than inferred from its absence. */
export function referenceVisualSummary(caps: ReferenceVisualCapabilities): string {
  return REFERENCE_VISUAL_CAPABILITIES.map((c) => `${c}=${caps[c]}`).join(' ')
}

/**
 * Can a no-model profile say anything useful at all?
 *
 * ⚖️ ANY ONE SIGNAL IS WORTH HAVING. The point of this layer is that a creator
 * whose reference could not be read still learns something true about it, so
 * requiring all three would reproduce the all-or-nothing failure it exists to
 * fix. `unknown` does not count: it is not a signal, it is the absence of an
 * answer about a signal.
 */
export function tierZeroUsable(caps: ReferenceVisualCapabilities): boolean {
  return REFERENCE_VISUAL_CAPABILITIES.some((c) => caps[c] === 'available')
}
