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
