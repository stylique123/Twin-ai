// AIMING THE ANALYSERS WE ALREADY HAVE AT THE REFERENCE.
//
// ⚠️ NOTHING HERE ANALYSES ANYTHING. `editor_visual.py` finds the cuts and the
// faces, `referenceTierZero.ts` reduces them, and `runVisualBridge` already
// knows how to run the bridge. This module does the one thing that was actually
// missing: it points them at a reference video instead of the creator's own
// take. The capability was never the gap — the AIM was.
//
// ⚖️ IT IS A SECOND OPINION, NOT A REPLACEMENT. The Gemini visual pass reads
// meaning from frames; this reads geometry off the file. Measured 2026-09-01:
// of 52 failed `assess_reference` jobs in 24h, 52 were RESOURCE_EXHAUSTED on
// Gemini's daily per-model quota while 239 other jobs on the same platforms
// finished fine. On that day a creator learned nothing about their reference.
// These numbers cannot be rate-limited, so on the next such day they still can.
//
// ⚠️ THEREFORE IT MUST NEVER THROW, AND MUST NEVER DELAY THE PASS THAT PAYS.
// A bonus that can fail the job it rides along on is not a bonus. Every failure
// below is a `failureCode` on a returned row.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { normalizeRotation } from './jobs/editorInspect.js'
import { loadAnalysisRules } from './jobs/editorManifest.js'
import { coarseIntervalMs, runVisualBridge, type VisualFacts } from './jobs/editorVisual.js'
import { tierZeroProfile, tierZeroHasSignal, type TierZeroProfile } from './referenceTierZero.js'
import { probeReferenceVisual, tierZeroUsable } from './referenceVisualCapabilities.js'

/** How long the whole Tier 0 pass may take before it is abandoned.
 *
 *  ⚠️ ITS OWN BUDGET, NOT `EDITOR_VISUAL_TIMEOUT_MS` (600s). That number is
 *  sized for a paid render the creator is waiting on; spending ten minutes of a
 *  reference job on a free extra would turn a bonus into the slowest step. */
export const TIER_ZERO_TIMEOUT_MS = Number(process.env.REFERENCE_TIER_ZERO_TIMEOUT_MS ?? '90000')

/** Why Tier 0 produced nothing. `null` means it produced something. */
export type TierZeroFailureCode =
  | 'CAPABILITIES_UNAVAILABLE'
  | 'PROBE_FAILED'
  | 'BRIDGE_FAILED'
  | 'TIMED_OUT'
  | 'NO_SIGNAL'

export interface TierZeroPassResult {
  ran: boolean
  profile: TierZeroProfile | null
  failureCode: TierZeroFailureCode | null
}

const NOT_RUN = (failureCode: TierZeroFailureCode): TierZeroPassResult =>
  ({ ran: false, profile: null, failureCode })

interface ProbedFacts { durationMs: number; width: number; height: number; rotation: number }

/**
 * ffprobe one local file for the four facts the bridge needs.
 *
 * ⚠️ A REFERENCE IS NOT AN ASSET, so `buildInspection` cannot be reused: it is
 * keyed to an asset row (id, checksum, validation version) and throws
 * `PermanentJobError` when a frame rate is missing — a hard failure that is
 * correct for the editor and wrong for a bonus pass on a stranger's video.
 * `normalizeRotation` IS reused, and the display swap below is pinned against
 * `editorInspect`'s by test, because rotation is exactly where a re-implementation
 * quietly disagrees.
 */
