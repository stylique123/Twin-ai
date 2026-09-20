/**
 * WHY A TRANSCRIPT FAILED, IN A WORD THAT SURVIVES THE LOG.
 *
 * ⚠️ EVERY YOUTUBE AND INSTAGRAM FAILURE FOR NINE DAYS RECORDED THE SAME THING:
 * the number 1. `routes: {failed: 5}` is what production held for a 15-video
 * youtube run and a 5-video instagram run, because the reason went to
 * `console.error` and the count went to the durable row. So "Apify is out of
 * credits", "the actor was deleted", "the reel is private" and "our own
 * timeout" were one indistinguishable integer, and the only way to tell them
 * apart was to be watching the log at the moment it happened.
 *
 * ⚖️ THE CLASS IS THE POINT, NOT THE MESSAGE. A free-text error in a counter
 * key would make every distinct message its own bucket and count nothing.
 * These classes are chosen because they imply DIFFERENT ACTIONS: `billing` and
 * `actor_missing` are ours to fix and affect every video; `unavailable` is a
 * fact about one post; `transient` is worth a retry and the others are not.
 */
export type TranscriptFailure =
  | 'billing'        // 402/403 — credits exhausted or token rejected. Ours, total.
  | 'actor_missing'  // 404 — the Actor id no longer resolves. Ours, total.
  | 'rate_limited'   // 429 — back off, then retry.
  | 'transient'      // 5xx / timeout / socket. Retry once.
  | 'unavailable'    // private, removed, region-locked. A fact about the post.
  | 'no_speech'      // read fine, nothing said. Not an error anywhere.
  | 'not_configured' // no token set at all.
  | 'unknown'

export function classifyTranscriptFailure(err: unknown): TranscriptFailure {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase()
  if (/not set|not configured/.test(m)) return 'not_configured'
  if (/\b(402|403)\b|payment|credit|quota|insufficient|unauthor/.test(m)) return 'billing'
  if (/\b404\b|not found|no such act/.test(m)) return 'actor_missing'
  if (/\b429\b|rate.?limit|too many/.test(m)) return 'rate_limited'
  if (/\b5\d\d\b|timeout|timed out|aborted|socket|econn|network|fetch failed/.test(m)) return 'transient'
  if (/private|removed|region|unavailable|deleted|couldn't read that/.test(m)) return 'unavailable'
  if (/no speech|has no speech|no captions|no_captions/.test(m)) return 'no_speech'
  return 'unknown'
}
