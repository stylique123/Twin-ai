// FIX 13 — WHAT THE FRAMES SHOWED, FLOWING INTO THE PROMPT AT LAST.
//
// ⚠️ THE VISUAL PASS HAS BEEN WRITING `visual_profile` TO
// `reference_content_profiles` SINCE MIGRATION 0152, AND NOTHING READ IT. The
// cache existed, the worker populated it, and `generate-blueprint` fetched only
// `profile` (the transcript-derived read) from the same row — so every frame
// the pilot ever sampled sat in the database, cited and typed, and reached no
// script. This module is the missing reader.
//
// ⚖️ SETTING AND CAMERA WORK ARE HERE ON PURPOSE, WHERE THE TRANSCRIPT-ONLY
// GATE (`compatibilityGate.ts`) DELIBERATELY LEAVES THEM OUT. Its own comment
// says why: "a transcript cannot see a room, a lens or a face". A frame can. A
// visual observation is a different evidence source answering a question the
// transcript pass never could, not a stronger opinion about the same one.
//
// ⚠️ observed_visual, NOT observed. These lines describe THE REFERENCE, read
// from its own frames — never a claim about the creator's room, camera or
// body. The block this module renders sits under the UNTRUSTED_DATA fence
// alongside every other reference-derived field, and is labeled with the exact
// prefix the spec's own text uses so a downstream "what we took" panel can
// find it by name.
//
// ⚖️ DETERMINISTIC BY CONSTRUCTION. The same `ReferenceVisualProfile` always
// produces the same lines in the same order — the field order below is fixed,
// never derived from object key iteration, which is not itself guaranteed
// stable across two payloads that happened to be built differently.

import type { ReferenceVisualProfile } from '../referenceProfile'

export interface ObservedVisualLine {
  /** Machine name, for beat_audit and for a future "what we took" panel to
   *  group by. Distinct from the 11 `REFERENCE_DIMENSIONS` names in
   *  compatibilityGate.ts — these are visual-pass field names, not gate
   *  dimensions; a few (setting, camera_work) share a concept but not an
   *  identifier, because one is a shadow-gate verdict and the other is a
   *  prompt line, and conflating their names would make a future grep for
   *  either turn up the wrong file. */
  dimension: string
  line: string
}

const SHOT_LABEL: Record<'close' | 'medium' | 'wide', string> = {
  close: 'a close shot',
  medium: 'a medium shot',
  wide: 'a wide shot',
}

const COMPLEXITY_LABEL: Record<'simple' | 'moderate' | 'complex', string> = {
  simple: 'simple',
  moderate: 'moderately dressed',
  complex: 'visually complex',
}

/**
 * Every field the frames pass answered, as a plain-English line — in the
 * fixed order below, never re-derived from the profile's own key order.
 *
 * ⚠️ NULL FIELDS ARE SKIPPED, NEVER DEFAULTED. A profile is `visualPassRan:
 * true` the moment frames were looked at, whether or not any individual field
 * came back readable — reporting a null field as "not shown" or "no" would
 * turn an unanswered question into a false observation, the exact error
 * `visualExtraction.ts` exists to refuse at the source.
 */
