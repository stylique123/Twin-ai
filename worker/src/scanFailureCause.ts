// WHICH `ScanFailureCause` (packages/shared/src/scanFailure.ts) A FAILED SCAN
// REPORTS TO THE SCREEN.
//
// ⚠️ MEASURED 2026-10-26: a YouTube onboarding scan read the channel through
// Apify successfully, then voice synthesis got Gemini 429 RESOURCE_EXHAUSTED.
// The job result carried `failure_class: billing`, but `dna-poll` returned no
// cause at all, so the screen fell back to UNKNOWN ("we are not sure why yet").
// We DID know why. This maps what the worker observed onto the shared taxonomy,
// and it rides the job result so `dna-poll` can hand it to the screen.
//
// ⚖️ CODES ONLY. The shared package owns the creator-facing wording.
import { classifyTranscriptFailure } from './transcriptFailure.js'

export type ScanStage = 'read' | 'empty' | 'unsupported' | 'synth'

export function scanFailureCause(stage: ScanStage, err?: unknown): string {
  if (stage === 'unsupported') return 'UNSUPPORTED_PLATFORM'
  // An empty read keeps its own carefully worded sentence; never "private".
  if (stage === 'empty') return 'UNKNOWN'
  const m = err instanceof Error ? err.message : String(err ?? '')
  if (/RESOURCE_EXHAUSTED|\bquota\b/i.test(m)) return 'SERVICE_QUOTA'
  // A model call that ran out of time is not a broken scraper.
  if (stage === 'synth' && /timed? ?out|timeout|aborted|deadline/i.test(m)) return 'SCAN_TIMED_OUT'
  const cls = classifyTranscriptFailure(err)
  if (cls === 'rate_limited') return 'RATE_LIMITED'
  if (cls === 'billing' || cls === 'credentials') return 'SERVICE_QUOTA'
  if (stage === 'read' && (cls === 'transient' || cls === 'bot_check')) return 'PLATFORM_ACCESS_FAILED'
  return 'SCRAPER_FAILED'
}
