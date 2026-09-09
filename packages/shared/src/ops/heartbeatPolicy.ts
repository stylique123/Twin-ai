// ⚠️ THIS MODULE IS A LEAF ON PURPOSE, AND THAT COSTS ONE DUPLICATED REGEX.
// The scheduled runner is a `.mjs` script loaded with --experimental-strip-types,
// which resolves imports the way Node does, not the way tsc does. The canonical
// `FIRST_PERSON_MARKER` lives in `script/witnessScore.ts`, which imports
// `claimEntailment`, which imports further — the whole chain fails to load, and
// the heartbeat would be a policy nothing could run.
//
// ⚖️ SO IT IS COPIED, AND THE COPY IS PINNED. `a-heartbeat-that-spams-gets-muted`
// asserts this matcher agrees with the canonical one across a fixed corpus, in a
// vitest file that CAN import both. This is the same bargain the edge functions
// make with their `*Inline` twins: a duplicate is acceptable exactly when
// something fails the build the moment the two disagree.
const FIRST_PERSON_HERE = /\b(?:i|i'm|i've|i'd|i'll|me|my|mine|we|we're|we've|our|ours)\b/i

// ── THE HEARTBEAT'S POLICY ─────────────────────────────────────────────────
//
// ⚠️ THE OUTAGE THIS EXISTS FOR LASTED TWO DAYS AND NOTHING NOTICED.
// `generate-blueprint` could not boot from 2026-09-06 20:01. Zero scripts were
// written in 48 hours. The deploy reported success, every CI check was green,
// and the first report came from a person trying to use the product. Nothing
// was USING the thing on a schedule, so nothing could tell.
//
// ⚖️ TWO CHANNELS, SPLIT BY WHETHER A HUMAN CAN ACT AT 3AM.
//   PAGE    the writer produced nothing, or took longer than a creator waits.
//   DIGEST  the writer produced something suspicious. Real, worth reading,
//           never worth waking up for.
// A softer signal routed to the pager is how a pager gets muted, and a muted
// pager is worse than none — so the split is a rule here, not a judgement call
// at the call site.

/** Longer than this and a creator has already given up. Pages. */
export const PAGE_IF_SLOWER_THAN_MS = 3 * 60 * 1000

/** While it stays broken, one reminder an hour. Not one per run. */
export const REMINDER_INTERVAL_MS = 60 * 60 * 1000

export type DigestFindingKind =
  | 'length_outside_band'
  | 'claim_restriction_violated'
  | 'wrong_voice'
  | 'sponsored_product_spoken_as_lived'
  | 'duration_not_measured'
  | 'reference_download_failed'
  | 'paid_path_used'

export interface DigestFinding {
  kind: DigestFindingKind
  detail: string
}

export interface HeartbeatRun {
  /** Epoch ms the run finished. */
  at: number
  mode: 'reference' | 'idea'
  /** Why it produced no script, or null when it produced one. */
  failed: string | null
  /**
   * ⚠️ NULL IS "NOT MEASURED", NEVER "FAST". A run whose duration we failed to
   * record cannot clear the slow check — it never established anything. It
   * also must not page, because the script did arrive and waking somebody for
   * a missing measurement is the noise this file exists to prevent. So it goes
   * to the digest, where an unmeasured run is visible rather than absent.
   */
  durationMs: number | null
  /**
   * ⚠️ THE REFERENCE DID NOT DOWNLOAD, AND THAT IS NOT TWIN BEING DOWN.
   *
   * MEASURED ON THE HEARTBEAT'S OWN URL, 2026-09-08. The real assess job came
   * back `outcome: assessed`, `rejected: 0`, 18 fields accepted — and
   * `visual_ran: false` with `visual_failure_code: UNKNOWN_DOWNLOAD_FAILURE`,
   * the same code 222 stored references already carry. The captions arrived, so
   * a script can be written; the video file did not.
   *
   * ⚖️ SO IT IS DIGEST, NEVER PAGE. The heartbeat's question is "can Twin write
   * a script", and it can. Waking somebody at 3am about YouTube's availability
   * is how a pager gets muted — and a muted pager is the same silence as no
   * monitor, with the belief that one is watching.
   */
  visualFailureCode?: string | null
  /**
   * ⚠️ A MONITOR MUST NOT BE ABLE TO SPEND MONEY. The same run showed
   * `paid_because: free_path_failed` — the free caption route failed and it
   * fell through to the paid one. Hourly, that is 24 paid fetches a day
   * forever, growing silently: the class of cost nobody notices until an
   * invoice explains it.
   */
  paidPath?: boolean
}

export type PageReason = 'started_failing' | 'still_failing' | 'recovered'

