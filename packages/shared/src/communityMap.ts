/**
 * THE COMMUNITY MAP: which surfaces exist, what each proves, and which the
 * creator may show.
 *
 * ⚠️ A COMMUNITY IS NOT ONE THING TO FILM, which is what makes it different from
 * every other product type. A book is the book. A dashboard is the dashboard. A
 * community is an about page AND a feed AND a classroom AND a calendar AND one
 * pinned win, and each proves something different — legitimacy, activity,
 * curriculum value, cadence, results. "Show your community" leaves the creator
 * to pick, so they open the feed, which is the weakest of them.
 *
 * ⚖️ AND THE CATALOG IS PRE-BAKED PER PLATFORM SO THE CREATOR TICKS RATHER THAN
 * TYPES. Twenty seconds of checkboxes turns "show your community" into "open
 * your Skool Classroom tab". A free-text box would produce surface names no
 * writer could match against and no check could verify.
 */

import type { ShotPrivacy } from './shotGrammar'

export const COMMUNITY_PLATFORMS = [
  'skool', 'circle', 'discord', 'whatsapp', 'telegram', 'facebook_group', 'other',
] as const
export type CommunityPlatform = (typeof COMMUNITY_PLATFORMS)[number]

/** One page the creator can open on their phone, and what showing it proves. */
export interface CommunitySurface {
  /** Stable id — what the writer names and the checks verify against. */
  id: string
  /** What the creator reads on the checkbox. Plain, concrete, one page. */
  label: string
  /** Why this surface is worth a beat. The writer picks by this, not by taste. */
  proves: string
}

const SKOOL: readonly CommunitySurface[] = Object.freeze([
  Object.freeze({ id: 'about', label: 'The About page', proves: 'legitimacy' }),
  Object.freeze({ id: 'feed', label: 'The community feed', proves: 'activity' }),
  Object.freeze({ id: 'classroom', label: 'The Classroom tab', proves: 'what they actually get' }),
  Object.freeze({ id: 'calendar', label: 'The Calendar', proves: 'cadence' }),
  Object.freeze({ id: 'leaderboard', label: 'The Leaderboard', proves: 'engagement' }),
  Object.freeze({ id: 'win_post', label: 'A pinned win post', proves: 'results' }),
])

const CIRCLE: readonly CommunitySurface[] = Object.freeze([
  Object.freeze({ id: 'about', label: 'The landing page', proves: 'legitimacy' }),
  Object.freeze({ id: 'feed', label: 'A Space feed', proves: 'activity' }),
  Object.freeze({ id: 'calendar', label: 'Events', proves: 'cadence' }),
  Object.freeze({ id: 'classroom', label: 'Courses', proves: 'what they actually get' }),
  Object.freeze({ id: 'members', label: 'The members grid', proves: 'scale' }),
])

const DISCORD: readonly CommunitySurface[] = Object.freeze([
  Object.freeze({ id: 'about', label: 'The server icon and member count', proves: 'scale' }),
  Object.freeze({ id: 'channels', label: 'The channel list', proves: 'how it is organised' }),
  Object.freeze({ id: 'feed', label: 'One busy channel', proves: 'activity' }),
  Object.freeze({ id: 'calendar', label: 'The Events tab', proves: 'cadence' }),
])

const CHAT_APP: readonly CommunitySurface[] = Object.freeze([
  Object.freeze({ id: 'about', label: 'The group info — name and member count', proves: 'scale' }),
  Object.freeze({ id: 'feed', label: 'An active chat', proves: 'activity' }),
  Object.freeze({ id: 'win_post', label: 'The pinned message', proves: 'what it is for' }),
])

const FACEBOOK_GROUP: readonly CommunitySurface[] = Object.freeze([
  Object.freeze({ id: 'about', label: 'The About section', proves: 'legitimacy' }),
  Object.freeze({ id: 'feed', label: 'The group feed', proves: 'activity' }),
  Object.freeze({ id: 'members', label: 'The member count in the header', proves: 'scale' }),
])

/** ⚖️ `other` GETS THE COMMON THREE RATHER THAN NOTHING. Every community
 *  platform has a front door, a place things happen, and something pinned. A
 *  creator on a platform we have not catalogued should still get a shot list. */
const OTHER: readonly CommunitySurface[] = Object.freeze([
  Object.freeze({ id: 'about', label: 'The page people land on', proves: 'legitimacy' }),
  Object.freeze({ id: 'feed', label: 'Where the conversation happens', proves: 'activity' }),
  Object.freeze({ id: 'win_post', label: 'Anything pinned or highlighted', proves: 'results' }),
])

