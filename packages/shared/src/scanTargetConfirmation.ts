// IS THIS THE ACCOUNT THEY MEANT?
//
// ⚠️ THE DEFECT, WITH REAL NUMBERS. On 2026-08-11 a scan was run against
// `@CarterPCs`, supplied as a handle for the tech creator CarterPCs. The handle
// resolves — YouTube returns a real channel — but it is a channel called "five"
// with 146 subscribers and 3 videos, two of which credit `@actuallycarterpcs`.
// The creator meant the 3,150,000-subscriber account. A DNA scan would have
// succeeded, built a voice from a stranger's three videos, and reported no error
// at any point.
//
// This is the THIRD time this class has appeared. The original creator pack had
// 9 of 12 handles wrong and 3 on the wrong platform. Nothing has ever checked.
//
// ── WHY THIS IS NOT A GUARD THAT AUTO-REJECTS ─────────────────────────────
//
// ⚖️ "SMALL MEANS WRONG" IS NOT SOUND, and encoding it would be worse than the
// bug. A creator with 146 subscribers is a real customer — this product exists
// for people who are not famous yet. An automatic threshold would refuse the
// people who need it most while passing any well-followed impostor.
//
// What was actually detectable about the CarterPCs case is not size. It is that
// the SIGNALS DISAGREE: a handle saying "CarterPCs" resolving to a display name
// saying "five". That is a reason to ASK, never a reason to refuse.
//
// So this module produces the facts a human needs to confirm the account, and
// marks the cases where something looks off. The decision stays with the person
// who knows which account they meant. Same shape as every other answer in this
// system: show what was found, say how sure we are, let them correct it.

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

/** Nothing may be built from an unconfirmed target — the whole point.
 *  ⚖️ `plausible` is NOT `confirmed`: it means nothing looked wrong, which is a
 *  far weaker claim than a person saying "yes, that is me". */
export function mayBuildDnaFrom(a: ScanTargetAssessment, confirmedByCreator: boolean): boolean {
  if (a.verdict === 'missing') return false
  return confirmedByCreator
}
