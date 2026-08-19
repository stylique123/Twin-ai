// ⚠️ ITS OWN MODULE BECAUSE IT MUST BE TESTABLE FOR REAL. `media.ts` imports
// `env.ts`, which throws on a missing `SUPABASE_URL` at module load, so every
// test of anything inside it is reduced to reading the file as a string and
// matching regexes. That is adequate for "the loop is bounded" and useless for
// "is a timeout a private account?" — the question this file exists to answer,
// and the one where a wrong answer accuses a creator of something untrue.

// ── IS IT WORTH ASKING AGAIN? ─────────────────────────────────────────────
//
// ⚠️ A THIRTY-SECOND TIMEOUT IS NOT A FACT ABOUT THE CREATOR'S ACCOUNT. It is a
// fact about one Apify run on one afternoon, and `hamzaachishti` returning real
// posts through identical input proved the reader itself is sound. Failing the
// whole scan on it hands somebody with thousands of public posts a screen
// telling them to make their account public.
//
// ⚖️ AND THE OPPOSITE ERROR COSTS MORE THAN THE RETRY. Paying for a second
// Actor run is cheap; the budget rule this repo runs on is "pay again only when
// reprocessing changes a decision Twin will actually make", and the decision
// here is whether to tell a creator their account is unreadable. That is the
// clearest case the rule has.
//
// ⚠️ SO THE CLASSIFIER DEFAULTS TO RETRYING, NOT TO GIVING UP. `permanent` is
// returned only when the message POSITIVELY names a condition a retry cannot
// fix. Anything else — including wording we have never seen — is retried, because
// this Actor has already been caught labelling a timeout "Empty or private
// data", and its guesses have not earned the benefit of the doubt.
const PERMANENT_CAUSE =
  /\b(private account|is private|not found|no such user|does not exist|user not found|account (?:has been )?(?:disabled|deactivated|suspended|banned)|invalid (?:url|username|profile))\b/i

export const READ_VERDICTS = ['permanent', 'retry'] as const
export type ReadVerdict = (typeof READ_VERDICTS)[number]

/** ⚖️ NAMED AND EXPORTED SO A TEST CAN ARGUE WITH THE LIST rather than with a
 *  regex buried inside a retry loop. */
export function readVerdict(detail: string): ReadVerdict {
  return PERMANENT_CAUSE.test(detail) ? 'permanent' : 'retry'
}

