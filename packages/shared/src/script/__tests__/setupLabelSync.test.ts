import { describe, expect, it } from 'vitest'
import { syncSetupLabels } from '../setupLabelSync'

const row = (notes: string) => ({ shot: 'x', framing: 'Medium shot', notes })

describe('setupLabelSync', () => {
  it('rejoins a comma-split location description instead of treating the comma as a new "·" segment', () => {
    const shots = [
      row('Setup A · Standing in the center of a clean · brightly lit room · Medium shot'),
    ]
    const { shots: out } = syncSetupLabels(shots)
    expect(out[0].notes).toBe('Setup A · Standing in the center of a clean, brightly lit room · Medium shot')
    // never more than one "·" before the framing and one after the description
    expect((out[0].notes as string).match(/·/g)?.length).toBe(2)
  })

  it('never misreads a single location whose own name contains a comma as two locations', () => {
    const shots = [row('Setup A · Coffee Shop, Downtown · Wide')]
    const { shots: out } = syncSetupLabels(shots)
    expect(out[0].notes).toBe('Setup A · Coffee Shop, Downtown · Wide')
  })

  it('gives distinct, stable letters to distinct locations, in first-appearance order', () => {
    const shots = [
      row('Setup Z · Kitchen · Wide'),
      row('Setup Q · Home office · Medium shot'),
      row('Setup X · Living room · Close up'),
    ]
    const { shots: out, setupCount } = syncSetupLabels(shots)
    expect(out.map((s) => s.notes)).toEqual([
      'Setup A · Kitchen · Wide',
      'Setup B · Home office · Medium shot',
      'Setup C · Living room · Close up',
    ])
    expect(setupCount).toBe(3)
  })

  it('gives the same location repeated across beats the same letter every time, never a repeat for a different one', () => {
    const shots = [
      row('Setup A · Kitchen · Wide'),
      row('Setup B · Home office · Medium shot'),
      row('Setup C · Kitchen · Wide'),
    ]
    const { shots: out } = syncSetupLabels(shots)
    expect(out.map((s) => s.notes)).toEqual([
      'Setup A · Kitchen · Wide',
      'Setup B · Home office · Medium shot',
      'Setup A · Kitchen · Wide',
    ])
    const letters = out.map((s) => /Setup ([A-Z])/.exec(s.notes as string)?.[1])
    expect(new Set(letters).size).toBe(2)
  })

  it('is case- and spacing-insensitive when matching the same location back to its letter', () => {
    const shots = [
      row('Setup A · Kitchen · Wide'),
      row('Setup B ·   KITCHEN   ·  wide '),
    ]
    const { shots: out } = syncSetupLabels(shots)
    expect(out[1].notes).toBe('Setup A · KITCHEN · wide')
  })

  it('re-rendering the same beat sequence twice produces identical lettering both times (determinism)', () => {
    const shots = [
      row('Setup C · Kitchen · Wide'),
      row('Setup A · Home office · Medium shot'),
      row('Setup B · Kitchen · Wide'),
    ]
    const first = syncSetupLabels(shots).shots.map((s) => s.notes)
    const second = syncSetupLabels(shots).shots.map((s) => s.notes)
    expect(second).toEqual(first)
  })

  it('leaves a bare "Setup X" row (no description) untouched aside from its letter', () => {
    const shots = [row('Setup Q')]
    const { shots: out } = syncSetupLabels(shots)
    expect(out[0].notes).toBe('Setup A')
  })

  it('passes through rows whose notes carry no "Setup X" token', () => {
    const shots = [row('A quick cutaway.')]
    const { shots: out, relabeled } = syncSetupLabels(shots)
    expect(out[0]).toBe(shots[0])
    expect(relabeled).toBe(0)
  })

  it('returns an empty result for an empty or missing shot list', () => {
    expect(syncSetupLabels([]).shots).toEqual([])
    expect(syncSetupLabels(null).shots).toEqual([])
    expect(syncSetupLabels(undefined).shots).toEqual([])
  })
})

// ⚠️ THE SHAPE PRODUCTION ACTUALLY SENDS, AND THE CHANNEL THIS MODULE REPAIRS
// IS ALL BUT EMPTY. Measured against the live database on 2026-08-31: across
// every stored generation — 266 `shot_list` rows in 48 blueprints — exactly ONE
// row's `notes` begins with a "Setup " token. The rows below are frozen from
// generation 7f1ed901, the newest one, whose beat lengths were 3·8·13·18·23·28;
// its notes are prose, and prose is now the ordinary case, not the exception.
//
// ⚖️ SO `setup_label_resync` WILL KEEP REPORTING ZERO, and that is the channel
// being empty rather than the defect having stopped. Read the counter that way.
//
// ⚖️ AND THAT IS NOT A BUG TO FIX HERE. What a creator actually reads is
// lettered by `setupPlan.ts`, keyed on the SCRIPT's own (background, framing) —
// and `recordingScriptAdapter`'s `placeToStand` feeds it the beat's `location`
// when the writer supplies one, which the newest scripts do. That path is
// populated and correct. Re-pointing this file at the same structured fields
// would duplicate an identity `setupPlan` already owns, which is the one thing
// the setup rules exist to prevent: two screens deciding sameness separately
// and disagreeing about one script.
//
// What this freezes is the only behaviour that still matters here — prose rows
// pass through byte-identical. A pass that "repaired" them would overwrite the
// only direction those rows carry.
describe('the notes production really writes', () => {
  const REAL_ROWS = [
    { shot: 'Cover Frame', notes: 'Creator with intense, direct gaze, slightly furrowed brow. This will be the thumbnail.', framing: 'Medium close-up' },
    { shot: 'Hook Intro', notes: 'Creator speaking directly to camera, intense and focused.', framing: 'Medium close-up' },
    { shot: 'Reason Three with Prop', notes: "Creator holding up a small whiteboard with 'BOTTLENECK' written on it, pointing at the word.", framing: 'Medium close-up' },
    { shot: 'Solution and CTA', notes: 'Creator puts down prop, adopts a confident posture for the solution, then points to the comment section for the CTA.', framing: 'Medium shot' },
  ]

  it('leaves every prose row exactly as it was', () => {
    const result = syncSetupLabels(REAL_ROWS)
    expect(result.relabeled).toBe(0)
    expect(result.setupCount).toBe(0)
    result.shots.forEach((row, i) => { expect(row).toBe(REAL_ROWS[i]) })
  })
})
