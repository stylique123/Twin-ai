// @vitest-environment jsdom
//
// THE ORDER OF A FORM IS AN INSTRUCTION, AND THIS ONE WAS BACKWARDS.
//
// ⚠️ REPORTED: the link came FIRST and is optional; the name came second and is
// what every card is titled by. So the first thing asked was the thing a
// creator is least likely to have to hand, and the required answer looked like
// an afterthought.
//
// ⚖️ THE OLD ORDER HAD A REAL ARGUMENT AND IT IS NARROWED, NOT DISCARDED.
// "Link first" existed because a creator asked to summarise their own product
// from memory writes something different every time, and that becomes the only
// thing the writer knows. Still true — so the link is still here and still
// reads the page. It is just no longer the FIRST question, because a form opens
// with what the person already knows.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'ProductLibrary.tsx'), 'utf8')

/** Where each question appears in the add form, by an anchor that is the
 *  question itself rather than a variable name — a reorder that moved the state
 *  and not the fields would otherwise pass. */
const at = (needle: string): number => {
  const i = SRC.indexOf(needle)
  expect(i, `anchor not found: ${needle}`).toBeGreaterThan(-1)
  return i
}

describe('the add form asks what they already know first', () => {
  it('runs name → description → what is it → relationship → used it → link', () => {
    const order = [
      "htmlFor=\"product-name\"",
      "htmlFor=\"product-summary\"",
      'label="What is it?"',
      'label="What is your relationship to it?"',
      'label="Have you actually used it yourself?"',
      "htmlFor=\"product-link\"",
    ].map(at)

    for (let i = 1; i < order.length; i++) {
      expect(order[i], `field ${i} is out of order`).toBeGreaterThan(order[i - 1]!)
    }
  })

  it('the link is LAST, after every question about the thing itself', () => {
    // ⚠️ THE ONE THAT WAS REPORTED. Asserted against the last question rather
    // than a count, so inserting a new question between them cannot silently
    // put the link back in the middle.
    expect(at('htmlFor="product-link"')).toBeGreaterThan(at('label="Have you actually used it yourself?"'))
  })

  it('and the photos sit with the link, not before the questions', () => {
    // ⚖️ BOTH GIVE TWIN SOMETHING TO READ rather than asking the creator to be
    // the extractor, so they belong together at the end.
    // ⚠️ ANCHORED ON THE ADD FORM'S OWN LABEL. The card panel has a "Photos of
    // it" heading too, and matching that one made this assertion compare the
    // wrong component — a guard that reads a different screen than the one it
    // names.
    expect(at('Photos of it (optional)')).toBeGreaterThan(at('label="What is it?"'))
  })
})
