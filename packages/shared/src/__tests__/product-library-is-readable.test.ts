// THE PRODUCT TAB WAS LIVE AND UNREADABLE.
//
// ⚠️ REPORTED WITH A SCREENSHOT: "it's all muffled". It was not layout. The page
// was written in LIGHT-theme tokens and mounted on the dark app shell — 20 uses
// of `text-ink/50`, 8 of `text-ink/60`, 5 of `bg-ink` with `text-white`. `ink` is
// the near-black BACKGROUND colour, so body copy rendered dark-on-dark and the
// primary button was `bg-ink` on an `ink` page: an invisible button under
// invisible text.
//
// ⚖️ AND IT SHIPPED TWICE WITHOUT BEING SEEN. #395 fixed the route — the page
// had never been mounted at all — so the first time anyone could look at it was
// after that merge, and "the route works" was mistaken for "the page works".
// A component existing, a route existing, and a page a human can read are three
// different things.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'apps', 'web', 'src')
const PAGE = readFileSync(join(WEB, 'pages', 'ProductLibrary.tsx'), 'utf8')
/** A page that is known-good on the dark shell, for comparison. */
const REFERENCE = readFileSync(join(WEB, 'pages', 'v2', 'V2Building.tsx'), 'utf8')

/** Class names only — prose in comments mentions `ink` legitimately. */
const classes = (src: string): string =>
  (src.match(/className=\{?[`"][^`"]*[`"]/g) ?? []).join(' ')

describe('the page uses the dark palette it is rendered on', () => {
  it('has no dark-on-dark body text', () => {
    // ⚠️ `text-ink` IS THE BACKGROUND COLOUR. At any opacity it is unreadable
    // here, and /50 — the most common value on the page — was the worst of it.
    expect(classes(PAGE)).not.toMatch(/text-ink\b/)
  })

  it('has no invisible surfaces or borders', () => {
    expect(classes(PAGE)).not.toMatch(/bg-ink\b(?!2)/)
    expect(classes(PAGE)).not.toMatch(/border-ink\b/)
  })

  it('reads from the same token family as the rest of the app', () => {
    // ⚖️ Not "some light text" — the SAME vocabulary, so the page belongs to
    // the product rather than merely being legible by accident.
    for (const token of ['text-cream', 'text-sand', 'text-stone']) {
      expect(REFERENCE, `reference should use ${token}`).toMatch(token)
    }
    expect(classes(PAGE)).toMatch(/text-sand/)
    expect(classes(PAGE)).toMatch(/text-stone/)
  })

  it('uses the app\'s primary button rather than a hand-rolled one', () => {
    expect(classes(PAGE)).toMatch(/btn-gradient/)
  })
})

describe('a selected chip looks selected', () => {
  it('does not paint the chosen state in the background colour', () => {
    // ⚠️ THE CHIPS WERE `bg-ink` WHEN SELECTED — the page background. Chosen and
    // unchosen rendered identically, so the control silently had no state.
    expect(PAGE).not.toMatch(/\? 'border-white\/25 bg-ink text-white'/)
  })

  it('uses the same active treatment as the create and remix screens', () => {
    expect(PAGE).toMatch(/border-coral\/50 bg-coral\/\[0\.08\] text-cream/)
  })

  it('announces the state rather than relying on colour alone', () => {
    // ⚖️ Colour-only state fails anyone who cannot see the difference, and it
    // also fails a screenshot review — which is how this was found.
    expect((PAGE.match(/aria-pressed=\{/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

describe('what the page must still do', () => {
  it('offers a way in when the library is empty', () => {
    // ⚖️ The empty state used to be a dead end — the only route in was claiming
    // a suggestion the extractor had already found.
    expect(PAGE).toMatch(/entities\.length === 0 && !addingNew/)
    expect(PAGE).toMatch(/Add a product/)
  })

  it('still lists the mentions it found, so claiming stays one tap', () => {
    expect(PAGE).toMatch(/addingNew/)
  })
})
