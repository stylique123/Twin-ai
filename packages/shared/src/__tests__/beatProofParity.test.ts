// THE MODEL WAS ANSWERING A DIFFERENT QUESTION, AND ONLY REAL DATA SAID SO.
//
// ⚠️ THE DEFECT, FOUND BY WALKING THE FIELD ACROSS 32 REAL GENERATIONS. `proof`
// is documented as what makes a beat believable — a screen, the object in hand,
// a number. Of 192 proofs across 206 beats:
//
//     23  the `substance` enum verbatim ("creator_knowledge", "general")
//    107  named a SOURCE ("Creator's stated knowledge of wealth paths")
//     18  restated the beat's PURPOSE ("Establishes the problem")
//     ~6  something a person could actually film
//
// Two of those three are questions the blueprint asks ELSEWHERE — `substance`
// records where substance came from, `beat` records what the beat is for — so
// `proof` was collapsing into a duplicate of the fields either side of it.
//
// ⚖️ WHICH IS WHY THE CREATOR SURFACE DOES NOT SHOW IT YET. A first pass wired
// `proof` onto the plan card and the capture screen. A guard proved a reader
// existed; nothing proved the VALUE was worth reading, and the row would have
// said "What makes this land: creator_knowledge" to somebody holding a camera.
// A row that is wrong five times in six is not guidance. The reader is a
// production counter until the counter says otherwise.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { proofQuality, proofQualityCounts, proofAt } from '../beatPlan'