export interface PageState {
  failing: boolean
  /** Epoch ms of the last page sent, or null if none has ever been sent. */
  lastPagedAt: number | null
}

export const INITIAL_PAGE_STATE: PageState = { failing: false, lastPagedAt: null }

export interface HeartbeatDecision {
  page: PageReason | null
  nextState: PageState
  digest: DigestFinding[]
}

/** Did this run fail, or take longer than a creator waits? */
export function runIsBad(run: HeartbeatRun): boolean {
  if (run.failed !== null) return true
  // THE NULL CHECK PRECEDES THE COERCION. `null > threshold` is false in JS,
  // so an unmeasured duration would silently read as healthy if compared
  // directly — the exact shape of bug that lets a broken thing look fine.
  if (run.durationMs === null) return false
  return run.durationMs > PAGE_IF_SLOWER_THAN_MS
}

/**
 * ⚠️ ONE MESSAGE WHEN IT BREAKS, NOT TWENTY-FOUR AN HOUR.
 *
 * Pages on the transition into failure, once an hour while it stays failed,
 * and again on recovery — because "it is back" is the other thing worth
 * interrupting somebody for, and a pager that only ever brings bad news
 * teaches you to dread it.
 *
 * ⚖️ A FAILING STATE WITH NO RECORDED PAGE STILL PAGES. If `lastPagedAt` is
 * null while `failing` is true — a lost write, a fresh store, a hand-edited
 * row — the reminder arithmetic has no operand. Staying silent forever on
 * missing state is how a monitor becomes decorative, so it pages and repairs
 * its own state.
 */
export function decideHeartbeat(
  prev: PageState,
  run: HeartbeatRun,
  extraFindings: readonly DigestFinding[] = [],
): HeartbeatDecision {
  const bad = runIsBad(run)
  const digest: DigestFinding[] = [...extraFindings]

  if (run.failed === null && run.durationMs === null) {
    digest.push({
      kind: 'duration_not_measured',
      detail: `${run.mode} run produced a script but its duration was not recorded`,
    })
  }

  if (!bad) {
    return {
      page: prev.failing ? 'recovered' : null,
      nextState: { failing: false, lastPagedAt: prev.failing ? run.at : prev.lastPagedAt },
      digest,
    }
  }

  if (!prev.failing) {
    return { page: 'started_failing', nextState: { failing: true, lastPagedAt: run.at }, digest }
  }

  if (prev.lastPagedAt === null || run.at - prev.lastPagedAt >= REMINDER_INTERVAL_MS) {
    return { page: 'still_failing', nextState: { failing: true, lastPagedAt: run.at }, digest }
  }

  return { page: null, nextState: prev, digest }
}

/**
 * AN ASSESS RESULT → A HEARTBEAT RUN. THIS IS WHERE THE TWO FAILURES ARE TOLD
 * APART, AND IT IS NOT WHERE I FIRST PUT IT.
 *
 * ⚠️ MY FIRST VERSION PUT THE SPLIT IN `runIsBad` — `if (visualFailureCode)
 * return false` — AND MUTATION TESTING SHOWED THAT BRANCH CAN NEVER FIRE.
 * Deleting it left every assertion green: a download failure that still yields
 * captions produces a script, so `failed` is already null and the run was never
 * bad. A guard that reads as deliberate and protects nothing is the exact shape
 * this repository keeps finding, so the decision moved to the only place it is
 * actually made — the moment an assess result becomes a run.
 *
 * ⚠️ `status === 'done'` IS NOT PROOF A JOB SUCCEEDED. Measured in production:
 * one of the eight most recent YouTube assess jobs reports itself `done` while
 * carrying a transcript-service 400 in `result.error`. That is the same shape
 * as a deploy reporting success for a function that could not boot. So the
 * error is read from the RESULT and a job with no script is a failure whatever
 * it calls itself — a monitor that trusts a status field is monitoring the
 * field, not the product.
 */
export interface AssessResultLike {
  /** The job's own status. Read for the message, never trusted alone. */
  status?: string | null
  /** `result.error` — the field the status can contradict. */
  error?: string | null
  /** Did words come out? The only thing that decides `failed`. */
  script?: string | null
  visual_failure_code?: string | null
  paid_because?: string | null
  durationMs?: number | null
}

