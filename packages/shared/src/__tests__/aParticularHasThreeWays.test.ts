import { describe, it, expect } from 'vitest'
import { hasParticular, isFirstPersonEpisode } from '../script/craftContracts'
import { FIRST_PERSON_MARKER } from '../script/witnessScore'

describe('the third way to be particular: something that happened', () => {
  for (const line of [
    'I lost money on my first hundred loaves.',
    'we spent six months researching mixers before we sold anything',
    'my first batch went straight in the bin',
    'we baked on two racks until the orders got too big',
    'I quit the day job before the numbers worked',
  ]) {
    it(`counts as an episode: ${line}`, () => {
      expect(isFirstPersonEpisode(line)).toBe(true)
      expect(hasParticular(line)).toBe(true)
    })
  }
})

// ⚠️⚠️ A BARE "I" IS NOT AN EPISODE, AND THIS IS THE HALF THAT DOES THE WORK.
// Measured over 32 stored scripts: 4 would clear on a bare first-person marker
// against 3 on a real episode. Without the past-tense requirement, "I think you
// should" clears a floor that exists to demand a fact.
describe('an opinion in the first person is not an episode', () => {
  for (const line of [
    'I think you should price higher',
    'I am going to show you how to shape a loaf',
    'we believe the setup matters less than the technique',
    'I feel like nobody talks about this',
    'I want you to try this on your next bake',
  ]) {
    it(`is NOT an episode: ${line}`, () => {
      expect(FIRST_PERSON_MARKER.test(line)).toBe(true)
      expect(isFirstPersonEpisode(line)).toBe(false)
    })
  }
})

// ⚖️ A CLOSED VERB LIST, NOT `\w+ed`. These all end in -ed and none is a thing
// that happened; a catch-all would let a feeling clear a floor built to demand
// a fact.
describe('a feeling that ends in -ed is not an episode', () => {
  for (const line of [
    'I am tired of hearing that',
    'we are worried about the margins',
    'I feel excited every single bake',
    'I am interested in what you think',
  ]) {
    it(`is NOT an episode: ${line}`, () => {
      expect(isFirstPersonEpisode(line)).toBe(false)
    })
  }
})

describe('an episode needs BOTH halves', () => {
  it('a past-tense verb without first person is not an episode', () => {
    // "you baked" and "they started" are the viewer's story, not the creator's.
    expect(isFirstPersonEpisode('whether you baked in a commercial facility')).toBe(false)
    expect(isFirstPersonEpisode('most bakers quit before the second month')).toBe(false)
  })

  it('and neither half alone makes a particular', () => {
    expect(hasParticular('most bakers quit before the second month')).toBe(false)
    expect(hasParticular('I think this matters')).toBe(false)
  })
})

describe('the first two paths still work exactly as before', () => {
  it('a digit still passes', () => expect(hasParticular('a sack runs 30 dollars')).toBe(true))
  it('a currency mark still passes', () => expect(hasParticular('it cost me £40')).toBe(true))
  it('a mid-sentence name still passes', () => expect(hasParticular('our Florida cottage setup')).toBe(true))
  it('a sentence-opening capital still does NOT pass', () => {
    expect(hasParticular('Shoppers avoid awkward friction.')).toBe(false)
  })
  it('nothing concrete still fails', () => {
    expect(hasParticular('you just have to keep going')).toBe(false)
  })
})

// ⚠️⚠️ MEASURED, AND THE REASON THIS SHIPS INERT. Across all 33 body beats in
// the 33 stored production scripts:
//
//     contain a first-person marker at all ....  4
//     contain a real EPISODE ..................  0
//     contain a figure ........................  0
//     contain a mid-sentence name .............  3
//
// The episode path changes NOTHING on any script Twin has produced. Not because
// episodes are rare in the medium, but because TWIN WRITES BODY BEATS IN THE
// SECOND PERSON — "You think...", "Most people...", "Shoppers avoid..." — so the
// creator never appears in the body to have an episode in the first place.
//
// ⚖️ IT SHIPS ANYWAY because #714 pushes the writer toward first person and this
// is what will count it when that lands. Recorded here so nobody later reads a
// green test suite as evidence the path is doing something.
describe('the measurement that says this is inert today', () => {
  it('a second-person body beat, of the kind Twin actually writes, has no particular', () => {
    for (const real of [
      'You think shiny object syndrome is a lack of focus.',
      'Most people think flat loaves happen because you lack a commercial proofer.',
      'When you think about launching from home, you imagine spending your day mixing dough.',
    ]) {
      expect(hasParticular(real)).toBe(false)
      expect(isFirstPersonEpisode(real)).toBe(false)
    }
  })
})
