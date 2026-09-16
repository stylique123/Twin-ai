// SHE FILMED IT AND IT NEVER ARRIVED.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-16: SEVEN OF NINE RECORDINGS EVER MADE —
// 78%, across SIX different creators — sit at `status='uploading'` with
// `size_bytes` recorded and `content_sha256` NULL. Bytes reached storage;
// validation never ran. Ages at audit: 37, 37, 24, 16, 2, 1 and 1 days. The two
// that did reach `ready` were validated 32 days and 13 hours after creation.
//
// ⚖️ AND THE VALIDATOR IS NOT AT FAULT, WHICH IS THE WHOLE POINT. Exactly THREE
// `validate_source` jobs have ever been enqueued against those nine assets, and
// all three finished `done` on ONE attempt with a NULL error. The job works on
// every input it is handed. Nothing hands it the other six.
//
// The enqueue is not application code. `editor_finalize_source` (migration
// 0076, replaced in 0079) flips `uploading -> validating` and inserts the
// dedup-keyed job — and it is called by the CLIENT, via `finalizeSourceUpload`
// in `packages/shared/src/editor/api.ts`. A closed tab, a backgrounded app or a
// dropped connection AFTER the bytes land but BEFORE that RPC returns strands
// the recording forever. `apps/web/src/lib/uploadNeverHangs.test.ts` already
// records one round of hardening the client; no amount of it removes the class,
// because the last step of a server-side state machine cannot live on a device
// that is allowed to disappear.
//
// ⚠️ AND IT WAS ALREADY BEING COUNTED. `supabase/functions/_shared/ownerConsole.ts`
// reports "N takes never finished uploading" to the owner. The number has been
// on screen and nothing acted on it — reporting without recovery, which is this
// repo's signature defect wearing a dashboard.
//
// ⚖️ SO THE SWEEP ASSERTS NOTHING AND MEASURES NOTHING ITSELF. It calls the same
// RPC the client would have called, with NO bytes and NO etag, and lets the
// existing validator decide. That is deliberate:
//
//   - `editor_finalize_source` is idempotent per its own contract, so a row
//     swept twice costs one no-op.
//   - The missing-object case ALREADY has a tested path: `validateSource` HEADs
//     before download and rejects a file that is missing or corrupt with a
//     structured reason. Re-deciding that here would be a second opinion on a
//     question already answered better, with a TOCTOU window between them.
//   - ⚠️⚠️ AND IT MUST NOT FABRICATE AN ETAG. `validateSource:323` compares the
//     storage etag to `finalized_etag` ONLY WHEN ONE IS PRESENT — that pin is
//     how a replayed upload token is stopped from getting different content
//     validated. The sweep cannot attest to bytes a client never committed to,
//     so it supplies none and the comparison is correctly skipped. Passing the
//     etag we happen to observe would turn a real guarantee into a rubber stamp.
//     Never do it, however convenient a "complete" metadata row looks.

/** ⚠️ TWO HOURS, AND THIS IS A SAFETY PROPERTY RATHER THAN A TUNING KNOB.
 *
 *  Sweeping an upload that is STILL IN FLIGHT finalizes a partial object, the
 *  validator correctly rejects it, and the way back — `rejected -> validating` —
 *  requires a `validation_version` bump (migration 0076's transition guard). So
 *  a threshold set too low does not merely act early: it can permanently reject
 *  a recording that was arriving fine, which is worse than the defect.
 *
 *  The largest stranded object measured is 124 MB. Two hours covers that at
 *  roughly 0.14 Mbit/s — slower than any connection someone would film on. The
 *  only cost of being generous is recovery latency, and every one of the seven
 *  stranded rows is at least a DAY old, so all seven are recovered either way. */
export const STALLED_UPLOAD_AGE_MS = 2 * 60 * 60_000

/** How often the sweep runs at all. Follows `SCHEMA_RECHECK_MS`'s reasoning: often
 *  enough that a creator is not waiting on a redeploy, rare enough that it is not
 *  a query on every poll. */
export const SWEEP_INTERVAL_MS = 10 * 60_000

/** ⚠️⚠️ ONE. NOT A CAP — A RATE, AND IT IS THE FIX FOR A REAL DEFECT THE STAGING
 *  MATRIX FOUND IN THIS FILE.
 *
 *  This was 25. Matrix run 35094972649 on head 7cf9b522 FAILED with
 *  "asset 16c1f21f-3b2f-466a-925f-66060f115dad stuck (validating)" from
 *  `scripts/staging-integration/phase4.mjs:109`, and the twenty-five seconds
 *  before the crash are a solid wall of `validate_source` claimed/done pairs.
 *  Phase 4 mints ONE asset; that flood was this sweep. Staging keeps up to three
 *  days of fixture residue, all of it past the two-hour floor, so one pass
 *  enqueued a batch and the harness's own asset waited behind it.
 *
 *  ⚖️ AND THE TEST WAS RIGHT — THE DESIGN WAS WRONG. `validate_source` downloads
 *  and ffprobes a file: real seconds, on the SAME single worker loop that serves
 *  live creators. A batch of 25 recovery jobs means a creator who just finished
 *  filming waits behind twenty-five recordings that have already been lost for
 *  weeks. That is a priority inversion, and it would have been just as true in
 *  production — where it would simply have been harder to see than a red matrix.
 *
 *  The `jobs` table has a `priority` column, but `editor_finalize_source` builds
 *  the row itself, so priority is not reachable without changing that function.
 *  What IS reachable is how many recovery jobs can exist at once. ONE per pass,
 *  every ten minutes, cannot starve anything anywhere — and a recording lost for
 *  37 days does not need recovering in the same minute as one lost for two hours.
 *  Seven assets drain in about seventy minutes, against a measured arrival rate of
 *  seven in five weeks. The headroom is enormous and the interference is nil. */
export const SWEEP_BATCH = 1

export interface StalledUploadRow {
  id?: unknown
  status?: unknown
  created_at?: unknown
}

/**
 * Which stranded uploads are safe to hand to the validator right now.
 *
 * Pure on purpose: the decision is the part worth testing, and a test that needs
 * a database to prove an age comparison is a test nobody runs.
 */
export function stalledUploadIds(
  rows: readonly StalledUploadRow[],
  nowMs: number,
  ageMs: number = STALLED_UPLOAD_AGE_MS,
  batch: number = SWEEP_BATCH,
): string[] {
  const out: Array<{ id: string; at: number }> = []
  for (const r of rows) {
    // ⚠️ ONLY `uploading`. Every other state either has a validation in progress
    // or has already had one, and finalizing a `ready` row would be an illegal
    // transition the database refuses anyway — but refusing it here means the
    // log says "0 swept" instead of filling with caught exceptions.
    if (r?.status !== 'uploading') continue
    const id = typeof r?.id === 'string' ? r.id.trim() : ''
    if (id === '') continue
    const at = typeof r?.created_at === 'string' ? Date.parse(r.created_at) : NaN
    // ⚖️ AN UNREADABLE TIMESTAMP IS NEVER SWEPT. A row whose age cannot be
    // computed is exactly the row where "is this still in flight?" is unanswered,
    // and the harm above is permanent. Skipping it leaves the console counting it,
    // which is the honest outcome.
    if (!Number.isFinite(at)) continue
    if (nowMs - at < ageMs) continue
    out.push({ id, at })
  }
  // Oldest first: if the cap bites, the recording that has been lost longest is
  // the one that comes back.
  out.sort((a, b) => a.at - b.at)
  return out.slice(0, Math.max(0, batch)).map((x) => x.id)
}
