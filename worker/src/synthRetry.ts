// BOUNDED RETRY FOR THE VOICE-BUILDING MODEL CALL WHEN IT IS REFUSED FOR QUOTA.
//
// ⚠️ MEASURED 2026-10-26: onboarding scans on YouTube, TikTok and Instagram read
// the account, then `synthesizeVoiceFromPosts` got Gemini 429
// RESOURCE_EXHAUSTED ("quota refusal with no named quota — not retried") and
// the whole scan failed. Volume is ~100–400 calls a day, so this is most likely
// a spend cap the owner has to lift — but a short-lived refusal deserves a
// couple of patient tries before the creator is told no.
//
// ⚖️ BOUNDED, NEVER A LOOP. Two waits (20 s, then 40 s): one minute in total,
// far inside the worker's 35-minute job budget. A cap that is really a billing
// cap will still be refused after a minute; past that we keep the scan and
// stop (see keptScan.ts), rather than spending the creator's patience.

export const SYNTH_QUOTA_DELAYS_MS: readonly number[] = Object.freeze([20_000, 40_000])

/** A quota / rate refusal from the model provider. Anything else is not ours
 *  to retry here: the job queue already owns transient retries. */
export function isQuotaRefusal(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err ?? '')
  return /RESOURCE_EXHAUSTED|\bquota\b|\b429\b|rate.?limit|too many requests/i.test(m)
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function withQuotaRetry<T>(
  fn: () => Promise<T>,
  opts: {
    delays?: readonly number[]
    sleep?: (ms: number) => Promise<void>
    onRetry?: (attempt: number, err: unknown, waitMs: number) => void
  } = {},
): Promise<T> {
  const delays = opts.delays ?? SYNTH_QUOTA_DELAYS_MS
  const sleep = opts.sleep ?? realSleep
  // ⚠️ A FIXED NUMBER OF ATTEMPTS: delays.length + 1. Nothing can extend it.
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i >= delays.length || !isQuotaRefusal(err)) throw err
      opts.onRetry?.(i + 1, err, delays[i])
      await sleep(delays[i])
    }
  }
}