export function runFromAssess(
  at: number,
  mode: 'reference' | 'idea',
  r: AssessResultLike | null | undefined,
): HeartbeatRun {
  const script = typeof r?.script === 'string' ? r.script.trim() : ''
  const err = typeof r?.error === 'string' ? r.error.trim() : ''
  // ⚠️ A SCRIPT IS THE MEASURE, NOT A STATUS. A run that produced words did the
  // job even if the row is untidy; a run that produced none failed even if the
  // row says done.
  const failed = script !== ''
    ? null
    : (err !== '' ? err : `no script produced (status=${String(r?.status ?? 'unknown')})`)
  return {
    at,
    mode,
    failed,
    durationMs: typeof r?.durationMs === 'number' ? r.durationMs : null,
    visualFailureCode: typeof r?.visual_failure_code === 'string' && r.visual_failure_code !== ''
      ? r.visual_failure_code
      : null,
    paidPath: typeof r?.paid_because === 'string' && r.paid_because !== '',
  }
}

/** ⚠️ THE DOWNLOAD FAILED AND THE SCRIPT STILL CAME. Worth reading in the
 *  morning, worth nobody's 3am. Named with the platform's own code so a
 *  recurring one is recognised rather than re-diagnosed each time. */
export function downloadFailureFinding(run: HeartbeatRun): DigestFinding | null {
  if (!run.visualFailureCode) return null
  return {
    kind: 'reference_download_failed',
    detail: `The reference did not download (${run.visualFailureCode}). `
      + 'A script was still produced from captions, so this is the platform, not Twin.',
  }
}

/** ⚠️ THE GUARD REPORTS WHEN IT DID NOT HOLD. A monitor that quietly starts
 *  paying is what this exists to prevent, so a fallthrough is visible in the
 *  digest rather than only in a bill. */
export function paidPathFinding(run: HeartbeatRun): DigestFinding | null {
  if (!run.paidPath) return null
  return {
    kind: 'paid_path_used',
    detail: 'The heartbeat fell through to the PAID transcript path. It must not: '
      + 'a monitor should not be able to spend money.',
  }
}

// ── WHAT THE FROZEN STORE MAKES DECIDABLE ─────────────────────────────────
//
// ⚠️ THIS IS WHY THE ACCOUNT IS SYNTHETIC AND NEVER EDITED. A real creator's
// store changes — a new transcript, an answered question, a scan refresh — and
// then an odd script is as likely to be their data moving as Twin breaking. A
// frozen store means every one of these checks has exactly one explanation.

export interface FrozenStore {
  voiceId: string
  /** The product the creator owns and may speak about from experience. */
  ownedProductName: string
  /**
   * ⚠️ SPONSORED AND NEVER USED, DELIBERATELY. Its whole job is to be the
   * thing the writer must not testify about. Without it the heartbeat would
   * only prove the writer is alive, not that the testimonial gate still
   * holds — and a gate nobody exercises is a gate nobody notices failing.
   */
  sponsoredNeverUsedProductName: string
  /** Words per script this store reliably produces, established at setup. */
  lengthBand: { min: number; max: number }
}

/** Did a script come back attributed to somebody other than the heartbeat?
 *
 *  ⚠️ NOT HYPOTHETICAL. A script belonging to a different creator appeared in
 *  a real session on 2026-09-07 and was never explained. With an arbitrary
 *  account nobody can tell — you do not know what that creator's script should
 *  have said. With a frozen store you do. */
export function wrongVoiceFinding(store: FrozenStore, producedVoiceId: string | null): DigestFinding | null {
  if (producedVoiceId === null) return null // not reported is not "wrong"; absent is not zero
  if (producedVoiceId === store.voiceId) return null
  return {
    kind: 'wrong_voice',
    detail: `script came back as voice ${producedVoiceId}, heartbeat is ${store.voiceId}`,
  }
}

/** Did the writer testify to using a product the creator has never used? */
export function sponsoredSpokenAsLivedFinding(store: FrozenStore, script: string): DigestFinding | null {
  const name = store.sponsoredNeverUsedProductName
  if (!name) return null
  // Sentence-scoped: the product and a first-person marker must appear in the
  // SAME sentence. A script that says "I tried three things" in one breath and
  // names the sponsor two paragraphs later has not claimed to have used it,
  // and flagging that would train somebody to ignore this finding.
  for (const sentence of script.split(/(?<=[.!?])\s+/)) {
    if (sentence.includes(name) && FIRST_PERSON_HERE.test(sentence)) {
      return {
        kind: 'sponsored_product_spoken_as_lived',
        detail: `"${sentence.trim().slice(0, 120)}"`,
      }
    }
  }
  return null
}

/** Is the script far outside the length this frozen store reliably produces? */
export function lengthBandFinding(store: FrozenStore, script: string): DigestFinding | null {
  const words = script.trim().split(/\s+/).filter(Boolean).length
  if (words === 0) return null // an empty script is a FAILURE, not a length anomaly
  const { min, max } = store.lengthBand
  if (words >= min && words <= max) return null
  return {
    kind: 'length_outside_band',
    detail: `${words} words, band is ${min}-${max}`,
  }
}
