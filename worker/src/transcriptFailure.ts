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
  if (/private|removed|region|unavailable|deleted|couldn't read that/.test(m)) return 'unavailable'
  if (/no speech|has no speech|no captions|no_captions|no audio url/.test(m)) return 'no_speech'
  // ⚠️ AN ACTOR THAT STARTS AND DIES IS OURS AND IT IS TRANSIENT. Measured
  // 2026-09-20: `YouTube transcript service error 400: {"type":"run-failed",
  // "message":"Actor run did not s…` on ONE video of five while the other four
  // stored. A 400 normally means we sent something wrong, so it must not read
  // as `billing` or `credentials`; `run-failed` says the run itself collapsed,
  // which is exactly what the one retry exists for.
  if (/run-failed|actor run did not|run did not succeed/.test(m)) return 'transient'
  return 'unknown'
}
