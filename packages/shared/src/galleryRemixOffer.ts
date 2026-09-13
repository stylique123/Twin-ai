// A REMIX BUTTON UNDER A CARD WE CANNOT REMIX IS A LIE, AND IT IS CURRENTLY ON
// 365 CARDS.
//
// ⚠️ MEASURED IN PRODUCTION 2026-09-13: `gallery_items` holds 4,745 TikTok,
// 1,034 YouTube and 365 Instagram cards — 93 of the Instagram ones visible — and
// every card in the gallery renders "Remix in my voice" underneath it.
//
// ⚠️ AND SINCE #841 THAT BUTTON HAS A KNOWN ENDING. Remix navigates to
// `/app?ref=<url>`, which ingests the link; for Instagram the studio now refuses
// it immediately, because 60 of 60 Instagram media fetches have failed with one
// identical error and not one has ever reached a transcript. So the gallery
// invites a creator into a refusal we can predict before they click.
//
// ⚖️ THE CARD STAYS; THE PROMISE GOES. Hiding the video would throw away real
// inspiration a person can still watch — the honest fix is to stop offering the
// one thing we cannot do, and to say why. "Offering a filter is fine; putting a
// remix button under an unbuildable card is the lie."
//
// ⚖️ AND THE SENTENCE IS IMPORTED, NEVER RETYPED. It is the same sentence the
// studio gives for the same refusal. Two surfaces explaining one limit in two
// wordings is how a creator concludes they hit two different problems.
import { platformIsUnreadable } from './gate/talkingHeadFit'
import { REFERENCE_UNREAD_TEXT } from './referenceAnalysis'

export type RemixOffer =
  /** Offer it. Nothing known says this cannot be read. */
  | { kind: 'offer' }
  /** Do not offer it, and say this instead. */
  | { kind: 'refused'; because: string }

/**
 * Whether a gallery card may carry a remix button.
 *
 * ⚠️ THE DEFAULT IS `offer`, AND THAT IS DELIBERATE. Most of what makes a video
 * un-remixable — a factory tour, a podcast stitch, anything that is not a person
 * talking to a phone — is NOT KNOWN for a gallery card: `requirements_source` is
 * populated on 95 of 6,144, and deciding it needs a download we have not done.
 * Refusing on a suspicion would hide most of the gallery to avoid one bad click.
 *
 * ⚖️ SO THIS REFUSES ONLY WHAT IS ALREADY PROVEN, which today is exactly one
 * thing: a platform whose media we have never once been able to read. The list
 * is `UNREADABLE_PLATFORMS`, it is a confession rather than a policy, and it is
 * meant to shrink.
 */
export function remixOffer(platform: string | null | undefined): RemixOffer {
  if (platformIsUnreadable(platform)) {
    return { kind: 'refused', because: REFERENCE_UNREAD_TEXT.platform_unreadable }
  }
  return { kind: 'offer' }
}

/** ⚖️ THE BLURB PROMISES THE BUTTON, so where the button goes, the promise goes.
 *  The gallery's fallback copy reads "Tap Remix and TwinAI rebuilds its hook…" —
 *  on a refused card that sentence describes something that will not happen. */
export function mayPromiseRemix(platform: string | null | undefined): boolean {
  return remixOffer(platform).kind === 'offer'
}
