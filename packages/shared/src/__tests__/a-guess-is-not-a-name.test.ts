import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mintFromWorkKind } from '../productEntity'

/**
 * ONE PROMISE, TWO CONSUMERS, ONE OF WHICH KEPT IT.
 *
 * ⚠️ OBSERVED LIVE ON A REAL BAKERY ACCOUNT. The creator could not add the
 * products she sells, because a product she never added already occupied the
 * one owned slot — named:
 *
 *   "Fresh artisan sourdough loaves for local orders and curated home baking
 *    gear recommendations via link in bio"
 *
 * That is the raw onboarding GUESS in a NAME field, and it asserts a commercial
 * channel — a bio link — she does not have.
 *
 * The scan screen says out loud: "We guessed this from your posts. We will not
 * use it until you edit it." `brief.offer` keeps that promise, written as
 * `offerTouched ? product : null`. The ENTITY MINT took `product`
 * unconditionally. Same value, same screen, two consumers, one gate.
 */

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const ONBOARDING = readFileSync(
  join(repo, 'apps', 'web', 'src', 'pages', 'Onboarding.tsx'), 'utf8')

const GUESS = 'Fresh artisan sourdough loaves for local orders and curated home '
  + 'baking gear recommendations via link in bio'

describe('an unconfirmed guess mints nothing', () => {
  const untouched = mintFromWorkKind('professional', { name: GUESS })

  it('the mint still happens — the entity is not lost', () => {
    expect(untouched).toBeTruthy()
  })

  // ⚠️ THE ACTUAL BAKERY DEFECT. Absent is honest; a guess wearing the
  // creator's voice is not.
  it('does not become the name', () => {
    expect(untouched!.name).toBeNull()
  })

  it('does not become the description either', () => {
    expect(untouched!.creatorSummary).toBeNull()
  })
})

describe('a confirmed offer lands where it is true', () => {
  const touched = mintFromWorkKind('professional', {
    name: GUESS, offerConfirmed: true,
  })

  // ⚖️ IT IS A DESCRIPTION, NOT A NAME. "Fresh artisan sourdough loaves for
  // local orders" answers "what is it and who is it for", never "what do you
  // call it" — and `creator_summary` reaches the writer labelled as the
  // creator's OWN words, which an edited line is and a guess is not.
  it('never becomes a name, even confirmed', () => {
    expect(touched!.name).toBeNull()
  })

  it('becomes the description', () => {
    expect(touched!.creatorSummary).toBe(GUESS)
  })

  it('an empty offer confirms to nothing', () => {
    const blank = mintFromWorkKind('professional', { name: '   ', offerConfirmed: true })
    expect(blank!.creatorSummary).toBeNull()
    expect(blank!.name).toBeNull()
  })
})

describe('the caller passes the gate it already tracks', () => {
  // ⚠️ THE FIX IS ONLY REAL IF THE CALL SITE SENDS IT. mintFromWorkKind
  // defaulting to "unconfirmed" is safe, which means a caller that forgets the
  // flag silently loses a CONFIRMED offer rather than storing a guess — the
  // safe direction, and still wrong.
  it('Onboarding passes offerTouched to the mint', () => {
    expect(ONBOARDING).toMatch(/offerConfirmed: offerTouched/)
  })

  // The brief's gate is the one that was already correct; it must stay.
  it('and the brief still honours the same gate', () => {
    expect(ONBOARDING).toMatch(/offer: offerTouched \? product : null/)
  })

  // ⚠️ THE SCREEN'S PROMISE IS THE CONTRACT BOTH SIDES IMPLEMENT. If this
  // sentence is ever removed, the gate has no stated reason and the next
  // person deletes it as ceremony.
  it('the promise the creator reads is still on the screen', () => {
    expect(ONBOARDING).toMatch(/We will not use it until you edit it/)
  })
})
