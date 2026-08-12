// WHAT MAKES THIS BEAT BELIEVABLE, SHOWN TO THE PERSON HOLDING THE CAMERA.
//
// ⚠️ THE DEFECT. `beat_plan.proof` — a screen, the object in hand, a number, a
// story — has been required of the model since the plan shipped, filled on every
// generation, and parsed into `PlannedBeat.proof`. Nothing read it. The one
// field that names what a creator should CAPTURE reached no surface, so the
// answer to "what do I actually need in frame for this to land" was computed,
// stored, and thrown away on every single video.
//
// The guard in `beatPlanFieldsHaveReaders` proves a reader EXISTS. These tests
// are about whether it is the right value in the right place — a proof paired to
// the wrong beat is worse than none, because it tells a creator to hold up an
// object during the beat that has no object in it.
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
  const out: Record<string, { proof?: string | null; purpose?: string }> = {}
  for (const s of rs.scenes as Array<Record<string, unknown>>) {
    const d = typeof s.dialogue === 'string' ? s.dialogue : ''
    if (d) out[d] = { proof: s.proof as string | null, purpose: s.purpose as string }
  }
  return out
}

describe('proof lands on the beat it was written for', () => {
  it('pairs each proof with its own words, including hook and CTA', () => {
    // ⚠️ THE HOOK AND THE CTA ARE HELD OUT OF THE BODY LOOP, which is exactly
    // how they missed the beat plan's TARGET until #362. Same two beats, same
    // trap, one field later.
    const t = byLine(bp())
    expect(t['Nobody tells you this about lighting'].proof).toBe('Your face, no cuts')
    expect(t['Here is the setup nobody explains properly.'].proof).toBe('The lamp in shot')
    expect(t['Here is the proof that it actually works.'].proof)
      .toBe('Screen: the two frames side by side')
    expect(t['Grab the preset pack in my bio.'].proof).toBe('The pack open on your desk')
  })

  it('stays paired when the filter drops more than the hook', () => {
    const t = byLine(bp({
      script: [
        { section: 'Hook', line: 'Nobody tells you this about lighting', direction: '' },
        { section: 'Dead', line: '  ', direction: '' },
        { section: 'Setup', line: 'Here is the setup nobody explains properly.', direction: '' },
        { section: 'CTA', line: 'Grab the preset pack in my bio.', direction: '' },
      ],
      beat_plan: [
        { beat: 'Open', target_sec: '3', proof: 'Your face, no cuts' },
        { beat: 'Dead', target_sec: '7', proof: 'Nothing' },
        { beat: 'Setup', target_sec: '11', proof: 'The lamp in shot' },
        { beat: 'Close', target_sec: '5', proof: 'The pack open on your desk' },
      ],
    }))
    expect(t['Here is the setup nobody explains properly.'].proof).toBe('The lamp in shot')
    expect(t['Grab the preset pack in my bio.'].proof).toBe('The pack open on your desk')
  })

  it('leaves proof absent when no plan applies', () => {
    // Absent is not an empty proof and not a beat that needs none. Consumers
    // render the row only when there is something in it.
    const t = byLine(bp({ beat_plan: undefined }))
    for (const v of Object.values(t)) expect(v.proof).toBeUndefined()
  })
})

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

  it('does not put a non-value on the scene', () => {
    const t = byLine(bp({
      beat_plan: [
        { beat: 'Open', target_sec: '3', proof: 'n/a' },
        { beat: 'Setup', target_sec: '11', proof: 'The lamp in shot' },
        { beat: 'Proof', target_sec: '22', proof: '[proof]' },
        { beat: 'Close', target_sec: '5', proof: 'none' },
      ],
    }))
    expect(t['Nobody tells you this about lighting'].proof).toBeUndefined()
    expect(t['Here is the setup nobody explains properly.'].proof).toBe('The lamp in shot')
    expect(t['Here is the proof that it actually works.'].proof).toBeUndefined()
    expect(t['Grab the preset pack in my bio.'].proof).toBeUndefined()
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