function ffprobeFacts(path: string, signal: AbortSignal): Promise<ProbedFacts | null> {
  return new Promise((resolve) => {
    let settled = false
    const done = (v: ProbedFacts | null) => { if (!settled) { settled = true; cleanup(); resolve(v) } }
    // detached → own process group, so an abort kills ffprobe and anything it
    // spawned rather than orphaning it for the container's lifetime.
    const child = spawn('ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
      { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const kill = () => { try { process.kill(-child.pid!, 'SIGKILL') } catch { /* already gone */ } }
    const onAbort = () => { kill(); done(null) }
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.on('error', () => done(null))
    child.on('close', (code) => {
      if (code !== 0) return done(null)
      try {
        const p = JSON.parse(out) as {
          format?: { duration?: unknown }
          streams?: Array<Record<string, unknown>>
        }
        const v = (p.streams ?? []).find((s) => s['codec_type'] === 'video')
        if (!v) return done(null)
        const secs = Number(p.format?.duration)
        const width = Number(v['width']); const height = Number(v['height'])
        if (!Number.isFinite(secs) || secs <= 0) return done(null)
        if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return done(null)
        // Rotation lives in either the stream tag or a display-matrix side datum,
        // depending on how the platform muxed it. Reading only one finds 0 on
        // half the phone-shot references in the library.
        const tagRot = (v['tags'] as Record<string, unknown> | undefined)?.['rotate']
        const sideRot = (v['side_data_list'] as Array<Record<string, unknown>> | undefined)
          ?.find((s) => s['rotation'] !== undefined)?.['rotation']
        const rotation = normalizeRotation(
          tagRot !== undefined ? Number(tagRot) : sideRot !== undefined ? Number(sideRot) : 0,
        )
        done({ durationMs: Math.round(secs * 1000), width, height, rotation })
      } catch { done(null) }
    })
  })
}

/** Display dimensions after rotation. Mirrors `buildInspection`'s swap rule —
 *  see `a-reference-is-not-an-asset.test.ts`, which asserts the two agree. */
export function displayDims(f: ProbedFacts): { displayWidth: number; displayHeight: number } {
  const swap = f.rotation === 90 || f.rotation === 270
  return swap
    ? { displayWidth: f.height, displayHeight: f.width }
    : { displayWidth: f.width, displayHeight: f.height }
}

/**
 * Measure a reference video that is ALREADY ON DISK.
 *
 * ⚠️ IT DOES NOT DOWNLOAD. `runVisualPass` has already pulled full video to a
 * temp path — that is the whole reason this is cheap. Adding a download here
 * would make a free second opinion cost a second pull of the same bytes.
 *
 * ⚖️ `speechMs` COMES FROM THE CALLER, NOT FROM HERE. The transcript pass has
 * already timed the speech and this pass never holds the audio, so the honest
 * arrangement is to be HANDED the number rather than re-derive it. Null is a
 * real answer: `tierZeroProfile` turns it into a null percentage rather than a
 * zero, which would claim a silent video.
 */
export async function runTierZeroPass(
  videoPath: string, speechMs: number | null = null,
): Promise<TierZeroPassResult> {
  const caps = await probeReferenceVisual()
  if (!tierZeroUsable(caps)) return NOT_RUN('CAPABILITIES_UNAVAILABLE')

  const ac = new AbortController()
  const deadline = setTimeout(() => ac.abort(), TIER_ZERO_TIMEOUT_MS)
  const timedOut = () => ac.signal.aborted
  // `runVisualBridge` wants the editor's CancelWatch. Ours is backed by this
  // pass's own deadline, so an over-running bridge is killed on OUR budget and
  // the reference job continues without it.
  const watch = { signal: ac.signal, cancelled: timedOut, stop: () => clearTimeout(deadline) }

  let dir: string | null = null
  try {
    const probed = await ffprobeFacts(videoPath, ac.signal)
    if (timedOut()) return NOT_RUN('TIMED_OUT')
    if (probed === null) return NOT_RUN('PROBE_FAILED')

    const { rules } = loadAnalysisRules()
    const facts: VisualFacts = {
      durationMs: probed.durationMs,
      ...displayDims(probed),
      rotation: probed.rotation as 0 | 90 | 180 | 270,
    }

    dir = await mkdtemp(join(tmpdir(), 'twinai-t0-'))
    let bridge
    try {
      bridge = await runVisualBridge(
        videoPath, join(dir, 'visual.json'), facts,
        coarseIntervalMs(probed.durationMs, rules), watch,
      )
    } catch {
      // ⚠️ EVERY bridge failure is a row, including a pinned-model mismatch.
      // In the editor that is a PermanentJobError and should stop a paid render;
      // here it must not take a reference job down with it.
      return NOT_RUN(timedOut() ? 'TIMED_OUT' : 'BRIDGE_FAILED')
    }

    const profile = tierZeroProfile({
      shotBoundaries: bridge.shotBoundaries,
      faceCoverage: bridge.faceCoverage,
      durationMs: probed.durationMs,
      // ⚠️ SUPPLIED BY THE CALLER, FROM THE TRANSCRIPT PASS. Never measured
      // here and never guessed: null means the caller had no ASR timings, and
      // `tierZeroProfile` turns that into a null percentage, not a zero.
      speechMs,
    })
    // A row of five nulls is not a reading. Storing it would let a surface say
    // "we looked and found nothing" about a pass that measured nothing at all.
    if (!tierZeroHasSignal(profile)) return NOT_RUN('NO_SIGNAL')
    return { ran: true, profile, failureCode: null }
  } catch {
    return NOT_RUN(timedOut() ? 'TIMED_OUT' : 'BRIDGE_FAILED')
  } finally {
    clearTimeout(deadline)
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * The Tier 0 columns for one row, from one pass result.
 *
 * ⚠️ IT ENCODES THE SAME THREE RULES MIGRATION 0180 CHECKS, ON PURPOSE. The
 * database refuses a row carrying both a profile and a failure code, and refuses
 * a `measured_at` without a profile. Duplicating those here is not belt and
 * braces: a constraint violation surfaces as a failed write on a job that had
 * already done all its work, so the shape is settled before it is sent.
 *
 * ⚠️ AN ABSENT RESULT WRITES NOTHING. `{}` leaves the existing columns alone,
 * which is what a job that never reached the pass should do — clearing them
 * would erase a real earlier reading on behalf of a run that never looked.
 * That is different from `ran: false`, which HAS something to say: a code.
 */
export function tierZeroColumns(
  r: TierZeroPassResult | null | undefined, measuredAt: string,
): Record<string, unknown> {
  if (!r) return {}
  if (r.ran && r.profile !== null) {
    return {
      tier_zero_profile: r.profile,
      // Cleared on success: a success and a failure are not both true, and a
      // re-run that worked must not leave the old code beside the new numbers
      // for a later count to guess between.
      tier_zero_failure_code: null,
      tier_zero_measured_at: measuredAt,
    }
  }
  return {
    tier_zero_profile: null,
    tier_zero_failure_code: r.failureCode,
    // ⚠️ THE CODE, BUT NO TIMESTAMP. A later run selects on the stamp's absence
    // to retry; stamping a failure would retire a reference nobody ever measured.
    tier_zero_measured_at: null,
  }
}
