// A SCENE MAY NOT SAY TWO OPPOSITE THINGS TO THE PERSON FILMING IT.
//
// From the first recording run. Scene 1 was labelled Talking, carried a line to
// say, and its performance direction read:
//
//     "None for the creator, as this is a b roll overlay sequence."
//
// So the recorder asked him to perform a scene it simultaneously told him he was
// not in. He stands there reading a line while the app says he is not needed.
//
// WHY THIS IS A CHECK AND NOT A PROMPT RULE. The instruction "be consistent" is
// already implicit in every scene we ask for, and the model agreed with it right
// up until it didn't. A malformed scene is a fact about the object, decidable by
// looking at the object, so it is decided here — once, in one place, by code that
// cannot have an off day.
//
// ── WHAT THIS CAN AND CANNOT SEE ──────────────────────────────────────────
//
// `paletteLeak` is EXACT. A hex colour in an instruction a human executes with
// their hands is always wrong: the brand palette belongs to packaging, and
// "ensure the #00E5FF cyan lights are visible" is a filming instruction nobody
// can follow. No phrasing escapes a regex for a hex triplet.
//
// `absentPerformer` is a HEURISTIC and must be described as one. It reads the
// stated contradiction — direction that says the creator is not in a scene the
// script gives them words for. A model that phrases the same contradiction some
// other way walks straight past it, and no list of phrases fixes that.
//
// The real fix is structural and is written up as §5c: `background` currently
// carries location, b-roll and edit intent at once, and a scene cannot claim the
// creator is absent from a field that only ever described where he stands. Once
// those are three fields, this heuristic has nothing left to catch. It exists
// because that split has not landed yet and the contradiction is shipping today.
export interface SceneConsistencyInput {
  /** True when the scene is spoken to camera (`show_in_teleprompter`). */
  spoken: boolean
  /** The words the creator is asked to say, if any. */
  dialogue?: string | null
  /** Performance direction — "what to do while you talk". */
  movement?: string | null
  /** Setting guidance — today still location + b-roll + edit intent in one. */
  background?: string | null
  /** Framing direction, e.g. "Chest-up shot". */
  framing?: string | null
}

export type SceneIssueCode = 'absent_performer' | 'palette_leak'

export interface SceneIssue {
  code: SceneIssueCode
  /** Which field carries the contradiction, so a consumer can drop that field
   *  rather than the whole scene. */
  field: 'movement' | 'background' | 'framing'
  /** Plain sentence, written to be read by a person deciding what to do. */
  detail: string
}

/** A hex colour, `#abc` or `#aabbcc`. Bounded by a non-hex character on the
 *  right so `#00E5FF7` (not a colour) does not match a prefix of itself. */
const HEX = /#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/i

// Phrases that assert the creator is NOT in the shot. Deliberately narrow: each
// one states absence outright. Anything looser starts deleting real direction —
// "let the b roll play under you" is a legitimate instruction to someone who IS
// on camera, and a check that ate it would be worse than the bug.
const ABSENT = [
  /\bnone for the creator\b/i,
  /\bno(?:thing)? for the creator\b/i,
  /\bcreator is not (?:on screen|in (?:this )?(?:shot|scene)|needed)\b/i,
  /\b(?:this is|purely|entirely) (?:a )?b[- ]?roll (?:overlay|sequence|only)/i,
]

const says = (text: string, patterns: RegExp[]): boolean => patterns.some((p) => p.test(text))

/**
 * Every way this scene contradicts itself. Empty means nothing detectable is
 * wrong — NOT that the scene is good, which is a judgement no validator makes.
 */
export function sceneConsistencyIssues(scene: SceneConsistencyInput): SceneIssue[] {
  const issues: SceneIssue[] = []
  const movement = (scene.movement ?? '').trim()
  const background = (scene.background ?? '').trim()
  const framing = (scene.framing ?? '').trim()
  const hasLine = !!(scene.dialogue ?? '').trim()

  // The contradiction only exists when the scene DOES ask him to speak. A silent
  // b-roll scene saying "none for the creator" is simply true.
  if (scene.spoken && hasLine && movement && says(movement, ABSENT)) {
    issues.push({
      code: 'absent_performer',
      field: 'movement',
      detail: 'This scene gives the creator a line to say and then tells them they are not in it.',
    })
  }

  // A hex colour is never executable by a person. It is wrong in every field a
  // human acts on, so all three are checked rather than just the obvious one.
  for (const [field, text] of [['movement', movement], ['background', background], ['framing', framing]] as const) {
    if (text && HEX.test(text)) {
      issues.push({
        code: 'palette_leak',
        field,
        detail: 'A hex colour reached an instruction a person carries out with their hands. Brand colour belongs to packaging, not to a room.',
      })
    }
  }

  return issues
}

/**
 * Should this direction be shown to someone about to film?
 *
 * A contradiction is not improved by being displayed. Where the offending field
 * is the one that is wrong — direction claiming the creator is absent from a
 * scene the script hands them words for — showing NOTHING is strictly better
 * than showing both halves and leaving them to work out which to believe.
 */
export function safeToShow(scene: SceneConsistencyInput, field: SceneIssue['field']): boolean {
  return !sceneConsistencyIssues(scene).some((i) => i.field === field)
}
