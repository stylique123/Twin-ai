// Job failure classification. The queue loop (index.ts) settles jobs
// differently by class:
//   PermanentJobError → dead_letter_job immediately (no retry budget burned
//                       on an error that can never succeed)
//   LeaseLostError    → abandon WITHOUT settling: another worker owns the job
//                       now; every settle RPC is fenced and would no-op anyway
//   anything else     → retryable: fail_job with backoff until max_attempts

export class PermanentJobError extends Error {
  readonly permanent = true
  constructor(message: string, readonly code = 'permanent_failure') {
    super(message)
    this.name = 'PermanentJobError'
  }
}

export class LeaseLostError extends Error {
  readonly leaseLost = true
  constructor(message: string) {
    super(message)
    this.name = 'LeaseLostError'
  }
}

export function isPermanent(err: unknown): err is PermanentJobError {
  return err instanceof PermanentJobError
    // The fenced editor RPCs raise these when state says "you are not the
    // driver anymore / the work is settled" — retrying cannot change that.
    || (err instanceof Error && /project_terminal|not a terminal status|missing project_id/.test(err.message))
}

export function isLeaseLost(err: unknown): err is LeaseLostError {
  return err instanceof LeaseLostError
    || (err instanceof Error && /lease_lost/.test(err.message))
}

// Map a fenced-RPC error message back onto the worker's error classes so the
// queue loop settles the job correctly. Shared by the orchestrator and the
// Phase-6 analyzing stage (one classifier, not per-module copies).
export function classifyDbError(message: string): Error {
  if (/lease_lost/.test(message)) return new LeaseLostError(message)
  const permanentCodes: Array<[RegExp, string]> = [
    [/project_terminal|not found/, 'project_state'],
    [/manifest_mismatch/, 'manifest_mismatch'],
    [/manifest_invalid/, 'manifest_invalid'],
    [/snapshot_generation_mismatch/, 'snapshot_generation_mismatch'],
    [/checksum_mismatch/, 'checksum_mismatch'],
    [/script_snapshot_too_large/, 'script_snapshot_too_large'],
    [/component_too_large/, 'component_too_large'],
  ]
  for (const [re, code] of permanentCodes) {
    if (re.test(message)) return new PermanentJobError(message, code)
  }
  return new Error(message)
}
