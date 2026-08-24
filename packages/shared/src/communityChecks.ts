/**
 * THE FIVE CHECKS, AND EVERY ONE REPAIRS RATHER THAN REFUSES.
 *
 * ⚠️ WHY REPAIR IS THE HOUSE PATTERN HERE AND NOT SOMEWHERE ELSE'S TASTE.
 * A community scene is one beat of a script the creator has already paid for and
 * is about to film. Rejecting the whole script over one wrong surface name costs
 * them every good beat in it; the wrong surface costs them one shot they can fix
 * in the moment. So each of these takes a scene that is wrong in a specific,
 * decidable way and hands back one that is right.
 *
 * ⚖️ AND DECIDABLE IS THE WORD THAT MATTERS. None of these asks a model whether
 * something is good. Each is a lookup against the map the creator filled in, so
 * the same script checked twice gets the same answer, and a check that fires can
 * always name which field made it fire.
 */

import {
  needsCovering, mapIsUsable, quotableFigures, surfacesFor,
  type CommunityMap, type CommunityProofItem,
} from './communityMap'
import { BLUR_LINE, SHOT_DIRECTION } from './shotGrammar'

export interface CommunityScene {
  /** Which surface the shot is of. */
  surfaceId?: string | null
  /** What the creator is told to do. */
  direction?: string | null
  /** What they say over it. */
  spoken?: string | null
  proofItem?: CommunityProofItem | null
}

export interface CheckedScene {
  scene: CommunityScene
  /** Which checks changed something. Empty means the scene arrived correct. */
  repairs: readonly string[]
}

/** CHECK 1 — a scene may only name a surface the creator said exists.
 *
 *  ⚠️ THE FALLBACK IS THE ABOUT PAGE AND THAT IS NOT ARBITRARY: it is the URL
 *  they pasted, so it is the one surface that cannot fail to exist. Every
 *  platform catalog is asserted to carry one for exactly this reason. */
function repairSurface(scene: CommunityScene, map: CommunityMap): { scene: CommunityScene; repaired: boolean } {
  const declared = map.surfaceIds ?? []
  const id = scene.surfaceId
  if (typeof id === 'string' && declared.includes(id)) return { scene, repaired: false }
  return { scene: { ...scene, surfaceId: 'about' }, repaired: true }
}

/** ⚠️ ANY RUN OF DIGITS IS A CLAIM. "400" in a spoken line is a number the
 *  creator will say out loud to their audience; if the map does not carry it,
 *  nobody checked it and it must not be spoken.
 *
 *  ⚖️ ORDINALS AND SMALL COUNTING WORDS ARE NOT CLAIMS. "the 1 thing" and "day
 *  2" are turns of phrase, not figures about the business, and treating them as
 *  unsupported would make the check fire constantly and get switched off. */
export function unsupportedFigures(spoken: string | null | undefined, map: CommunityMap | null | undefined): readonly string[] {
  if (typeof spoken !== 'string' || spoken.trim() === '') return Object.freeze([])
  const carried = quotableFigures(map).join(' ')
  const out: string[] = []
  for (const m of spoken.matchAll(/\d[\d,.]*/g)) {
    const figure = m[0]
    // A bare single digit is a turn of phrase far more often than a claim.
    if (/^\d$/.test(figure)) continue
    if (!carried.includes(figure)) out.push(figure)
  }
  return Object.freeze(out)
}

/** CHECK 3 — the covering instruction is present whenever it is owed.
 *
 *  ⚠️ APPENDED DETERMINISTICALLY RATHER THAN REQUESTED. Asking the writer to
 *  remember a privacy line is asking a model to be reliable about the one thing
 *  that must never be unreliable. It is added here, every time, or it is not
 *  there at all. */
function repairCovering(scene: CommunityScene): { scene: CommunityScene; repaired: boolean } {
  if (!needsCovering(scene.surfaceId, scene.proofItem)) return { scene, repaired: false }
  const direction = scene.direction ?? ''
  if (direction.includes(BLUR_LINE)) return { scene, repaired: false }
  return {
    scene: { ...scene, direction: direction.trim() === '' ? BLUR_LINE : `${direction.trim()} ${BLUR_LINE}` },
    repaired: true,
  }
}

/** CHECK 4 — only the join page may be linked.
 *
 *  ⚖️ ONE URL, AND THE REASON IS NOT TIDINESS. A CTA that sends people to an
 *  internal channel link, an invite that expires, or a post URL is a CTA that
 *  breaks silently for everyone who taps it later. The map's `url` is the page
 *  the creator confirmed is public and joinable. */
