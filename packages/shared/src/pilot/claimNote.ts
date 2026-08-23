// WHAT THE FIELD MEANS, FOR THE CLAIMS THAT LOOK LIKE EACH OTHER.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// The owner reached "The camera stays in one position the whole way through",
// saw a wide crowd shot and a close-up of one face, and could not tell whether a
// ZOOM counted as the camera moving. It does not: Twin was asked two separate
// questions and only one of them is about zoom.
//
//   camera.positionChanges   'Does the camera move to a different position or angle?'
//   camera.framingChanges    'Does the shot size change (close-up to wide, or the reverse)?'
//
// A reviewer who conflates them scores the model wrong for something it never
// claimed, and that lands in the results as a model error.
//
// ⚠️ A NOTE IS NOT A REWORDING. The claim sentence is untouched. These say what
// the field the model was asked MEANS -- the same move #477 made for talkingHead
// ("They do not have to be close up") after the same kind of confusion. Changing
// the claim itself would have the reviewer judging something the model never
// answered; leaving the ambiguity in place produces confident labels of the
// wrong question, which is worse because it is invisible afterwards.
//
// ⚖️ AND THEY MUST NOT SUPPLY THE ANSWER. Every note here describes the
// QUESTION. None of them says what is in any frame, which way to lean, or what
// the usual answer is. A note that decides for the reviewer is the same defect
// as a pre-highlighted button (#481) or a running score -- coaching by another
// route. The tests pin that.

/**
 * Plain-English gloss for claim paths whose meaning a first-time reader can get
 * wrong. Absent entry = the sentence already stands on its own; the card shows
 * nothing rather than padding every claim with prose.
 */
const NOTES: Record<string, string> = {
  // The pair that caused this file.
  'camera.positionChanges':
    'Zooming in or out on its own does not count. This is about the camera being '
    + 'moved somewhere else, or pointed from a different angle.',
  'camera.framingChanges':
    'This is about the shot getting wider or closer — a zoom counts, even if the '
    + 'camera never moves.',

  // Location versus camera: the other pair that reads the same at a glance.
  'setting.changes':
    'This is about the place changing. Moving the camera, or filming a different '
    + 'corner of the same place, is still one place.',
  // ⚠️ STOCK AND B-ROLL ARE THE CASE THAT BREAKS THE NAIVE READING, and the
  // owner found it: a piece to camera in a car cut against a sunset silhouette.
  // Two places appear; only one has to be FILMED. Remaking it means licensing or
  // downloading the second, not travelling to it. Whether a given clip is such
  // footage is the reviewer's judgement -- the note defines the question and
  // says nothing about what is in any frame.
  'requirements.multipleLocations':
    'This is about places you would have to film yourself. A different angle of '
    + 'the same place is still one location, and footage you would license or '
    + 'download rather than film does not add one.',

  // "Product" is doing a lot of work in a sentence that does not define it.
  // ⚠️ "IS THAT HIS PRODUCT?" IS THE WRONG QUESTION, AND THE OWNER ASKED IT.
  // Shown someone holding a coffee, they hesitated over whether it counted
  // because it was not the creator's own product. The model was asked only
  // whether ANYONE handles a physical product -- ownership, sponsorship and
  // whether the video is about it are all irrelevant. Left unsaid, that turns a
  // clear yes into a coin flip.
  'performance.productInteraction':
    'Any physical product — something made and sold. It does not have to be '
    + 'theirs, and the video does not have to be about it. A cup of coffee counts; '
    + 'a stick, a leaf or part of the scenery does not.',
  // ⚠️ NEEDED, NOT MERELY PRESENT -- and this is NOT the same question as
  // performance.productInteraction. That one asks whether anyone HANDLES a
  // product; this asks whether you would have to HOLD one to remake the video.
  // A coffee someone happens to be drinking is handled but not required. Read as
  // equivalent, the two claims get answered identically and one of them stops
  // measuring anything.
  'requirements.physicalProduct':
    'A physical product — something made and sold — that you would have to hold '
    + 'to remake this. It does not have to be a product you sell. Something that '
    + 'just happens to be in shot is not needed.',

  // Speaking to camera, at any distance. The definition gap recorded as
  // TALKINGHEAD_LOOSER_THAN_INDUSTRY; the note states the loose reading plainly.
  'performance.talkingHead':
    'Talking towards the camera, at any distance. They do not have to be close up, '
    + 'and you do not have to hear them.',

  'performance.acting':
    'Playing a character or acting out a scene, rather than being themselves.',
  'performance.screenInteraction':
    'Touching, tapping or pointing at a screen — a phone, laptop or monitor.',
  'performance.walking':
    'Moving through space on foot. Standing still and gesturing is not walking.',
  'requirements.unusualProps':
    'Props most people would not already have at home.',
  'requirements.secondPerson':
    'Another person who has to be ON CAMERA. Someone holding the camera does not count.',
  'setting.complexity':
    'How much setting up the place would take: a room or a plain wall is simple, '
    + 'a venue or a busy street is complex.',
  'people.count':
    'People visible on camera. Someone filming from behind the camera is not counted.',
}

/** The note for a claim path, or null when the sentence needs no gloss. */
export function claimNote(claimPath: string): string | null {
  return NOTES[claimPath] ?? null
}

export const CLAIM_PATHS_WITH_NOTES = Object.freeze(Object.keys(NOTES))

/**
 * ⚠️ THE PAIRS THIS FILE EXISTS TO KEEP APART, named rather than implied.
 * Exported so a test can assert each side says what the other is not, and so a
 * future reader can see the confusion was deliberate to address.
 */
export const CONFUSABLE_PAIRS = Object.freeze([
  Object.freeze(['camera.positionChanges', 'camera.framingChanges'] as const),
  Object.freeze(['setting.changes', 'requirements.multipleLocations'] as const),
  Object.freeze(['performance.productInteraction', 'requirements.physicalProduct'] as const),
])
