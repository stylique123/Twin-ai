// EVERY FIELD OF THE PLAN MUST REACH SOMEBODY.
//
// ⚠️ THE DEFECT THIS SESSION FOUND EIGHT TIMES. A field is added to a schema,
// demanded of the model, stored, parsed into a typed shape — and read by
// nothing. `product_entities` was a table with no writer. `loadProductEntities`
// was a complete reader with no caller. `restrictions` appeared in the generator
// only inside a comment. `official_product_page` was an enum value produced by
// nothing. Two of the eight I introduced myself, which is the point: the rule is
// easy to state and easy to break in the same afternoon you state it.
//
// `beat_plan` was the eighth. It carries FOUR fields and `targetSec` was the only
// one with a reader. `proof` — what makes a beat believable, the one field that
// names what a creator should CAPTURE — was required by the blueprint schema,
// filled on every generation, parsed into `PlannedBeat.proof`, and shown to
// nobody holding a camera.
//
// ⚖️ SO THE GUARD IS ON THE RULE, NOT ON `proof`. Asserting "proof has a reader"
// would be satisfied forever by the commit that added one, and the NEXT field
// added to `PlannedBeat` would ship write-only exactly like this one did. This
// walks the interface and demands a reader for whatever it finds, so the failure
// arrives when the field is added rather than a release later.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = dirname(fileURLToPath(import.meta.url))
const read = (...p: string[]) => readFileSync(join(SRC, '..', ...p), 'utf8')

const PLAN = read('beatPlan.ts')
const ADAPTER = read('recordingScriptAdapter.ts')
const SCENE = read('recordingScript.ts')
const EDGE = readFileSync(join(SRC, '..', '..', '..', '..', 'supabase', 'functions',
  'generate-blueprint', 'index.ts'), 'utf8')
/** Every surface a creator reads while planning or filming. */
const SURFACES = {
  ScriptEditor: readFileSync(join(SRC, '..', '..', '..', '..', 'apps', 'web', 'src',
    'components', 'ScriptEditor.tsx'), 'utf8'),
  V2Capture: readFileSync(join(SRC, '..', '..', '..', '..', 'apps', 'web', 'src', 'pages',
    'v2', 'V2Capture.tsx'), 'utf8'),
}

/** The declared fields of `PlannedBeat`, read from the source rather than
 *  retyped — a retyped list is a list that stops matching. */
function plannedBeatFields(): string[] {
  const start = PLAN.indexOf('export interface PlannedBeat {')
  expect(start, 'PlannedBeat interface not found — did it move or get renamed?')
    .toBeGreaterThan(-1)
  const body = PLAN.slice(start, PLAN.indexOf('\n}', start))
  return [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1])
}

describe('the beat plan has no write-only fields', () => {
  it('finds every field the interface declares', () => {
    // A guard that walks an empty list passes vacuously and protects nothing.
    // THREE, not four: `sceneType` was removed rather than given a reader,
    // because its own definition documented a decision NOT to branch on it.
    const fields = plannedBeatFields()
    expect(fields.length).toBeGreaterThanOrEqual(3)
    expect(fields).toContain('beat')
    expect(fields).toContain('proof')
    expect(fields).toContain('targetSec')
    expect(fields).not.toContain('sceneType')
  })

  it('reads each one somewhere outside the parser that produced it', () => {
    // ⚖️ THE PARSER DOES NOT COUNT AS A READER. `readBeatPlan` assigns all four
    // fields, so counting assignments would have called the broken state
    // healthy. A reader is a USE outside the function that built the value.
    const parserStart = PLAN.indexOf('export function readBeatPlan')
    const parser = PLAN.slice(parserStart, PLAN.indexOf('\n}', parserStart))
    const elsewhere = PLAN.replace(parser, '') + ADAPTER

    for (const field of plannedBeatFields()) {
      // ⚠️ PROPERTY ACCESS, NOT A WORD MATCH. A looser pattern passed `beat`
      // vacuously — "beat" appears all over an adapter that builds beats, so the
      // guard called a write-only field healthy on the strength of a comment.
      // A reader reads `x.beat` or `x?.beat`; prose does not.
      const used = new RegExp(`\\??\\.\\s*${field}\\b`).test(elsewhere)
      expect(used, [
        `\`PlannedBeat.${field}\` is parsed and never read.`,
        '',
        'A field the model is required to fill and nobody consumes is the defect',
        'this repo has now shipped eight times. Wire a reader in the SAME change',
        'that adds the field — a surface that shows it, or a check that tests it.',
      ].join('\n')).toBe(true)
    }
  })
})

describe("proof's reader is a counter, and deliberately not a surface", () => {
  // ⚠️ A READER EXISTING IS NOT A READER BEING RIGHT. The first pass wired
  // `proof` onto the plan card and the capture screen and this file went green.
  // Then 192 real proofs said 23 were the `substance` enum verbatim, 107 named a
  // source, 18 restated the purpose, and about 6 were filmable — so the row
  // would have told somebody holding a camera "What makes this land:
  // creator_knowledge". The guard was satisfied by a surface that was wrong five
  // times in six.
  //
  // ⚖️ SO THE READER IS THE PRODUCTION COUNTER, until the counter says the value
  // is worth showing. That is a real reader — it runs on every generation and it
  // is what will report the sharpened instruction working — and it cannot put a
  // wrong word in front of a creator.
  it('counts proof quality in the generator', () => {
    expect(PLAN).toMatch(/export function proofQualityCounts/)
    expect(EDGE).toMatch(/proof_quality: proofQualityCounts\(/)
  })

  it('does NOT carry proof onto the scene', () => {
    // The scene is what the surfaces read. Keeping the field there with nothing
    // rendering it would be the write-only defect again, one layer down.
    expect(SCENE).not.toMatch(/^\s*proof\?:/m)
  })

  it('renders proof on no creator surface', () => {
    for (const [name, src] of Object.entries(SURFACES)) {
      expect(/\.proof\b/.test(src), `${name} renders beat proof before it is good enough`)
        .toBe(false)
    }
  })

  it('still refuses to hand on a non-shootable proof', () => {
    // The classifier gates `proofAt`, so the day a surface is added it cannot
    // start by rendering the shapes that caused this.
    expect(PLAN).toMatch(/proofQuality\(p\) === 'shootable'/)
  })
})