const HERE = dirname(fileURLToPath(import.meta.url))
const SHARED = readFileSync(join(HERE, '..', 'beatPlan.ts'), 'utf8')
const EDGE = readFileSync(
  join(HERE, '..', '..', '..', '..', 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

/** Pull a named const's source text out of a file, so the comparison is on what
 *  ships rather than on a retyped copy. */
function constSrc(src: string, name: string): string {
  const m = src.match(new RegExp(`^const ${name} = (/.*/[a-z]*)$`, 'm'))
  expect(m, `${name} not found — did it move or change shape?`).toBeTruthy()
  return m![1]
}

describe('the edge copy is byte-identical to shared', () => {
  // The edge cannot import `@twinai/shared`, so the copy is deliberate. What is
  // NOT acceptable is the two drifting: a classifier that disagrees with itself
  // would report a production number that the harness cannot reproduce.
  it.each(['NON_PROOF', 'SUBSTANCE_ENUM', 'NAMES_A_SOURCE', 'NAMES_AN_EFFECT'])(
    'holds for %s', (name) => {
      expect(constSrc(EDGE, name)).toBe(constSrc(SHARED, name))
    })

  it('classifies through the same branch order', () => {
    // Order decides the answer: "Creator's experience" matches a source, and a
    // reordered version could report it as shootable.
    const order = (src: string) => [...src.matchAll(/return '(substance_enum|names_a_source|names_an_effect|shootable|absent)'/g)]
      .map((m) => m[1])
    const s = SHARED.slice(SHARED.indexOf('export function proofQuality'))
    const e = EDGE.slice(EDGE.indexOf('function proofQuality'))
    expect(order(e.slice(0, e.indexOf('\n}')))).toEqual(order(s.slice(0, s.indexOf('\n}'))))
  })

  it('is logged where the other beat counters are', () => {
    expect(EDGE).toMatch(/proof_quality: proofQualityCounts\(/)
    expect(EDGE.indexOf('proof_quality')).toBeGreaterThan(EDGE.indexOf("event: 'beat_substance'"))
  })
})

describe('the real corpus, classified', () => {
  // ⚠️ THESE ARE VERBATIM STRINGS FROM PRODUCTION GENERATIONS, not invented
  // examples. A regression here means the classifier stopped recognising the
  // shape that started all of this.
  it.each([
    ['creator_knowledge', 'substance_enum'],
    ['creator_experience', 'substance_enum'],
    ['general', 'substance_enum'],
    ['creator_opinion', 'substance_enum'],
    ["Creator's stated knowledge of wealth paths.", 'names_a_source'],
    ["Creator's personal experience bootstrapping multiple businesses (gym, supplement company, software company).", 'names_a_source'],
    ['General knowledge of fund management as a wealth path.', 'names_a_source'],
    ['Reference structure (technique).', 'names_a_source'],
    ['Specific knowledge from creator.', 'names_a_source'],
    ['Establishes the problem and promises a solution.', 'names_an_effect'],
    ['Sets up the framework for the solution.', 'names_an_effect'],
    ['Provides evidence and clarifies one path.', 'names_an_effect'],
    ['Engages the audience further.', 'names_an_effect'],
    ['N/A', 'absent'],
    ['none', 'absent'],
    // The one creator whose run got it right — the shape the field is FOR.
    ['Demonstration with phone, showing correct and incorrect framing.', 'shootable'],
    ['Demonstration with light source and creator, showing 45-degree angle.', 'shootable'],
    ['The receipt on the desk', 'shootable'],
    ['Straight to camera', 'shootable'],
    // ⚠️ THE CLASSIFIER OVER-REJECTED, AND ONLY THE POST-FIX RUN SHOWED IT. The
    // source pattern matched a BARE "Creator", not just the possessive, so every
    // proof whose subject is the person on camera was filed as naming a source.
    // These are the shape the field is FOR and they were being counted as the
    // defect — which also means my first hand-count of the old corpus was too
    // harsh: 61% wrong, not 97%.
    //
    // ⚖️ THE DISTINCTION IS GRAMMATICAL AND DECIDABLE. "Creator's knowledge" is
    // possessive and names where something came from; "Creator holding phone" is
    // a subject doing something in frame.
    ['Creator at desk, writing on a whiteboard or notepad', 'shootable'],
    ['Creator holding phone, demonstrating a wonky angle', 'shootable'],
    ['Creator typing on a laptop, showing a spreadsheet', 'shootable'],
    ['Creator gesturing to a window or light source at 45-degree angle', 'shootable'],
    ['Graph showing revenue comparison for project vs. retainer', 'shootable'],
    ['Screen recording of a simple AI tool interface', 'shootable'],
    // …while the possessive still names a source, which is what it always did.
    ["Creator's experience raising capital for Skool", 'names_a_source'],
    ['Creator experience with paid ads', 'names_a_source'],
  ])('classifies %j as %s', (value, expected) => {
    expect(proofQuality(value)).toBe(expected)
  })

  it('reproduces the corpus split that exposed the defect', () => {
    // A sample standing in for the 192, in the measured proportions' shape: the
    // wrong answers outnumber the right one heavily, and the counter must SAY so
    // rather than averaging it away.
    const plan = [
      { beat: '', targetSec: null, proof: 'creator_knowledge' },
      { beat: '', targetSec: null, proof: "Creator's stated knowledge of wealth paths." },
      { beat: '', targetSec: null, proof: 'Establishes the problem and promises a solution.' },
      { beat: '', targetSec: null, proof: 'Demonstration with phone, showing the wonky line.' },
      { beat: '', targetSec: null, proof: 'N/A' },
    ]
    expect(proofQualityCounts(plan)).toEqual({
      shootable: 1, substance_enum: 1, names_a_source: 1, names_an_effect: 1, absent: 1,
    })
  })
})

describe('only a shootable answer is handed on as a proof', () => {
  it('passes a real one through', () => {
    expect(proofAt([{ beat: '', targetSec: null, proof: 'The receipt on the desk' }], 0))
      .toBe('The receipt on the desk')
  })

  it.each(['creator_knowledge', "Creator's experience with X", 'Establishes the problem', 'n/a'])(
    'refuses %j', (v) => {
      expect(proofAt([{ beat: '', targetSec: null, proof: v }], 0)).toBe('')
    })
})

describe('the instruction names the three wrong shapes', () => {
  it('forbids them explicitly rather than only describing the right one', () => {
    // ⚖️ THE ORIGINAL PROMPT ALREADY SAID what proof was for — "a screen, the
    // object in hand, a number, a story" — and the model wrote the substance
    // enum anyway. Describing the target did not displace the wrong answer; the
    // wrong answers had to be named.
    const line = EDGE.slice(EDGE.indexOf('- beat_plan[].proof is'))
      .slice(0, 1600)
    expect(line).toMatch(/creator_knowledge/)
    expect(line).toMatch(/Establishes the problem/)
    expect(line).toMatch(/NOT what the beat achieves/)
    // And it gives an escape hatch, so "nothing to show" has a real answer
    // instead of pushing the model back towards inventing one.
    expect(line).toMatch(/Straight to camera/)
  })
})