export function offMapLinks(text: string | null | undefined, map: CommunityMap | null | undefined): readonly string[] {
  if (typeof text !== 'string' || text.trim() === '') return Object.freeze([])
  const allowed = (map?.url ?? '').trim()
  const found = [...text.matchAll(/https?:\/\/[^\s)"'<>]+/gi)].map((m) => m[0].replace(/[.,;:]+$/, ''))
  return Object.freeze(found.filter((u) => u !== allowed))
}

/** CHECK 5 — a community scene is a camera shot or it is not a scene.
 *
 *  ⚠️ THIS IS THE ONE THAT CATCHES THE OLD WORLD LEAKING BACK IN. Twin no longer
 *  directs screen recordings, but a writer that has read a million of them will
 *  produce one eventually, and a creator cannot film it. */
const CAPTURE_PHRASING = /screen[\s-]?record|screen[\s-]?captur|record (?:your|the|my) screen/i

function repairShot(scene: CommunityScene): { scene: CommunityScene; repaired: boolean } {
  const direction = scene.direction ?? ''
  if (!CAPTURE_PHRASING.test(direction)) return { scene, repaired: false }
  return { scene: { ...scene, direction: SHOT_DIRECTION.HOLD_UP }, repaired: true }
}

/**
 * Run all five. Order matters and is stated rather than incidental:
 *
 *  ⚠️ THE SURFACE IS REPAIRED FIRST because covering is decided BY the surface.
 *
 *  ⚖️ AND THE CONSEQUENCE IS MILDER THAN IT FIRST LOOKS, WHICH IS WORTH SAYING
 *  RATHER THAN OVERSTATING. An earlier version of this note claimed the wrong
 *  order would leave a FEED shot uncovered. It cannot: the repair always falls
 *  back to `about`, which is never a surface with other people on it, so the
 *  dangerous direction does not exist. What the wrong order actually produces is
 *  a spurious covering line — an about page told to hide names it does not have.
 *  That is noise rather than exposure, and noise is what teaches creators to skip
 *  the instruction that matters, so the order still stands. The claim is narrowed
 *  because a mutation of the ordering PASSED the first guard written for it.
 */
export function checkCommunityScene(
  scene: CommunityScene,
  map: CommunityMap | null | undefined,
): CheckedScene {
  // ⚖️ NO MAP MEANS NO SCENE, AND NO REPAIR EITHER. There is nothing to repair
  // a scene against, and inventing a surface would be the guess the whole map
  // exists to prevent. The caller drops the scene; the writer stays silent.
  if (!mapIsUsable(map)) return { scene, repairs: Object.freeze(['no_usable_map']) }

  const repairs: string[] = []
  let out = scene

  const surface = repairSurface(out, map!)
  out = surface.scene
  if (surface.repaired) repairs.push('surface_not_in_map')

  const covering = repairCovering(out)
  out = covering.scene
  if (covering.repaired) repairs.push('privacy_line_missing')

  const shot = repairShot(out)
  out = shot.scene
  if (shot.repaired) repairs.push('screen_capture_direction')

  // ⚖️ FIGURES AND LINKS ARE REPORTED, NOT REWRITTEN. Deleting a number from a
  // spoken line leaves a sentence with a hole in it, and silently changing what
  // a creator says is worse than telling them it is unchecked. These two are the
  // checks a human resolves.
  if (unsupportedFigures(out.spoken, map).length > 0) repairs.push('figure_not_in_map')
  if (offMapLinks(out.spoken, map).length > 0) repairs.push('link_not_the_join_page')

  return { scene: out, repairs: Object.freeze(repairs) }
}

/** ⚠️ THE SURFACE CATALOG IS THE AUTHORITY FOR WHAT MAY BE TICKED, so a map
 *  carrying a surface no catalog offers is a map somebody hand-edited or a
 *  platform that changed under us. Reported rather than repaired: dropping it
 *  would silently shrink what the creator said they have. */
export function surfacesNotInCatalog(map: CommunityMap | null | undefined): readonly string[] {
  if (!map) return Object.freeze([])
  const known = new Set(surfacesFor(map.platform).map((s) => s.id))
  return Object.freeze((map.surfaceIds ?? []).filter((id) => !known.has(id)))
}