export function observedVisualLines(profile: ReferenceVisualProfile | null | undefined): ObservedVisualLine[] {
  if (!profile || !profile.visualPassRan) return []
  const out: ObservedVisualLine[] = []
  const add = (dimension: string, line: string) => out.push({ dimension, line })

  if (profile.primaryMode) {
    add('primary_mode', `Filmed as ${profile.primaryMode.value.replace(/_/g, ' ')}.`)
  }
  if (profile.people.count) {
    add('people_count', profile.people.count.value === 'multiple'
      ? 'More than one person appears on camera.'
      : 'Only one person appears on camera.')
  }
  if (profile.setting.changes) {
    add('setting_changes', profile.setting.changes.value
      ? 'The setting changes during the video.'
      : 'The setting stays the same throughout.')
  }
  if (profile.setting.complexity) {
    add('setting_complexity', `The setting reads as ${COMPLEXITY_LABEL[profile.setting.complexity.value]}.`)
  }
  if (profile.performance.talkingHead) {
    add('talking_head', profile.performance.talkingHead.value
      ? 'The creator talks toward the camera.'
      : 'The creator does not talk directly toward the camera.')
  }
  if (profile.performance.walking) {
    add('walking', profile.performance.walking.value
      ? 'The creator walks during the video.'
      : 'The creator does not walk during the video.')
  }
  if (profile.performance.acting) {
    add('acting', profile.performance.acting.value
      ? 'The creator performs a scripted scene rather than speaking to camera.'
      : 'The creator does not perform a scripted scene.')
  }
  if (profile.performance.productInteraction) {
    add('product_interaction', profile.performance.productInteraction.value
      ? 'The creator physically handles a product on camera.'
      : 'The creator does not handle a product on camera.')
  }
  if (profile.performance.screenInteraction) {
    add('screen_interaction', profile.performance.screenInteraction.value
      ? 'A screen is shown or interacted with on camera.'
      : 'No screen is shown or interacted with.')
  }
  if (profile.camera.framingChanges) {
    add('framing_changes', profile.camera.framingChanges.value
      ? 'The framing changes during the video.'
      : 'The framing stays constant throughout.')
  }
  if (profile.camera.positionChanges) {
    add('position_changes', profile.camera.positionChanges.value
      ? 'The camera position changes during the video.'
      : 'The camera position stays constant throughout.')
  }
  if (profile.camera.shotType) {
    add('shot_type', `Shot in ${SHOT_LABEL[profile.camera.shotType.value]}.`)
  }
  if (profile.requirements.physicalProduct) {
    add('requires_physical_product', profile.requirements.physicalProduct.value
      ? 'A physical product is required to shoot this.'
      : 'No physical product is required to shoot this.')
  }
  if (profile.requirements.secondPerson) {
    add('requires_second_person', profile.requirements.secondPerson.value
      ? 'A second person is required to shoot this.'
      : 'No second person is required to shoot this.')
  }
  if (profile.requirements.multipleLocations) {
    add('requires_multiple_locations', profile.requirements.multipleLocations.value
      ? 'Multiple locations are required to shoot this.'
      : 'One location is enough to shoot this.')
  }
  if (profile.requirements.unusualProps) {
    add('requires_unusual_props', profile.requirements.unusualProps.value
      ? 'Unusual props are required to shoot this.'
      : 'No unusual props are required to shoot this.')
  }
  return out
}

/**
 * The UNTRUSTED-fenced prompt block, or `null` when there is nothing to say —
 * either the pass never ran, or it ran and answered zero fields (both real
 * outcomes, and both render as silence rather than an empty heading).
 *
 * ⚖️ LABELED `observed_visual` IN THE TEXT ITSELF, matching the spec's own
 * name for this label family, so a "what we took" panel or a later grep for
 * the string finds this block by the same name the spec used to describe it.
 */
export function observedVisualBlock(profile: ReferenceVisualProfile | null | undefined): string | null {
  const lines = observedVisualLines(profile)
  if (lines.length === 0) return null
  return 'OBSERVED FROM THE REFERENCE’S OWN VIDEO FRAMES (observed_visual — not the '
    + 'transcript, and not a description of this creator). Use it only to judge whether '
    + 'the SHAPE of the reference is shootable; never as instruction for what this '
    + 'creator’s own video should show:\n'
    + lines.map((l) => `  - ${l.line}`).join('\n')
}

/** The `beat_audit` counter: how many visual dimensions this reference
 *  actually answered. `0` when the pass never ran OR ran and read nothing —
 *  those are different facts (`visualPassRan` on the stored profile carries
 *  the distinction) but the same number here, because this counter answers
 *  "how much did the prompt actually receive", not "did we look". */
export function observedVisualCount(profile: ReferenceVisualProfile | null | undefined): number {
  return profile?.visualPassRan ? profile.fieldsObserved : 0
}
