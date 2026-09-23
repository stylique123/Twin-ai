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
    // Re-pointed: a creator-chosen split names each entity by its item (her act
    // confirms it); otherwise the gate is still `offerTouched`.
    expect(ONBOARDING).toMatch(/offerConfirmed: items \? true : offerTouched/)
  })

  // The brief's gate is the one that was already correct; it must stay.
  it('and the brief still honours the same gate', () => {
    expect(ONBOARDING).toMatch(/offer: offerTouched \? product : null/)
  })

  // ⚠️ THE SCREEN'S PROMISE IS THE CONTRACT BOTH SIDES IMPLEMENT. If this
  // sentence is ever removed, the gate has no stated reason and the next
  // person deletes it as ceremony.
  // ⚠️ RE-ANCHORED 2026-09-19, AND THE CONCERN IT NAMES IS STILL LIVE. The offer
  // QUESTION moved to the Product Library, so there is no longer a screen
  // sentence to assert — but `offerTouched` still gates every stored offer, and
  // 51 of 53 ready voices carry a scan-GUESSED `profile.offer` that the gate is
  // the only thing keeping out of their scripts. This test's own warning was
  // that a gate with no stated reason gets deleted as ceremony, so the reason is
  // now asserted where it lives: in the comment on the constant itself.
  it('the gate still says, in the code, why it exists', () => {
    expect(ONBOARDING).toMatch(/Removing it would promote every old guess into a live CTA/)
  })
})
