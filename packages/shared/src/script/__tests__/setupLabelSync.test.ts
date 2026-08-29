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
