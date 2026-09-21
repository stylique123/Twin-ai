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
  | 'credentials'    // 401 — the token itself is rejected. Ours, total, and a
                     //       DIFFERENT fix from billing: rotate the key.
  | 'billing'        // 402/403 — credits exhausted or plan refused. Ours, total.
  | 'actor_missing'  // 404 — the Actor id no longer resolves. Ours, total.
  | 'rate_limited'   // 429 — back off, then retry.
  | 'transient'      // 5xx / timeout / socket. Retry once.
  | 'bot_check'      // the platform demanded proof we are not a robot.
  | 'unavailable'    // private, removed, region-locked. A fact about the post.
  | 'no_speech'      // read fine, nothing said. Not an error anywhere.
  | 'not_configured' // no token set at all.
  | 'unknown'

export function classifyTranscriptFailure(err: unknown): TranscriptFailure {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase()
  if (/not set|not configured/.test(m)) return 'not_configured'
  // ⚠️ 401 WAS `unknown`, AND IT IS THE MOST ACTIONABLE FAILURE THERE IS.
  // Measured 2026-09-20: `apify 67Q6fmd8iedTVcCwY returned 401` — the Apify
  // token rejected outright, on a DIFFERENT actor from the transcript one,
  // which is what made this account-level rather than actor-level. The old
  // pattern matched 402/403 and the word "unauthorised", and this message
  // carries neither, so the one cause a human could fix in a minute arrived
  // as the one class that says nothing.
  //
  // ⚖️ AND IT IS NOT `billing`. A rejected key and an exhausted balance both
  // stop every call, but one is rotated and the other is paid — pooling them
  // would send someone to the wrong page.
  if (/\b401\b|unauthori[sz]ed|invalid token|token .{0,12}(invalid|rejected|expired)|bad credentials/.test(m)) return 'credentials'
  if (/\b(402|403)\b|payment|credit|quota|insufficient|unauthor/.test(m)) return 'billing'
  if (/\b404\b|not found|no such act/.test(m)) return 'actor_missing'
  if (/\b429\b|rate.?limit|too many/.test(m)) return 'rate_limited'
  if (/\b5\d\d\b|timeout|timed out|aborted|socket|econn|network|fetch failed/.test(m)) return 'transient'
  // ⚠️ THIS WAS `unknown` ON ITS FIRST REAL OCCURRENCE, WHICH IS THE ONE CLASS
  // THAT TELLS YOU NOTHING. Measured 2026-09-20 on all ten woodsyleather urls:
  // "Sign in to confirm you're not a bot. Use --cookies-from-browser or
  // --cookies for the authentication." That is not a fact about the video and
  // not a transient blip — it is YouTube refusing this IP, and the action it
  // implies (cookies, or egress that is not a datacenter) is specific enough
  // that pooling it with `unknown` wastes the whole point of classifying.
  if (/not a bot|confirm you.{0,3}re not|sign in to confirm|cookies-from-browser|captcha|are you a robot/i.test(m)) return 'bot_check'
  // ⚠️ A DEACTIVATED ACCOUNT READ AS `unknown`, WHICH SENDS SOMEONE HUNTING FOR
  // A BUG THAT DOES NOT EXIST. Measured 2026-09-20, minutes after the token
  // rotation fixed everything: `profile read failed: Post does not exist` on an
  // Instagram handle whose account the owner had deactivated. The scraper gave
  // the honest answer; the classifier had no word for it, so a settled fact
  // about the account arrived looking like an open question about our code.
  //
  // ⚖️ THIS IS THE FOURTH GAP IN ONE DAY AND THEY ALL HAD ONE SHAPE — a class
  // list written from failures IMAGINED rather than strings production
  // produced (§U). It is also the cheapest possible bug: the run cost nothing,
  // nothing was broken, and the only damage would have been an operator's hour.
  if (/private|removed|region|unavailable|deleted|deactivat|does not exist|no longer (available|exists)|couldn't read that/.test(m)) return 'unavailable'
  // ⚠️ `no audio url found` IS A FACT ABOUT ONE REEL, NOT A FAULT. Fifth gap,
  // measured on the post-rotation recovery run where 18 of 20 videos stored.
  if (/no speech|has no speech|no captions|no_captions|no audio url/.test(m)) return 'no_speech'
  // ⚠️ AN ACTOR THAT STARTS AND DIES IS OURS AND IT IS TRANSIENT. Same run:
  // `YouTube transcript service error 400: {"type":"run-failed","message":
  // "Actor run did not s…` on ONE video of five while the other four stored.
  // A 400 normally means WE sent something wrong, so it must not read as
  // `billing` or `credentials`; `run-failed` says the run itself collapsed,
  // which is exactly what the one retry exists for.
  if (/run-failed|actor run did not|run did not succeed/.test(m)) return 'transient'
  return 'unknown'
}

// ── IS A RETRY WORTH ONE OF THE THREE ATTEMPTS? ─────────────────────────────
//
// ⚠️⚠️ MEASURED END TO END, 2026-09-21. Brand voice 4a64f374's `scrape_dna`
// failed at the voice-synth step, recorded `{"ok": false}` with `status: done`,
// and used 1 of its 3 attempts. Re-queued by hand twenty-four hours later with
// the SAME payload it succeeded in 31 seconds: 42 posts, 21 caption knowledge
// items, 25 transcripts. The store went from 3 rows to 38 and the own
// transcripts from 0 to 18.
//
// So the failure that produced an entire findings document — a five-scene
// script for a sixty-second video, a story force-fitted to reach length, a
// voice that said `ready` over an empty table — was a transient blip with two
// unspent retries sitting behind it. Nothing retried, because the handler
// RETURNED its failure instead of throwing, and a handler that returns settles
// `done`.
//
// ⚖️ AND `unknown` RETRIES, WHICH IS THE UNOBVIOUS PART. Every other class here
// names a cause and most of them name one a retry cannot fix. `unknown` is the
// class that means "we could not tell", and the case this exists for — a voice
// with nothing of its own — is precisely where guessing wrong is cheap in one
// direction and expensive in the other: a wasted attempt costs 30 seconds, a
// missed one costs the creator a voice that never gets built. Bounded by
// `max_attempts` either way.
const RETRY_WORTH: ReadonlySet<TranscriptFailure> = new Set<TranscriptFailure>([
  'rate_limited', // back off and go again — that is what the class means
  'transient',    // 5xx, timeout, socket
  'unknown',      // we could not tell, and the downside is asymmetric
])

/**
 * Whether a scan failure is worth spending another attempt on.
 *
 * ⚠️ SAYS NOTHING ABOUT WHETHER THE CALLER SHOULD RETRY. A voice that already
 * holds the creator's own material has something to fall back on and should
 * keep it rather than churn; only a voice with nothing has anything to gain.
 * That judgement belongs to the caller, which is the one that knows.
 */
export function retryWorthScanFailure(err: unknown): boolean {
  return RETRY_WORTH.has(classifyTranscriptFailure(err))
}
