// IS THIS THE ACCOUNT THEY MEANT?
//
// Inlined from `packages/shared/src/scanTargetConfirmation.ts` (the worker has
// no runtime dep on @twinai/shared — see directorContract.ts), where the full
// rationale and its tests live. `scanTargetParity.test.ts` fails if they drift.
//
// ⚠️ THE SHARED MODULE SHIPPED WITH NO READER. It had tests, it ran in CI, and
// nothing in worker/, supabase/ or apps/ ever imported it — so the defect it
// was written for stayed live the entire time it looked covered. A contract
// with no consumer is worse than an absent one, because the suite reports it
// green. This file is that reader.
//
// ⚖️ AND IT IS ADVISORY HERE, ON PURPOSE. The shared module also offers
// `mayBuildDnaFrom`, which requires an explicit human confirmation. Turning
// that on now would make every scan wait for a confirmation step this flow does
// not have, stopping all DNA builds — a product decision wearing a refactor's
// clothes. `mayBuildDnaFrom` is deliberately NOT copied here; it arrives with
// the screen that lets a creator answer it.

/** What a scan tells us about the account it landed on. */
export interface ScanTargetFacts {
  /** The handle we were asked to scan, without the leading @. */
  requestedHandle: string
  /** The handle the platform actually resolved to, if any. */
  resolvedHandle: string | null
  /** The display name on the account. */
  displayName: string | null
  /** Followers/subscribers. `null` means NOT READ, which is not zero. */
  audience: number | null
  /** Total posts on the account. `null` means not read. */
  postCount: number | null
  /** One recent title, so a human recognises the account instantly. */
  sampleTitle: string | null
  /** True when the platform said no such account. */
  missing: boolean
}

export const TARGET_VERDICTS = ['missing', 'suspect', 'plausible'] as const
export type TargetVerdict = (typeof TARGET_VERDICTS)[number]

export const SUSPICION_CODES = [
  /** The handle resolved to a different handle than the one asked for. */
  'handle_redirected',
  /** The display name shares nothing with the handle that was asked for. */
  'name_unrelated_to_handle',
  /** The account exists and has posted nothing — nothing to build a voice from. */
  'no_posts',
  /** A recent post credits a DIFFERENT account, the tell in the real case. */
  'credits_another_account',
] as const
export type SuspicionCode = (typeof SUSPICION_CODES)[number]

export interface ScanTargetAssessment {
  verdict: TargetVerdict
  codes: SuspicionCode[]
  /** Rendered for a human to confirm or reject. Never auto-accepted. */
  summary: string
}

/** Comparable form: lowercase, letters and digits only. `@Carter_PCs` and
 *  `carterpcs` are the same handle written two ways. */
function fold(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Does the display name relate to the handle at all?
 *  ⚖️ Containment either way, not equality — "Johnny" for `@johnnyytech` and
 *  "CarterPCs" for `@actuallycarterpcs` are both obviously the same person, and
 *  a stricter rule would flag every legitimate account as suspect. */
function nameRelatesToHandle(displayName: string, handle: string): boolean {
  const n = fold(displayName)
  const h = fold(handle)
  if (n.length === 0 || h.length === 0) return true
  if (n.includes(h) || h.includes(n)) return true
  // A short distinctive stem is enough: "carterpcs" vs "actuallycarterpcs".
  const stem = n.length >= 5 ? n.slice(0, 5) : n
  return h.includes(stem)
}

/** ⚠️ The literal tell from the real case: the channel called "five" had the
 *  title "I just want a PC from carter @actuallycarterpcs". An account that
 *  points at another account is not the account you were looking for. */
function creditsAnother(sampleTitle: string, requestedHandle: string): string | null {
  for (const m of sampleTitle.matchAll(/@([A-Za-z0-9._-]{3,})/g)) {
    if (fold(m[1]) !== fold(requestedHandle)) return m[1]
  }
  return null
}

export function assessScanTarget(facts: ScanTargetFacts): ScanTargetAssessment {
  if (facts.missing) {
    return {
      verdict: 'missing',
      codes: [],
      summary: `No account found at @${facts.requestedHandle}. Check the spelling, or open the`
        + ' profile and copy the handle from the address bar.',
    }
  }

  const codes: SuspicionCode[] = []
  if (facts.resolvedHandle && fold(facts.resolvedHandle) !== fold(facts.requestedHandle)) {
    codes.push('handle_redirected')
  }
  if (facts.displayName && !nameRelatesToHandle(facts.displayName, facts.requestedHandle)) {
    codes.push('name_unrelated_to_handle')
  }
  // `null` is NOT READ and must not read as zero — the three-state rule this
  // repo applies everywhere else. Only a measured 0 means nothing was posted.
  if (facts.postCount === 0) codes.push('no_posts')
  const credited = facts.sampleTitle ? creditsAnother(facts.sampleTitle, facts.requestedHandle) : null
  if (credited) codes.push('credits_another_account')

  // ⚖️ AUDIENCE SIZE IS SHOWN AND NEVER JUDGED. It is the single most useful
  // fact for a human deciding "is that mine?", and the single worst thing to
  // threshold on — a small account is a new creator, not an impostor.
  const bits = [
    `@${facts.resolvedHandle ?? facts.requestedHandle}`,
    facts.displayName ? `"${facts.displayName}"` : null,
    facts.audience === null ? 'audience not read' : `${facts.audience.toLocaleString('en-US')} followers`,
    facts.postCount === null ? null : `${facts.postCount} posts`,
  ].filter(Boolean)
  let summary = `Found ${bits.join(' · ')}.`
  if (facts.sampleTitle) summary += ` Most recent: "${facts.sampleTitle}".`
  summary += codes.length
    ? ' ⚠️ This may not be the account you meant — check it before we build from it.'
    : ' Is this you?'
  if (credited) summary += ` It credits @${credited}, which may be the account you want.`

  return { verdict: codes.length ? 'suspect' : 'plausible', codes, summary }
}
