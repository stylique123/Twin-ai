import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { relationshipLabel } from '@twinai/shared'

/**
 * ⚠️ "SOMETHING I SELL" WAS A REDIRECT, NOT A DOOR.
 *
 * Reported from production: "when I click something I sell, pick a product, why
 * does it still take me to the product library and there's no option to choose
 * anything?" The button read "Pick a product" and navigated to `/products` —
 * the creator said what they wanted to make a video about and was answered with
 * a filing cabinet, with the build abandoned behind them.
 *
 * ⚖️ THE DOOR NOW ANSWERS ITS OWN QUESTION, and the choice travels with the
 * build so the next screen does not ask it again.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const CREATE = readFileSync(join(HERE, 'V2Create.tsx'), 'utf8')
const BUILDING = readFileSync(join(HERE, 'V2Building.tsx'), 'utf8')

describe('the product door picks a product', () => {
  it('opens a chooser instead of navigating away', () => {
    expect(CREATE).toContain("if (door === 'product') {")
    expect(CREATE).toContain('setPicking(true)')
    // ⚠️ THE DEFECT ITSELF. A redirect to the library on this door is the bug.
    expect(CREATE).not.toContain("nav(door === 'product' ? '/products' : '/gallery')")
  })

  it('still records the door where it is taken', () => {
    // The choice changed; what we learn from it did not.
    const branch = CREATE.slice(CREATE.indexOf("if (door === 'product') {"))
    expect(branch.slice(0, 400)).toContain('recordEntryDoor({ door, source, offered: ALL_DOORS')
  })

  it('the chosen product travels into the build, and is not asked again', () => {
    expect(CREATE).toContain('selected_product_id: p.id')
    expect(BUILDING).toContain('selected_product_id?: string')
    // ⚖️ BOTH READERS. The send must carry it, AND the "which one?" question
    // must count it as answered — otherwise the creator picks a product and is
    // immediately asked which product.
    expect(BUILDING).toContain('chosenId: answersRef.current[PRODUCT_CHOICE_FIELD] ?? state.selected_product_id ?? null')
    expect(BUILDING).toContain("(answersRef.current[PRODUCT_CHOICE_FIELD] ?? state.selected_product_id ?? '').trim()")
  })

  it('an unread library is never rendered as an empty one', () => {
    // ⚠️ null IS "WE DO NOT KNOW", and telling a creator with a full library
    // that it is empty would send them to add a duplicate of what they have.
    expect(CREATE).toContain('myProducts === null ?')
    expect(CREATE).toContain('We could not read your products just now')
    expect(CREATE).toContain('myProducts.length === 0 ?')
  })

  it('the relationship is worded by the one shared authority', () => {
    // ⚖️ Two screens describing one legal fact two ways is how a disclosure
    // rule and a label come to disagree.
    expect(CREATE).toContain('relationshipLabel(p.relationship)')
    expect(relationshipLabel('SPONSOR')).toBe('A sponsor pays you to feature it')
    // A value from an older build is never printed raw at a creator.
    expect(relationshipLabel('WHATEVER')).toBe('Relationship not recorded')
    expect(relationshipLabel(null)).toBe('Relationship not recorded')
  })

  it('no speech API, and the pointer to the one that already exists', () => {
    // ⚖️ WAVE 5.1, DECIDED: every phone keyboard already dictates, and the
    // browser API would send the creator's raw thinking to a third party.
    expect(CREATE).toContain('tap the mic on your keyboard')
    expect(CREATE).not.toContain('SpeechRecognition')
  })
})
