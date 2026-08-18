// A LABEL CANNOT BE FILLED IN.
//
// ⚠️ THE TRANSCRIPT PASS CAN ALREADY SAY "this is a mistakes video". That is a
// label. What turns it into a script is knowing a mistakes video needs a
// recognisable first mistake, a more surprising second, a re-hook before the
// third, and a what-to-do-instead — and that each is a HOLE somebody must supply
// something for.
import { describe, expect, it } from 'vitest'
import {
  CONTAINER_TEMPLATES, templateFor, requiredSlots,
} from '../containerTemplates'
import { CONTAINER_TYPES, CONTENT_SLOT_KINDS, BEAT_ROLES } from '../referenceContentProfile'

describe('every template is a shape, not a script', () => {
  it('names no sentence a viewer could hear', () => {
    // ⚠️ A TEMPLATE THAT CARRIED PROSE WOULD MAKE THIS FILE A WRITER, and then
    // two stages would be writing. Purposes are instructions ABOUT a beat.
    for (const t of CONTAINER_TEMPLATES) {
      for (const b of t.beats) {
        expect(b.purpose.length, `${t.container}/${b.label}`).toBeGreaterThan(10)
        expect(b.purpose).not.toMatch(/^["“]/)
      }
    }
  })

  it('uses only roles and slot kinds that already exist', () => {
    // ⚖️ A SIXTEENTH BEAT ROLE INVENTED HERE would be a second vocabulary for
    // the same idea — the drift this repo keeps paying to remove.
    for (const t of CONTAINER_TEMPLATES) {
      for (const b of t.beats) {
        expect(BEAT_ROLES, b.label).toContain(b.role)
        if (b.needs !== null) expect(CONTENT_SLOT_KINDS, b.label).toContain(b.needs)
      }
    }
  })

  it('opens with a hook and closes with a call to action', () => {
    for (const t of CONTAINER_TEMPLATES) {
      expect(t.beats[0].role, t.container).toBe('hook')
      expect(t.beats[t.beats.length - 1].role, t.container).toBe('cta')
    }
  })

  it('labels every beat distinctly, because a label names a slot', () => {
    for (const t of CONTAINER_TEMPLATES) {
      const labels = t.beats.map((b) => b.label)
      expect(new Set(labels).size, t.container).toBe(labels.length)
    }
  })
})

describe('the ordering IS the craft', () => {
  it('a round-up goes recognisable, then surprising, then strongest', () => {
    // ⚠️ THREE INTERCHANGEABLE ITEMS IS A LIST. Recognisable → surprising →
    // strongest is a video somebody watches to the end, and that order is the
    // reusable part of the reference.
    const t = templateFor('numbered_list')!
    expect(t.beats.map((b) => b.label)).toEqual([
      'hook', 'relatable_item', 'surprising_item', 'rehook',
      'strongest_item', 'payoff', 'cta',
    ])
  })

  it('and the re-hook sits before the last item, where it buys the second half', () => {
    // ⚖️ THE BEAT THE TELEPROMPTER USED TO DELETE. It is load-bearing.
    for (const c of ['numbered_list', 'mistakes', 'recommendation'] as const) {
      const beats = templateFor(c)!.beats
      const rehook = beats.findIndex((b) => b.role === 'rehook')
      const lastItem = beats.map((b) => b.role).lastIndexOf('item')
      expect(rehook, c).toBeGreaterThan(0)
      expect(rehook, c).toBeLessThan(lastItem)
    }
  })
})

describe('what has to be supplied, per container', () => {
  it('a round-up of things needs three distinct things', () => {
    // ⚠️ THE ARITHMETIC `slotFill` DOES. One product cannot fill three slots,
    // and this is where the three come from.
    const needs = requiredSlots(templateFor('recommendation')!)
    expect(needs.filter((b) => b.needs === 'product')).toHaveLength(3)
  })

  it('a confession needs the creator’s own experience, which no library supplies', () => {
    const needs = requiredSlots(templateFor('confession')!)
    expect(needs.some((b) => b.needs === 'personal_experience')).toBe(true)
  })

  it('and a framework needs a worked example or it is a list of words', () => {
    const needs = requiredSlots(templateFor('framework')!)
    expect(needs.some((b) => b.needs === 'example')).toBe(true)
  })
})

describe('what this vocabulary refuses to cover', () => {
  it('`other` has no template', () => {
    // ⚠️ INVENTING A GENERIC HOOK/POINT/PAYOFF FOR AN UNRECOGNISED SHAPE would
    // turn "we do not know what this is" into a confident structure — the
    // fabricated-certainty failure one layer above the fields.
    expect(templateFor('other')).toBeNull()
    expect(templateFor(null)).toBeNull()
  })

  it('and every other container has exactly one', () => {
    const covered = new Set(CONTAINER_TEMPLATES.map((t) => t.container))
    const missing = CONTAINER_TYPES.filter((c) => c !== 'other' && !covered.has(c))
    expect(missing).toEqual([])
    expect(covered.size).toBe(CONTAINER_TEMPLATES.length)
  })
})
