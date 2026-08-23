// THE REVIEWER NOW KNOWS WHAT THE FIELD MEANS. THE MODEL STILL DOES NOT.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// #483 put a note under each claim so the owner stopped guessing which question
// they were answering. That fixed the REVIEWER side only. `FIELD_QUESTIONS` in
// worker/src/visualPrompt.ts still asks the loose original, so the model is
// answering the ambiguous question while the person judging it reads the sharp
// one -- and the gap between them lands in the results as a MODEL error.
//
// ⚠️ THAT ASYMMETRY IS WORSE THAN THE ORIGINAL AMBIGUITY, because it is
// invisible. Before #483 both sides were vague together. Now the card says a
// zoom is not a camera move while nothing ever told the model that.
//
// ⚖️ SO THIS FILE IS THE SPEC FOR THE MODEL-SIDE PASS, NOT THE PASS ITSELF.
// Changing what the model is asked is an ANALYZER VERSION change:
// VISUAL_ANALYSIS_VERSION is stamped on every row as `visualVersion` AND feeds
// componentDigest(), so shipping a new question set without bumping
// visual-2 -> visual-3 would make old and new rows indistinguishable and yield
// the same digest for different content.
//
// ⚠️ AND IT MUST NOT SHIP MID-RUN. Applying it while a pilot is being labelled
// means early and late references were analysed under different questions, which
// is the exact corruption the notes were careful to avoid. The trigger is the
// first run reaching LOCKED.
//
// It is recorded as data rather than prose so the worker change is mechanical
// and a parity test can hold the two copies together afterwards -- the worker
// has no runtime dependency on @twinai/shared (see referenceExtraction.ts), so
// duplication plus an asserted parity is the established pattern here.

export interface FieldMeaningUpgrade {
  /** The claim path, matching FIELD_QUESTIONS in worker/src/visualPrompt.ts. */
  path: string
  /** What the model is asked TODAY, verbatim. */
  current: string
  /** What it should be asked, once the analyzer version bumps. */
  proposed: string
  /** The confusion this resolves, as the owner actually hit it. */
  because: string
}

/**
 * ⚠️ EVERY `proposed` STATES THE QUESTION MORE PRECISELY. None of them makes the
 * question HARDER to satisfy in a way the reviewer card does not also say. A
 * proposal that tightened the model's question past the card would recreate the
 * asymmetry in the other direction.
 */
export const FIELD_MEANING_UPGRADES: readonly FieldMeaningUpgrade[] = Object.freeze([
  Object.freeze({
    path: 'camera.positionChanges',
    current: 'Does the camera move to a different position or angle?',
    proposed:
      'Does the camera move to a different position or angle? A zoom on its own '
      + 'does not count — that is a framing change, asked separately.',
    because:
      'Claim 20: a wide crowd shot cut to a close-up of one face. The owner could '
      + 'not tell whether a zoom counted as the camera moving. It does not.',
  }),
  Object.freeze({
    path: 'camera.framingChanges',
    current: 'Does the shot size change (close-up to wide, or the reverse)?',
    proposed:
      'Does the shot size change (close-up to wide, or the reverse)? A zoom counts '
      + 'even if the camera never moves.',
    because: 'The other half of the same pair; stated so the two cannot collapse.',
  }),
  Object.freeze({
    path: 'performance.productInteraction',
    current: 'Does someone hold, use, or handle a physical product?',
    proposed:
      'Does someone hold, use, or handle a physical product — something made and '
      + 'sold? It does not have to belong to them, and the video does not have to '
      + 'be about it. Natural objects and scenery do not count.',
    because:
      'Claims 18 and 24: a stick on a beach, then a coffee. "I do not know if '
      + 'coffee is his product" — ownership was never part of the question.',
  }),
  Object.freeze({
    path: 'requirements.physicalProduct',
    current: 'To remake this video, would you need a physical product in hand?',
    proposed:
      'To remake this video, would you need a physical product — something made '
      + 'and sold — in hand? Something that merely appears in shot is not needed.',
    because:
      'Claim 31: the same coffee frame. productInteraction OBSERVES; this REQUIRES. '
      + 'Read as equivalent they get answered identically and one stops measuring.',
  }),
  Object.freeze({
    path: 'requirements.multipleLocations',
    current: 'To remake this video, would you need more than one location?',
    proposed:
      'To remake this video, would you need to film in more than one place? '
      + 'Footage that would be licensed or downloaded rather than filmed does not '
      + 'add a location.',
    because:
      'Claim 26: a piece to camera in a car cut against a stock sunset. Two places '
      + 'appear; only one has to be filmed.',
  }),
  Object.freeze({
    path: 'performance.acting',
    current:
      'Is anyone playing a character or acting out a scene, rather than speaking '
      + 'as themselves?',
    proposed:
      'Is a real person playing a character or acting out a scene, rather than '
      + 'speaking as themselves? Drawings and animation are not a person acting.',
    because:
      'Claim 37: an illustrated mouse. "Rather than speaking as themselves" '
      + 'presupposes a real performer, and there is none in a drawing.',
  }),
  Object.freeze({
    path: 'people.count',
    current: 'How many people appear on camera — "one" or "multiple"?',
    proposed:
      'How many real people appear on camera — "one" or "multiple"? Drawn or '
      + 'animated characters are not people on camera.',
    because:
      'The same animation gap: the whole field set assumes live-action footage '
      + 'with real people.',
  }),
])

export const upgradeFor = (path: string): FieldMeaningUpgrade | null =>
  FIELD_MEANING_UPGRADES.find((u) => u.path === path) ?? null

/** The version this pass must move to. Stated so the PR cannot forget it. */
export const UPGRADE_REQUIRES_VERSION = Object.freeze({
  from: 'visual-2',
  to: 'visual-3',
  why:
    'VISUAL_ANALYSIS_VERSION is stamped on every row as visualVersion and feeds '
    + 'componentDigest(). Changing the question set without bumping makes old and '
    + 'new rows indistinguishable and yields the same digest for different content.',
  notRetroactive:
    'References already analysed under visual-2 keep their old answers. Re-running '
    + 'frame analysis on a live pilot is not permitted, so the benefit lands on the '
    + 'NEXT cohort.',
})
