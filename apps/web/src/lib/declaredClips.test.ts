// The capture surface's list comes from the SCRIPT, and nowhere else.
//
// These are the claims worth pinning, because each of them is a way the surface
// could quietly stop matching the script it is supposed to be pointed at.
import { describe, expect, it } from 'vitest'
import { declaredSlots } from './declaredClips'
import type { Blueprint } from '../lib/api'

function blueprint(lines: string[]): Blueprint {
  return { script: lines.map((line) => ({ line })) } as unknown as Blueprint
}

describe('declaredSlots', () => {
  it('lists exactly what the script declared, in script order', () => {
    expect(declaredSlots(blueprint([
      'Here is the thing everyone gets wrong.',
      '[SHOW: the settings page]',
      'And this is where it bites you. [SHOW: the billing screen]',
    ]), null)).toEqual([
      { label: 'the settings page', sceneNumber: 2 },
      { label: 'the billing screen', sceneNumber: 3 },
    ])
  })

  it('is case-insensitive about the marker — a lowercase one is not a gap', () => {
    // `containerResolution` matches `[show: …]` case-insensitively on purpose,
    // because a marker that only counts in capitals silently becomes an
    // unfilled container. This surface must agree with it or the two disagree
    // about what the same line means.
    expect(declaredSlots(blueprint(['[show: the dashboard]']), null))
      .toEqual([{ label: 'the dashboard', sceneNumber: 1 }])
  })

  it('offers ONE capture per distinct slot, however often it is declared', () => {
    // Two buttons for one label would produce two rows fighting over one
    // `clip_label`, and nothing downstream could tell them apart.
    expect(declaredSlots(blueprint([
      '[SHOW: the dashboard]', 'talking', '[SHOW: The Dashboard]',
    ]), null)).toEqual([{ label: 'the dashboard', sceneNumber: 1 }])
  })

  it('never offers a capture for an unfilled container', () => {
    // `[product name]` is a GAP, not a clip. Offering to record it would tell
    // the creator the hole in their script is something they can film.
    expect(declaredSlots(blueprint([
      'Today I want to talk about [product name]',
      '[their objection]',
    ]), null)).toEqual([])
  })

  it('never offers a capture for a hook placeholder', () => {
    expect(declaredSlots(blueprint(['[hook option 1]', 'insert the hook here']), 'my hook'))
      .toEqual([])
  })

  it('declares nothing for an empty marker', () => {
    // `[SHOW:]` names no slot. A blank capture button is a button whose clip
    // could never be matched back to anything.
    expect(declaredSlots(blueprint(['[SHOW:]', '[SHOW:   ]']), null)).toEqual([])
  })

  it('is empty for a script with nothing to show — the surface then renders nothing', () => {
    expect(declaredSlots(blueprint(['just me talking', 'still talking']), null)).toEqual([])
    expect(declaredSlots({ } as Blueprint, null)).toEqual([])
  })
})
