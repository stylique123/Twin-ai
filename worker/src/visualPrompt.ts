// ASKING IN A WAY THAT MAKES THE HONEST ANSWER THE EASY ONE.
//
// ⚠️ THE CONTRACT CANNOT SAVE A BAD QUESTION. `visualExtraction` will reject a
// claim with no citation, a citation outside the sample, and a single frame
// cited for a change — but every one of those rejections is a field lost. A
// prompt that invites confident prose produces a response that is mostly
// rejections, and the pass then reports "we looked and learned nothing" for
// videos it could have read.
//
// ⚖️ SO THE PROMPT STATES THE SAME RULES THE PARSER ENFORCES, in the same terms,
// and says plainly that "not_determined" is a correct answer. The failure mode
// worth engineering against is not a model that says too little — a settled
// `not_determined` is a finding and retires the question — it is a model that
// says "two people, changing locations, product in hand" about a static
// talking-head because those words go together.
//
// ⚠️ NO TRANSCRIPT, NO CAPTION, NO URL IN THIS PROMPT, DELIBERATELY. Give a
// visual model the caption and it will answer from the caption, and the answer
// will look exactly like an observation. Caption- and transcript-derived
// inference belongs to the content pass, which is built to weigh it; mixing the
// two here would make `visualPassRan` mean "something produced these fields"
// rather than "frames were read".

// ⚠️ DERIVED FROM `packages/shared/src/visualExtraction.ts` — the paths only.
// The worker has NO runtime dependency on @twinai/shared (see
// referenceExtraction.ts); importing it here would break the Docker build that
// copies worker/ alone. Parity is enforced by referenceExtractionParity.test.ts,
// which compares this list against the real one.
//
// ⚖️ PATHS ONLY, NOT THE CLAIM CLASSES. The classes decide what the PARSER
// accepts and live in one place on purpose; duplicating them here would create
// two answers to "can one frame prove this?", and the prompt's copy would be the
// one nobody notices going stale.
const VISUAL_FIELD_PATHS: readonly string[] = [
  'primaryMode',
  'people.count',
  'setting.changes',
  'setting.complexity',
  'performance.talkingHead',
  'performance.walking',
  'performance.acting',
  'performance.productInteraction',
  'performance.screenInteraction',
  'camera.framingChanges',
  'camera.positionChanges',
  'requirements.physicalProduct',
  'requirements.secondPerson',
  'requirements.multipleLocations',
  'requirements.unusualProps',
]

/** The wording each field is asked in, in the creator-facing sense of the
 *  question rather than the schema's dotted path.
 *
 *  ⚠️ ONE ENTRY PER `VISUAL_FIELDS` PATH, ASSERTED AT MODULE LOAD. A field added
 *  to the contract and forgotten here would be silently never asked, and the
 *  profile would report it unobservable rather than unasked — the same
 *  `unset ≠ false` collision this codebase keeps paying for. */
export const FIELD_QUESTIONS: Record<string, string> = {
  'primaryMode': 'Overall, how is this video made? One of: talking_head, voiceover_broll, demonstration, skit, interview, screen_recording.',
  'people.count': 'How many people appear on camera — "one" or "multiple"?',
  'setting.changes': 'Does the location change during the video?',
  'setting.complexity': 'How involved is the setting — "simple" (a room, a wall), "moderate", or "complex" (a set, a venue, a busy location)?',
  'performance.talkingHead': 'Is someone speaking to camera?',
  'performance.walking': 'Is the person walking or moving through space?',
  'performance.acting': 'Is anyone playing a character or acting out a scene, rather than speaking as themselves?',
  'performance.productInteraction': 'Does someone hold, use, or handle a physical product?',
  'performance.screenInteraction': 'Does someone point at, tap, or interact with a screen or device display?',
  'camera.framingChanges': 'Does the shot size change (close-up to wide, or the reverse)?',
  'camera.positionChanges': 'Does the camera move to a different position or angle?',
  'requirements.physicalProduct': 'To remake this video, would you need a physical product in hand?',
  'requirements.secondPerson': 'To remake this video, would you need a second person on camera?',
  'requirements.multipleLocations': 'To remake this video, would you need more than one location?',
  'requirements.unusualProps': 'To remake this video, would you need props most people do not have?',
}

// ⚠️ FAIL AT LOAD, NOT AT THE THOUSANDTH VIDEO. An unasked field is invisible in
// the output — it looks exactly like a field the frames could not establish.
for (const path of VISUAL_FIELD_PATHS) {
  if (!(path in FIELD_QUESTIONS)) {
    throw new Error(`visualPrompt: VISUAL_FIELD_PATHS has "${path}" with no question. Add one — an unasked field is indistinguishable from an unobservable one.`)
  }
}

/**
 * Build the instruction text for a sample of exactly `framesSampled` frames.
 *
 * ⚠️ THE FRAME COUNT IS INTERPOLATED, NOT ASSUMED. The parser range-checks
 * against the frames that actually landed, so the prompt must name that same
 * number — telling the model there are four frames when three were attached is
 * how a citation to a non-existent frame gets invited rather than hallucinated.
 */
export function visualPrompt(framesSampled: number): string {
  const n = Math.max(0, Math.trunc(framesSampled))
  const questions = Object.entries(FIELD_QUESTIONS)
    .map(([path, q]) => `  "${path}": ${q}`)
    .join('\n')

  // ⚖️ THE CLAIM-CLASS RULE IS STATED AS A RULE ABOUT EVIDENCE, not as a schema
  // note. "A change needs two frames" is a thing a model can comply with; "this
  // field is classified temporal" is not.
  return `You are looking at ${n} still frame${n === 1 ? '' : 's'} taken in order from one short-form video. They are numbered 1 to ${n}, frame 1 earliest.

Answer ONLY from what is visible in these frames. You have not seen the video, its caption, its audio, or its title, and you must not guess at them.

For each question below, answer with an object:
  { "value": <answer>, "evidence": { "frames": [<frame numbers>] } }

Rules about evidence, which are checked and not negotiable:
- Cite only frame numbers between 1 and ${n}. Any other number invalidates the answer.
- To claim that something CHANGES, HAPPENS OVER TIME, or MOVES — a location change, a camera move, a framing change, walking, acting, or the video's overall mode — you must cite TWO frames as [earlier, later], and they must genuinely show the difference. One frame can never establish a change.
- To claim something is simply PRESENT or TRUE IN VIEW — how many people, what the setting is like, someone speaking to camera, a product in hand — one frame is enough: cite [n].

If the frames genuinely cannot answer a question, reply exactly:
  { "value": "not_determined" }
That is a correct and useful answer. It is much better than a plausible guess. Do not invent a second person, a second location, or a product that is not visible.

Answer every question. Return ONE JSON object whose keys are the dotted paths below, nested to match the paths (for example "people": { "count": { ... } }).

Questions:
${questions}`
}
