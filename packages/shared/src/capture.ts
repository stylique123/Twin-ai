// Capture helpers shared by the web record surfaces (V1 Record + V2 Capture) and
// the edit-poll surfaces (V1 Record, V2 Review, mobile Record). Extracted so the
// MediaRecorder MIME selection and the "poll a queued edit job to completion" loop
// live in ONE place instead of being copy-pasted per screen.

import { getJob, type IngestJob } from './api'

// Pick the best MediaRecorder container/codec the browser supports, preferring
// VP9→VP8→generic webm→mp4. Web-only (MediaRecorder is undefined in React Native;
// mobile records via expo-camera). Returns '' when none match (let MediaRecorder
// fall back to its own default).
export function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

export interface PollEditOptions {
  attempts?: number // max polls before timing out (default 200)
  intervalMs?: number // delay between polls (default 2000)
  shouldStop?: () => boolean // return true to abort early (e.g. component unmounted)
}

// Poll an autoedit job until it reaches a terminal state. Calls `onProgress` with
// the worker's live stage each tick (label + 0-100 pct) so the caller can drive its
// own status UI, and resolves with the terminal job (status 'done' | 'failed').
// Resolves `null` on timeout or when `shouldStop()` returns true — the caller
// decides how to present timeout vs. the returned done/failed job. The loop sleeps
// BEFORE each fetch (the job was just enqueued, so there's nothing to read yet).
export async function pollEditJob(
  jobId: string,
  onProgress?: (label: string, pct: number, job: IngestJob) => void,
  opts: PollEditOptions = {},
): Promise<IngestJob | null> {
  const { attempts = 200, intervalMs = 2000, shouldStop } = opts
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs))
    if (shouldStop?.()) return null
    const job = await getJob(jobId)
    if (!job) continue
    if (job.status === 'done' || job.status === 'failed') return job
    const p = job.result?.progress
    onProgress?.(p?.label ?? '', typeof p?.pct === 'number' ? p.pct : 0, job)
  }
  return null // timed out
}
