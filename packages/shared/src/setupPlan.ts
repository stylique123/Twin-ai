// A RECORDING HAS SETUPS, AND THE SCRIPT NEVER SAID SO.
//
// ⚠️ REPORTED AS "every scene says the same thing", AND THE DATA WAS RIGHT.
// Blueprint a98bf712 stores the same background on all five beats — "Dark studio
// setting with a subtle yellow backlight illuminating the wall" — while
// `action_posing` differs per beat: hold up two fingers here, point at the lens
// there. One room, one continuous take, different performance. A correct script.
//
// What was wrong is that the recorder printed the room on every card, so five
// copies of the constant buried the one line that varied. A creator scanning for
// what to do DIFFERENTLY reads the same sentence five times and stops reading.
//
// ⚖️ SO THE SETUP BECOMES A THING WITH AN IDENTITY, NOT A STRING TO RE-COMPARE.
// Scenes 1–3 belong to setup A; scene 4 belongs to setup B. Every screen then
// asks "which setup is this scene in" and compares ids. The alternative — each
// component re-deciding sameness by comparing background text at render time —
// is how two screens come to disagree about one script, and it puts a string
// comparison in the path of the instruction a person follows while standing in
// a room with a camera pointed at them.
//
// ⚖️ IDENTITY IS DECIDED ONCE, HERE, and it is the (background, framing) pair:
// those are the two facts that decide where the phone goes and where the person
// stands. Movement is deliberately NOT part of it — gesture changes every beat,
// and folding it in would make every scene its own setup, which is the noise
// this exists to remove.
//
// ⚖️ AND A RETURN IS NOT A NEW SETUP. A script that goes A → B → A gets its
// first setup back, not a third one, because walking back to where you started
// is not a third place to stand. Runs are keyed on identity across the whole
// script, not on adjacency.

/** The fields this rule reads. Structural rather than importing the scene type,
 *  so a caller holding plain blueprint segments can ask too. */
export interface SetupScene {
  scene_number: number
  background?: string | null
  camera_framing?: string | null
  /** ⚠️ A SILENT INSERT IS NOT FILMED IN THE ROOM. A cutaway carries "Screen
   *  capture" in these fields; letting one vote would split a continuous take in
   *  half the moment a script declares a clip. */
  dialogue?: string | null
}

export interface Setup {
  /** Stable within one plan: 'A', 'B', 'C'… in first-appearance order. */
  id: string
  background: string
  framing: string
  /** Every spoken scene filmed in this setup, in script order. */
  sceneNumbers: number[]
}

export interface SetupPlan {
  setups: Setup[]
  /** Which setup each scene belongs to. A silent insert maps to null — it
   *  belongs to no room, and pretending otherwise would let it inherit a
   *  standing instruction that does not apply to it. */
  setupIdOf: Record<number, string | null>
}

const clean = (s: string | null | undefined): string => String(s ?? '').trim()
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Group the spoken scenes into the setups they are filmed in.
 *
 * ⚠️ A SCENE WITH NOTHING DECIDED JOINS NO SETUP. An empty background and an
 * empty framing say "nobody chose", and promoting that into a setup would put an
 * empty strip above a scene as though it were an instruction.
 */
export function planSetups(scenes: ReadonlyArray<SetupScene>): SetupPlan {
  const setups: Setup[] = []
  const byKey = new Map<string, Setup>()
  const setupIdOf: Record<number, string | null> = {}

  for (const scene of scenes) {
    const spoken = clean(scene.dialogue) !== ''
    const background = clean(scene.background)
    const framing = clean(scene.camera_framing)
    if (!spoken || (background === '' && framing === '')) {
      setupIdOf[scene.scene_number] = null
      continue
    }
    // ⚖️ CASE AND SPACING ARE NOT A DIFFERENT ROOM. The key is normalised; the
    // setup keeps the FIRST spelling it was given, because that is the sentence
    // a person wrote and re-casing it would read as a bug.
    const key = `${background.toLowerCase()}¦${framing.toLowerCase()}`
    let setup = byKey.get(key)
    if (!setup) {
      setup = { id: LETTERS[setups.length] ?? `S${setups.length + 1}`, background, framing, sceneNumbers: [] }
      byKey.set(key, setup)
      setups.push(setup)
    }
    setup.sceneNumbers.push(scene.scene_number)
    setupIdOf[scene.scene_number] = setup.id
  }

  return { setups, setupIdOf }
}

/**
 * Does the strip need to CHANGE when the creator reaches this scene?
 *
 * ⚖️ THE ONE SAFETY PROPERTY OF THE WHOLE FEATURE. A sticky strip that fails to
 * update is worse than five repeated lines: it states, confidently, the wrong
 * place to stand. So this is asked per scene rather than derived once, and it is
 * true for the FIRST scene of every setup — including the first scene of all,
 * which is where the strip is first stated.
 *
 * A silent insert never announces a setup, because it is not filmed in one.
 */
export function startsSetup(plan: SetupPlan, sceneNumber: number): boolean {
  const id = plan.setupIdOf[sceneNumber]
  if (id == null) return false
  const setup = plan.setups.find((s) => s.id === id)
  return setup?.sceneNumbers[0] === sceneNumber
}

/**
 * The compact strip: "Setup A · Dark studio · Yellow backlight · Chest-up".
 *
 * ⚠️ SPLIT ON THE PUNCTUATION THE MODEL ALREADY WRITES, AND NEVER MID-CLAUSE. A
 * word-count truncation turns "Dark studio setting with a subtle yellow
 * backlight illuminating the wall" into "Dark studio setting with a subtle…",
 * which is longer AND less useful than the clause it came from.
 *
 * ⚖️ NOTHING IS INVENTED AND NOTHING IS DROPPED SILENTLY. Parts beyond the third
 * stay in the full description on the card that opens the setup; this is the
 * glance, not the record.
 */
export function setupStrip(setup: Setup): string[] {
  // ⚠️ THE BACKGROUND IS RETURNED WHOLE, AND THIS USED TO SPLIT IT.
  // It split on `[·,;]`, " with " and " and ", so "Standing in front of your
  // tool wall, facing the main light source" reached the strip as two dotted
  // parts while the card immediately below rendered the same string intact.
  // Reported from production: the two disagreed and the header read as an error.
  //
  // ⚖️ THE OLD SPLIT HAD A REAL REASON AND IT IS OVERRULED ON PURPOSE. It
  // existed so a long background clipped at a CLAUSE rather than mid-phrase
  // ("Dark studio setting with a subtle…"). But an ellipsis is an affordance
  // every reader understands, and silently RE-PUNCTUATING a creator's own
  // sentence is not — it invents a rhythm they did not write, on the one
  // surface whose whole job is to agree with the card underneath it. Clipping
  // is handled by the component's `truncate`, and the full text is one line away.
  const background = setup.background.replace(/\.$/, '').trim()
  const framing = setup.framing.replace(/\.$/, '').trim()
  // ⚖️ THE DOT STILL SEPARATES FIELDS, never clauses within one field: the
  // setup label, the place, and the framing are three different answers.
  return [
    `Setup ${setup.id}`,
    ...(background ? [background] : []),
    ...(framing ? [framing] : []),
  ]
}