const CATALOG: Record<CommunityPlatform, readonly CommunitySurface[]> = {
  skool: SKOOL,
  circle: CIRCLE,
  discord: DISCORD,
  whatsapp: CHAT_APP,
  telegram: CHAT_APP,
  facebook_group: FACEBOOK_GROUP,
  other: OTHER,
}

/** What this creator can be asked to tick. Never a free-text box: a surface the
 *  writer cannot name is a surface no check can verify. */
export function surfacesFor(platform: CommunityPlatform | null | undefined): readonly CommunitySurface[] {
  if (!platform || !(platform in CATALOG)) return OTHER
  return CATALOG[platform]
}

/** ⚠️ SURFACES THAT CONTAIN OTHER PEOPLE. Filming these without covering names
 *  publishes a member's words to an audience that member never agreed to. The
 *  set is explicit rather than inferred from the label, because a label can be
 *  reworded and a privacy rule must not change when it is. */
export const SURFACES_WITH_OTHER_PEOPLE: readonly string[] =
  Object.freeze(['feed', 'members', 'leaderboard', 'channels'])

/** One specific thing worth pointing at. Generic feeds are weak; artifacts
 *  convert. */
export interface CommunityProofItem {
  label: string
  /** Which surface it lives on — must be a surface that exists in the map. */
  surface: string
  /** ⚠️ UNANSWERED IS `blur`, ALWAYS. Nothing ships assuming permission from
   *  somebody who was never asked. */
  privacy: ShotPrivacy
}

export interface CommunityMap {
  platform: CommunityPlatform
  /** The join or about page. ⚖️ THE ONLY URL A CTA MAY CARRY. */
  url: string
  name: string
  /** ⚠️ AS THE CREATOR STATED IT. Never scraped-then-stale: a number Twin read
   *  off a page six weeks ago and repeats as fact is a wrong number said
   *  confidently. */
  memberCount?: string | null
  /** "free" is an ANSWER. null is unanswered. The three states again. */
  price?: string | null
  promise?: string | null
  cadence?: string | null
  surfaceIds?: readonly string[] | null
  proofItems?: readonly CommunityProofItem[] | null
}

/** ⚠️ ABSENT IS NOT PERMISSION, and this is the only place that decides it.
 *  A `?? 'mine'` anywhere else would invent consent. */
export function privacyOfProofItem(item: Pick<CommunityProofItem, 'privacy'> | null | undefined): ShotPrivacy {
  const p = item?.privacy
  return p === 'mine' || p === 'permitted' ? p : 'blur'
}

/** Does a shot of this surface need the covering instruction?
 *
 *  ⚖️ TWO WAYS TO EARN A YES, AND EITHER IS ENOUGH. The surface holds other
 *  people, OR the proof item on it is not the creator's own and not permitted.
 *  Requiring both would let a feed shot ship uncovered whenever the creator
 *  happened to name their own post on it. */
export function needsCovering(
  surfaceId: string | null | undefined,
  item?: Pick<CommunityProofItem, 'privacy'> | null,
): boolean {
  const surfaceHoldsPeople = typeof surfaceId === 'string' && SURFACES_WITH_OTHER_PEOPLE.includes(surfaceId)
  if (!surfaceHoldsPeople) return false
  return privacyOfProofItem(item) === 'blur'
}

/** ⚠️ A MAP WITH NO SURFACES IS NOT A MAP, and the writer must stay silent
 *  rather than invent one. This is the check that decides whether a community
 *  scene may be written at all. */
export function mapIsUsable(map: CommunityMap | null | undefined): boolean {
  if (!map || typeof map !== 'object') return false
  if (typeof map.url !== 'string' || map.url.trim() === '') return false
  if (typeof map.name !== 'string' || map.name.trim() === '') return false
  return Array.isArray(map.surfaceIds) && map.surfaceIds.length > 0
}

/** ⚠️ EVERY NUMBER A SCRIPT SAYS MUST EXIST IN THE MAP. "400 founders" may only
 *  be spoken if memberCount says so — this is what makes a community fact a
 *  checkable product fact rather than a sentence the model liked the sound of. */
export function quotableFigures(map: CommunityMap | null | undefined): readonly string[] {
  if (!mapIsUsable(map)) return Object.freeze([])
  const out: string[] = []
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim() !== '') out.push(v.trim())
  }
  push(map!.memberCount)
  push(map!.price)
  push(map!.cadence)
  return Object.freeze(out)
}
