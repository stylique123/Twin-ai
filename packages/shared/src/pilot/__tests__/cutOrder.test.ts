// THE CONTROLS ONLY WORK IF NOBODY CAN SPOT THEM.
//
// These pin the two properties the bad-cut rate depends on: a reviewer cannot
// tell a control from a real cut by its position in the queue, and reloading
// does not reshuffle the packet under them.
import { describe, it, expect } from 'vitest'
import {
  presentationOrder, presentToReviewer,
  CUT_ANSWERS, CUT_QUESTION, CUT_ANSWER_KEYS,
  type CutReviewItem,
} from '../cutOrder'

/** Mirrors what scripts/cut-review.mjs emits: every real cut, THEN every control. */
const packet = (cuts: number[], controls: number[], render = 'r1'): CutReviewItem[] => [
  ...cuts.map((atMs) => ({ render_id: render, startMs: atMs - 1750, endMs: atMs + 1750, atMs, offsetInClipMs: 1750, isControl: false })),
  ...controls.map((atMs) => ({ render_id: render, startMs: atMs - 1750, endMs: atMs + 1750, atMs, offsetInClipMs: 1750, isControl: true })),
]

const CUTS = [2000, 5000, 9000, 14000, 18000, 23000, 27000, 31000]
const CONTROLS = [3800, 7200, 11500, 16000, 20500, 25000, 29000, 33000]

describe('presentationOrder', () => {
  it('does not leave the real cuts in a block at the front', () => {
    const ordered = presentationOrder(packet(CUTS, CONTROLS), 'seed-a')
    const firstHalf = ordered.slice(0, CUTS.length).filter((i) => !i.isControl).length
    // Unshuffled this is 8 of 8 -- the exact defect. Anything below the full
    // block is evidence the order is not the input order.
    expect(firstHalf).toBeLessThan(CUTS.length)
  })

  it('CONTROL: the raw builder output really is cuts-then-controls, so the test above can fail', () => {
    // ⚠️ A guard that has never been shown a failing case is not a guard. This
    // asserts the input genuinely has the bias presentationOrder removes.
    const raw = packet(CUTS, CONTROLS)
    expect(raw.slice(0, CUTS.length).every((i) => !i.isControl)).toBe(true)
    expect(raw.slice(CUTS.length).every((i) => i.isControl)).toBe(true)
  })

  it('is stable: the same packet and seed always present in the same order', () => {
    const a = presentationOrder(packet(CUTS, CONTROLS), 'seed-a').map((i) => i.atMs)
    const b = presentationOrder(packet(CUTS, CONTROLS), 'seed-a').map((i) => i.atMs)
    expect(a).toEqual(b)
  })

  it('differs between packets, so the interleaving is not learnable across renders', () => {
    const a = presentationOrder(packet(CUTS, CONTROLS, 'r1'), 'seed-a').map((i) => i.atMs)
    const b = presentationOrder(packet(CUTS, CONTROLS, 'r2'), 'seed-b').map((i) => i.atMs)
    expect(a).not.toEqual(b)
  })

  it('does not depend on the incoming array order', () => {
    const forward = presentationOrder(packet(CUTS, CONTROLS), 's').map((i) => i.atMs)
    const reversed = presentationOrder([...packet(CUTS, CONTROLS)].reverse(), 's').map((i) => i.atMs)
    expect(forward).toEqual(reversed)
  })

  it('loses nothing and invents nothing', () => {
    const input = packet(CUTS, CONTROLS)
    const ordered = presentationOrder(input, 's')
    expect(ordered.length).toBe(input.length)
    expect([...ordered].sort((x, y) => x.atMs - y.atMs).map((i) => i.atMs))
      .toEqual([...CUTS, ...CONTROLS].sort((x, y) => x - y))
    expect(ordered.filter((i) => i.isControl).length).toBe(CONTROLS.length)
  })

  it('survives an empty packet rather than throwing at the reviewer', () => {
    expect(presentationOrder([], 's')).toEqual([])
  })
})

describe('presentToReviewer', () => {
  it('does not carry isControl to the page at all', () => {
    const shown = presentToReviewer(packet(CUTS, CONTROLS), 's')
    for (const item of shown) {
      expect(Object.hasOwn(item, 'isControl')).toBe(false)
    }
    // Belt and braces: not merely absent, not recoverable from a stringify either.
    expect(JSON.stringify(shown)).not.toContain('isControl')
  })

  it('numbers positions from 1 in the order shown, not by time', () => {
    const shown = presentToReviewer(packet(CUTS, CONTROLS), 's')
    expect(shown.map((i) => i.position)).toEqual(shown.map((_, i) => i + 1))
  })

  it('keeps where the cut falls inside the clip', () => {
    const shown = presentToReviewer(packet([5000], [], 'r1'), 's')
    expect(shown[0].atMs).toBe(5000)
    expect(shown[0].offsetInClipMs).toBe(1750)
  })
})

describe('the words a person reads', () => {
  it('asks one plain question with no editing jargon', () => {
    const jargon = ['artefact', 'artifact', 'transient', 'splice', 'waveform', 'crossfade', 'zero-crossing']
    const surface = [CUT_QUESTION, ...Object.values(CUT_ANSWERS)].join(' ').toLowerCase()
    for (const word of jargon) expect(surface).not.toContain(word)
  })

  it("offers can't-tell as an answer, because a rate over only the obvious clips is not a rate", () => {
    expect(Object.keys(CUT_ANSWERS)).toContain('UNSURE')
  })

  it('maps one keystroke to each answer and nothing else', () => {
    expect(Object.values(CUT_ANSWER_KEYS).sort()).toEqual(Object.keys(CUT_ANSWERS).sort())
  })
})
