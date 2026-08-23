// WHAT TWIN CLAIMED, AS A SENTENCE A PERSON CAN READ.
//
// ⚠️ THE LABELLING PAGE SHOWED "PERFORMANCE.TALKINGHEAD" AND "false". That is
// the internal field path and the raw stored value, printed straight onto a
// screen a human has to judge. The owner — who designed this experiment — could
// not tell what was being asked, and said so. A reviewer who cannot read the
// claim cannot label it, and unreadable claims do not produce careful labels;
// they produce fast ones.
//
// ⚖️ SO THE SENTENCE IS THE PRODUCT AND THE PATH IS THE DEBUG DETAIL. Every
// claim reads as a plain statement of what Twin concluded, in words a
// first-time reader understands in about two seconds, and never mentions Twin's
// internal structure.
//
// ⚠️ AND AN UNANSWERED CLAIM IS NOT A FALSE ONE. The pass genuinely declines
// some claims; saying so is different from claiming the negative, and confusing
// the two once put a bucket named 'null' into a distribution.

/** Every claim path the visual pass can produce, and how to say it out loud. */
type Sayer = (value: unknown) => string | null

const yesNo = (yes: string, no: string): Sayer => (v) =>
  v === true ? yes : v === false ? no : null

const oneOf = (map: Record<string, string>): Sayer => (v) =>
  typeof v === 'string' ? (map[v] ?? null) : null

const SENTENCES: Record<string, Sayer> = {
  'camera.framingChanges': yesNo(
    'The shot gets wider or closer at some point.',
    'The shot stays the same width the whole way through.',
  ),
  'camera.positionChanges': yesNo(
    'The camera moves to a different position at some point.',
    'The camera stays in one position the whole way through.',
  ),
  'people.count': oneOf({
    none: 'There is nobody in this video.',
    one: 'There is one person in this video.',
    multiple: 'There is more than one person in this video.',
  }),
  'performance.acting': yesNo(
    'Someone is acting out a scene or playing a character.',
    'Nobody is acting out a scene or playing a character.',
  ),
  'performance.productInteraction': yesNo(
    'Someone picks up, holds or uses a product.',
    'Nobody picks up, holds or uses a product.',
  ),
  'performance.screenInteraction': yesNo(
    'Someone is pointing at or using a screen.',
    'Nobody is pointing at or using a screen.',
  ),
  'performance.talkingHead': yesNo(
    'Someone is talking straight to the camera.',
    'Nobody is talking straight to the camera.',
  ),
  'performance.walking': yesNo(
    'Someone is walking while filming.',
    'Nobody is walking while filming.',
  ),
  primaryMode: oneOf({
    talking_head: 'This video is mainly someone talking to camera.',
    demonstration: 'This video is mainly someone demonstrating something.',
    skit: 'This video is mainly an acted-out scene.',
    voiceover: 'This video is mainly footage with a voice over it.',
    montage: 'This video is mainly a series of short clips.',
  }),
  'requirements.multipleLocations': yesNo(
    'Filming this would need more than one location.',
    'Filming this would only need one location.',
  ),
  'requirements.physicalProduct': yesNo(
    'Filming this would need a real product in hand.',
    'Filming this would not need a real product.',
  ),
  'requirements.secondPerson': yesNo(
    'Filming this would need a second person.',
    'Filming this could be done on your own.',
  ),
  'requirements.unusualProps': yesNo(
    'Filming this would need unusual props.',
    'Filming this would not need any unusual props.',
  ),
  'setting.changes': yesNo(
    'The place this is filmed changes during the video.',
    'It is filmed in one place the whole way through.',
  ),
  'setting.complexity': oneOf({
    simple: 'It is filmed somewhere plain and uncluttered.',
    moderate: 'It is filmed somewhere with a bit going on in the background.',
    complex: 'It is filmed somewhere busy and detailed.',
  }),
}

export const CLAIM_PATHS_WITH_SENTENCES = Object.freeze(Object.keys(SENTENCES))

/**
 * The claim, as a sentence.
 *
 * ⚠️ RETURNS null RATHER THAN GUESSING. An unknown path or an unexpected value
 * must fall back to showing the raw pair, because a reviewer judging a sentence
 * this file INVENTED would be judging the wrong claim. Silence is recoverable;
 * a confident mistranslation is not.
 */
export function claimSentence(claimPath: string, value: unknown, answered = true): string | null {
  if (!answered) return 'Twin did not reach a conclusion about this one.'
  const say = SENTENCES[String(claimPath ?? '')]
  if (!say) return null
  return say(value)
}
