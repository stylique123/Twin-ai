/**
 * THE COMMUNITY CAPTURE FLOW: what the creator is asked, in what order, in what
 * words — and what an answer is allowed to become.
 *
 * ⚠️ THIS MODULE HOLDS THE WORDING, NOT THE SCREEN. The Product Library renders
 * it and decides nothing. That split is the same one `productQuestions` already
 * uses, and it exists because wording is the part that has to be TESTED: a
 * question that quietly starts asking for a screen recording, or that lets an
 * unanswered privacy question read as permission, is a defect nobody sees in a
 * screenshot.
 *
 * ⚖️ AND THE THREE STATES SURVIVE THE FORM OR THEY SURVIVE NOWHERE.
 *     absent   — never asked, or skipped. Stays `null`. The writer is SILENT.
 *     explicit — "it's free", "I'd rather not say". A real answer, including a
 *                negative one, and it must never be re-asked.
 *     value    — usable.
 * A form that turns a skipped field into an empty string has destroyed the
 * difference between "nobody asked" and "the answer is nothing", and every
 * downstream check that relies on it is then deciding on a fiction.
 */

import {
  surfacesFor, mapIsUsable,
  type CommunityMap, type CommunityPlatform, type CommunityProofItem, type CommunitySurface,
} from './communityMap'
import type { ShotPrivacy } from './shotGrammar'

/** ⚠️ EVERY STRING A CREATOR READS LIVES HERE, and every one of them is plain
 *  everyday English. A first-time creator with no marketing knowledge has to
 *  understand each choice in under two seconds, and none of these may mention
 *  how Twin works internally — no "surfaces", no "proof items", no "entities".
 *  Those are our words for our machinery, and a creator who has to learn them
 *  is a creator we have handed our problem to. */
export const CAPTURE_COPY = Object.freeze({
  platform: 'Where does your community live?',
  url: 'Paste the link people use to join',
  name: 'What do you call it?',
  /** ⚖️ "OPEN ON YOUR PHONE" IS THE WHOLE TEST, and it is phrased as an action
   *  rather than a capability. "Which pages do you have?" invites a yes about a
   *  page they would have to go and find; "can you open it on your phone" is a
   *  thing they can picture doing while holding the phone. */
  surfaces: 'Which of these can you open on your phone?',
  memberCount: 'How many people are in it?',
  price: 'What does it cost to join?',
  cadence: 'How often do you all meet?',
  proofLabel: 'Is there one post or win you could point at?',
  proofWhere: 'Where is it?',
  proofPrivacy: 'Whose is it?',
})

/** ⚠️ THE ONE PLACE A NUMBER IS ASKED FOR IN THE CREATOR'S OWN WORDS. Twin never
 *  scrapes it: a figure read off a page six weeks ago and repeated as fact is a
 *  wrong number said confidently, which is worse than no number at all. */
export const FIGURE_HINT = 'Say it the way you would say it out loud.'

/** ⚖️ SKIPPING IS OFFERED, AND IT IS NOT THE SAME AS LEAVING IT BLANK. A creator
 *  who does not want to say what it costs must be able to say so and never be
 *  asked again — that is an ANSWER. Leaving the field untouched is ABSENT, and
 *  the writer stays silent about it. Collapsing the two would either nag them
 *  forever or invent a fact they declined to give. */
export const RATHER_NOT_SAY = 'I’d rather not say'

/** The privacy picker, in the only three states that exist.
 *
 *  ⚠️ THE ORDER IS DELIBERATE AND THE UNSURE OPTION IS LAST BUT NOT HIDDEN.
 *  Putting "not sure" first invites it as the lazy default; hiding it entirely
 *  forces a creator who genuinely does not know to claim something untrue. It
 *  sits at the end, plainly worded, and it resolves to `blur`. */
export const PRIVACY_CHOICES: ReadonlyArray<{ value: ShotPrivacy; label: string }> = Object.freeze([
  Object.freeze({ value: 'mine' as ShotPrivacy, label: 'Mine — I posted it' }),
  Object.freeze({ value: 'permitted' as ShotPrivacy, label: 'Someone else’s — I asked, they’re happy' }),
  Object.freeze({ value: 'blur' as ShotPrivacy, label: 'Someone else’s — I haven’t asked' }),
])

export const PLATFORM_CHOICES: ReadonlyArray<{ value: CommunityPlatform; label: string }> = Object.freeze([
  Object.freeze({ value: 'skool' as CommunityPlatform, label: 'Skool' }),
  Object.freeze({ value: 'circle' as CommunityPlatform, label: 'Circle' }),
  Object.freeze({ value: 'discord' as CommunityPlatform, label: 'Discord' }),
  Object.freeze({ value: 'whatsapp' as CommunityPlatform, label: 'WhatsApp group' }),
  Object.freeze({ value: 'telegram' as CommunityPlatform, label: 'Telegram group' }),
  Object.freeze({ value: 'facebook_group' as CommunityPlatform, label: 'Facebook group' }),
  Object.freeze({ value: 'other' as CommunityPlatform, label: 'Somewhere else' }),
])

/** ⚠️ NO COPY MAY ASK FOR A CAPTURE, AND THIS IS ASSERTED RATHER THAN INTENDED.
 *  Twin does not direct screen recordings any more. The wording above is the
 *  last place that rule could be undone by a well-meaning edit, because a form
 *  label is the one string nobody re-reads once it looks fine on screen. */
const CAPTURE_WORDS = /screen[\s-]?record|screen[\s-]?captur|record (?:your|the|my) screen/i

