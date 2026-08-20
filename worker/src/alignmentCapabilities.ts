// WHAT THIS IMAGE CAN ACTUALLY DO TO A TIMESTAMP, ASKED RATHER THAN ASSUMED.
//
// ⚠️ A DOCSTRING IS NOT A CAPABILITY DECLARATION. `whisper_transcribe.py`
// described a three-tier refiner ladder for weeks while two of the three tiers
// raised ImportError on every call and the loop swallowed it. The comment was
// corrected; the SHAPE was not, and a shape that still reads as three live rungs
// is how the next person concludes somebody wired it. This module is the
// correction to the shape: the tiers are named, their status is a value, and the
// value is measured.
//
// ⚖️ AND THESE ARE THREE DIFFERENT QUESTIONS, DELIBERATELY NOT ONE LADDER.
//
//   vadSnap             "where can I cut without mutilating speech?"
//   wordTiming          "when was this word spoken, roughly?"
//   acousticAlignment   "where exactly did this word begin and end?"
//
// Collapsing them into ranked tiers of one thing is the mistake waiting to
// happen. VAD answers a question about SILENCE, and silence boundaries are the
// right input for a cut and the WRONG input for caption timing — a caption that
// starts at the last silence rather than at the word is early by exactly the
// pause before it. The day someone reads "alignment already exists" and feeds
// silence boundaries into cue times, this comment is the thing that should stop
// them. Keep the names apart.

import { spawn } from 'node:child_process'

export const ALIGNMENT_CAPABILITIES = ['vadSnap', 'wordTiming', 'acousticAlignment'] as const
export type AlignmentCapability = (typeof ALIGNMENT_CAPABILITIES)[number]

/** ⚠️ THREE STATES, NOT TWO. `unknown` is what you get before the probe has run
 *  or when the probe itself failed, and it must not read as `unavailable` — one
 *  says "this image cannot do it", the other says "nobody asked". Defaulting the
 *  second to the first is how a broken probe becomes a confident false negative. */
export type CapabilityStatus = 'available' | 'unavailable' | 'unknown'

export type AlignmentCapabilities = Record<AlignmentCapability, CapabilityStatus>

/** The honest starting point: nothing has been asked yet. */
export const UNPROBED: AlignmentCapabilities = {
  vadSnap: 'unknown',
  wordTiming: 'unknown',
  acousticAlignment: 'unknown',
}

/** What each capability actually needs, as an importable module.
 *
 *  ⚠️ IMPORT, NOT `pip show`. This session's founding lesson: a declared
 *  dependency is not an installed one, an installed one is not importable, and
 *  an importable one is not compatible. Only the running interpreter can answer
 *  this, and only by importing. */
const REQUIRES: Record<AlignmentCapability, readonly string[]> = {
  // Silero VAD ships inside faster-whisper and runs under onnxruntime — both
  // exactly pinned in requirements.txt today. This is the capability the cut
  // question actually wants, and it is the one already present.
  vadSnap: ['onnxruntime', 'faster_whisper'],
  // Plain faster-whisper word timestamps: the rung production has always run on.
  wordTiming: ['faster_whisper'],
  // wav2vec2 CTC forced alignment. Needs torch + torchaudio, neither of which is
  // in requirements.txt. Expected `unavailable`, and that expectation is now a
  // measured value rather than a claim in a comment.
  acousticAlignment: ['torch', 'torchaudio'],
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
 * Ask the interpreter, once, at startup.
 *
 * ⚖️ BEST-EFFORT AND NEVER FATAL. A worker that cannot answer this question can
 * still transcribe, render and scan; crashing on a diagnostic would turn a
 * reporting gap into an outage. The cost of failing is `unknown`, which is a
 * state the readers are built for.
 */
export async function probeAlignment(timeoutMs = 20_000): Promise<AlignmentCapabilities> {
  const out: AlignmentCapabilities = { ...UNPROBED }
  for (const cap of ALIGNMENT_CAPABILITIES) {
    try {
      const results = await Promise.all(REQUIRES[cap].map((m) => importable(m, timeoutMs)))
      out[cap] = results.every(Boolean) ? 'available' : 'unavailable'
    } catch {
      // Leave it `unknown`. See the type: a failed probe is not evidence of absence.
      out[cap] = 'unknown'
    }
  }
  return out
}

/** One line for the startup log and the heartbeat row, in a form that reads the
 *  same on both. */
export function alignmentSummary(c: AlignmentCapabilities): string {
  return ALIGNMENT_CAPABILITIES.map((k) => `${k}=${c[k]}`).join(' ')
}

/**
 * ⚠️ THE CAPABILITY THIS PROJECT HAS DECIDED NOT TO BUY, RECORDED SO THE
 * DECISION DOES NOT HAVE TO BE REDISCOVERED.
 *
 * `acousticAlignment` is expected `unavailable` and that is a deliberate,
 * argued choice, not an oversight: adding torch (~800MB, unmeasured in this
 * image) would be spending the most expensive dependency option on a quality
 * defect nobody has measured — the audio equivalent of paying residential proxy
 * fees before confirming the IP was the problem.
 *
 * ⚖️ THE ORDER THE QUESTION MUST BE ANSWERED IN:
 *   1. Measure whether automatic cuts audibly clip speech (count boundaries,
 *      do not judge whole renders).
 *   2. If they do, apply the cheapest intervention that matches the failure —
 *      a bounded nearest-silence snap using the VAD already in this image.
 *   3. Only investigate acoustic alignment if a measured residual survives (2).
 *
 * Anyone about to add torch should be able to point at a measured bad-cut rate
 * that VAD snapping failed to fix. If they cannot, this is still the answer.
 */
export const ACOUSTIC_ALIGNMENT_IS_DECLINED_UNTIL_MEASURED = true
