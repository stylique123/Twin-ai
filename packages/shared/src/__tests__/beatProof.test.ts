// WHAT MAKES THIS BEAT BELIEVABLE, SHOWN TO THE PERSON HOLDING THE CAMERA.
//
// ⚠️ THE DEFECT. `beat_plan.proof` — a screen, the object in hand, a number, a
// story — has been required of the model since the plan shipped, filled on every
// generation, and parsed into `PlannedBeat.proof`. Nothing read it. The one
// field that names what a creator should CAPTURE reached no surface, so the
// answer to "what do I actually need in frame for this to land" was computed,
// stored, and thrown away on every single video.
//
// ⚠️ AND THE FIRST FIX WAS WRONG. `proof` was wired onto the plan card and the
// capture screen, with tests that passed. Then 192 real proofs said 23 were the
// `substance` enum verbatim, 107 named a SOURCE, 18 restated the PURPOSE, and
// about 6 were filmable — so the row would have read "What makes this land:
// creator_knowledge" to somebody holding a camera. The display is reversed and
// the reader is a production counter until the counter says otherwise; see
// `beatProofParity.test.ts`.
//
// What remains here is the value-level contract that survives either way: a
// required field filled with "n/a" must render as nothing, and `beat` must
// supply the purpose the card's heading actually promises.
import { describe, expect, it } from 'vitest'
import { buildRecordingScript } from '../recordingScriptAdapter'
import { readProof, proofAt, purposeAt } from '../beatPlan'
import type { Blueprint } from '../types'

function bp(over: Record<string, unknown> = {}): Blueprint {
  return {
    hook_options: ['Nobody tells you this about lighting'],
    script: [
      { section: 'Hook', line: 'Nobody tells you this about lighting', direction: '' },
      { section: 'Setup', line: 'Here is the setup nobody explains properly.', direction: '' },
      { section: 'Proof', line: 'Here is the proof that it actually works.', direction: '' },
      { section: 'CTA', line: 'Grab the preset pack in my bio.', direction: '' },
    ],
    beat_plan: [
      { beat: 'Open on the contradiction', target_sec: '3', proof: 'Your face, no cuts' },
      { beat: 'Set up why it is counterintuitive', target_sec: '11', proof: 'The lamp in shot' },
      { beat: 'Show the before and after', target_sec: '22', proof: 'Screen: the two frames side by side' },
      { beat: 'Point at the pack', target_sec: '5', proof: 'The pack open on your desk' },
    ],
    ...over,
  } as unknown as Blueprint
}

function byLine(blueprint: Blueprint) {
  const rs = buildRecordingScript({ generationId: 'g', blueprint })
  // ⚠️ THIS COLLECTED `proof` AND NOTHING EVER READ IT — the defect in this
  //  file's own header, reproduced inside the file. `buildRecordingScript` does
  //  not put `proof` on a scene (it lives on `beat_plan`, and the adapter
  //  mentions it only in a comment), so `s.proof` was ALWAYS undefined; and no
  //  assertion anywhere reads `out[...].proof`, so undefined never showed.
  //
  //  ⚖️ THE CAST WAS WHAT ALLOWED IT. `as Array<Record<string, unknown>>` widened
  //  a typed `RecordingScene` into a bag of keys, so reading a field the type
  //  does not have compiled silently. Dropping the dead collection removes the
  //  need for the cast, and the scenes are now walked as what they are.
  //
  //  ⚖️ THE FILE'S REAL PROOF COVERAGE IS UNTOUCHED: `readProof`, `proofAt` and
  //  the "n/a" rejection cases test `beat_plan` directly, which is where `proof`
  //  actually lives.
  const out: Record<string, { purpose?: string }> = {}
  for (const s of rs.scenes) {
    const d = typeof s.dialogue === 'string' ? s.dialogue : ''
    if (d) out[d] = { purpose: s.purpose }
  }
  return out
}

describe('a required field filled with nothing renders as nothing', () => {
  // ⚠️ A MODEL ASKED FOR A REQUIRED FIELD ALWAYS FILLS IT. A beat that genuinely
  // needs no proof still comes back with "n/a" in the slot, and a card reading
  // "What makes this land: N/A" in front of somebody with a camera up is worse
  // than no row — it teaches them to skip the row that sometimes says something.
  it.each(['n/a', 'N/A', 'none', 'None', 'nil', 'null', 'not applicable', 'proof', 'tbd', '-', '--', '...'])(
    'rejects %j as a non-value', (v) => { expect(readProof(v)).toBe('') },
  )

  it('rejects a wholly bracketed placeholder', () => {
    expect(readProof('[proof]')).toBe('')
    expect(readProof('[the object in hand]')).toBe('')
  })

  it('keeps a real proof that merely CONTAINS one of those words', () => {
    // ⚖️ ANCHORED, NOT SUBSTRING. "None of the numbers are on screen" is a real
    // instruction, and "Proof: the receipt" is the model labelling its own field.
    // Dropping either would lose a value on a word match.
    expect(readProof('None of the numbers are on screen — say them')).not.toBe('')
    expect(readProof('Proof: the receipt in your hand')).not.toBe('')
    expect(readProof('The n/a column highlighted')).not.toBe('')
  })

})

describe('the plan supplies the purpose the card promises', () => {
  it('prefers the planned purpose over the section LABEL', () => {
    // ⚠️ THE CARD HEADING SAYS "Why this scene matters" AND THE VALUE WAS
    // "Setup". A section name is a label; `beat` is the sentence the model wrote
    // when asked what the beat is FOR, which is what the heading claims to show.
    const t = byLine(bp())
    expect(t['Here is the setup nobody explains properly.'].purpose)
      .toBe('Set up why it is counterintuitive')
  })

  it('falls back to the label, which every pre-plan blueprint has', () => {
    const t = byLine(bp({ beat_plan: undefined }))
    expect(t['Here is the setup nobody explains properly.'].purpose).toBe('Setup')
  })

  it('falls back when the plan filled the slot with a non-value', () => {
    const t = byLine(bp({
      beat_plan: [
        { beat: 'Open', target_sec: '3', proof: 'Face' },
        { beat: 'n/a', target_sec: '11', proof: 'The lamp in shot' },
        { beat: 'Show it', target_sec: '22', proof: 'Screen' },
        { beat: 'Close', target_sec: '5', proof: 'Pack' },
      ],
    }))
    expect(t['Here is the setup nobody explains properly.'].purpose).toBe('Setup')
  })
})

describe('the accessors index by source, like every other plan reader', () => {
  const plan = [
    { beat: 'one', targetSec: 3, proof: 'first' },
    { beat: 'two', targetSec: 11, proof: 'second' },
  ]
  it('reads position, and answers empty rather than throwing off the end', () => {
    expect(proofAt(plan, 1)).toBe('second')
    expect(purposeAt(plan, 1)).toBe('two')
    expect(proofAt(plan, 9)).toBe('')
    expect(purposeAt(null, 0)).toBe('')
  })
})