export function copyAsksForACapture(): boolean {
  const all = [
    ...Object.values(CAPTURE_COPY),
    FIGURE_HINT, RATHER_NOT_SAY,
    ...PRIVACY_CHOICES.map((c) => c.label),
    ...PLATFORM_CHOICES.map((c) => c.label),
  ].join(' ')
  return CAPTURE_WORDS.test(all)
}

/** What this creator can tick, given the platform they picked.
 *
 *  ⚖️ THE LABEL IS THE PLATFORM'S OWN WORD FOR THE PAGE, never ours. "The
 *  Classroom tab" is a thing a Skool owner can find in one second; "the
 *  curriculum surface" is a thing they have to translate. */
export function surfaceChoices(platform: CommunityPlatform | null | undefined): readonly CommunitySurface[] {
  return surfacesFor(platform)
}

/** The answers exactly as the form holds them — every optional field genuinely
 *  optional, and `null` meaning nobody answered. */
export interface CaptureAnswers {
  platform?: CommunityPlatform | null
  url?: string | null
  name?: string | null
  surfaceIds?: readonly string[] | null
  memberCount?: string | null
  price?: string | null
  cadence?: string | null
  promise?: string | null
  proofItems?: readonly CommunityProofItem[] | null
}

/** ⚠️ BLANK IS ABSENT, AND WHITESPACE IS BLANK. A field the creator tabbed
 *  through and left with a stray space is not an answer, and storing `" "` would
 *  make `quotableFigures` offer it as a figure a script may speak. */
function answered(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

/**
 * Turn what the form holds into the map that gets stored — or refuse.
 *
 * ⚠️ IT RETURNS null RATHER THAN A HALF-MAP, and that is the point of having a
 * function at all. A map missing its url, its name or its pages is a map
 * `mapIsUsable` will reject downstream anyway; building one here would store a
 * shape that reads as present and behaves as absent, which is the worst of both.
 * The caller keeps the creator on the form instead.
 */
export function buildCommunityMap(a: CaptureAnswers | null | undefined): CommunityMap | null {
  if (!a || typeof a !== 'object') return null
  const platform = a.platform
  const url = answered(a.url)
  const name = answered(a.name)
  const surfaceIds = Array.isArray(a.surfaceIds) ? a.surfaceIds.filter((s) => typeof s === 'string' && s !== '') : []
  if (!platform || !url || !name || surfaceIds.length === 0) return null

  // ⚖️ ONLY SURFACES THE PLATFORM ACTUALLY OFFERS. A creator who picked Skool,
  // ticked the Classroom, then switched to WhatsApp must not carry a Classroom
  // into a map for a platform that has no such page — the writer would name a
  // shot they cannot film. Filtering here means switching platform loses the
  // ticks rather than silently keeping impossible ones.
  const offered = new Set(surfacesFor(platform).map((s) => s.id))
  const kept = surfaceIds.filter((s) => offered.has(s))
  if (kept.length === 0) return null

  // ⚠️ AND A PROOF ITEM ON A PAGE THEY DID NOT TICK IS DROPPED, for the same
  // reason and one more: `needsCovering` decides the privacy line FROM the page,
  // so an item pointing at a page not in the map would be judged against a page
  // that, as far as everything downstream knows, does not exist.
  const proofItems = (a.proofItems ?? []).filter(
    (p) => p && typeof p.label === 'string' && p.label.trim() !== '' && kept.includes(p.surface),
  )

  const map: CommunityMap = {
    platform,
    url,
    name,
    surfaceIds: Object.freeze([...kept]),
    memberCount: answered(a.memberCount),
    price: answered(a.price),
    cadence: answered(a.cadence),
    promise: answered(a.promise),
    proofItems: Object.freeze(proofItems.map((p) => Object.freeze({
      label: p.label.trim(),
      surface: p.surface,
      // ⚠️ THE NULL CHECK PRECEDES NOTHING HERE ON PURPOSE — there is no
      // coercion to guard. An unrecognised privacy value becomes `blur`, never
      // a default drawn from the creator's silence.
      privacy: (p.privacy === 'mine' || p.privacy === 'permitted') ? p.privacy : 'blur',
    }))),
  }

  // ⚖️ THE LAST WORD BELONGS TO THE READER'S OWN TEST, not to this builder.
  // If `mapIsUsable` would reject it, storing it is storing a map that every
  // consumer will refuse — so it is refused once, here, where the creator is
  // still looking at the form and can fix it.
  return mapIsUsable(map) ? map : null
}

/** What is still missing, in the creator's words, so the form can say WHY the
 *  button is disabled instead of just disabling it.
 *
 *  ⚠️ A DISABLED BUTTON WITH NO REASON IS THE FLOW'S OLDEST BUG, and it has
 *  already been fixed once in this file's neighbour: the submit gate used to
 *  demand a field that was never rendered, so the creator saw a dead button and
 *  nothing to fill in. Naming the gap is what stops that recurring. */
export function whatIsMissing(a: CaptureAnswers | null | undefined): readonly string[] {
  const out: string[] = []
  if (!a?.platform) out.push(CAPTURE_COPY.platform)
  if (!answered(a?.url)) out.push(CAPTURE_COPY.url)
  if (!answered(a?.name)) out.push(CAPTURE_COPY.name)
  const offered = new Set(surfacesFor(a?.platform).map((s) => s.id))
  const kept = (a?.surfaceIds ?? []).filter((s) => offered.has(s))
  if (kept.length === 0) out.push(CAPTURE_COPY.surfaces)
  return Object.freeze(out)
}
