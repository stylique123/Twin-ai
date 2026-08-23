// A NOTE MAY EXPLAIN THE QUESTION. IT MAY NEVER SUPPLY THE ANSWER.
//
// The owner could not tell whether a zoom counted as the camera moving, and
// asked for the card to help. The line between helping and coaching is the whole
// point of this file: describing what the field MEANS is help, and hinting which
// way to answer is the same defect as a pre-highlighted button.
import { describe, it, expect } from 'vitest'
import { claimNote, CLAIM_PATHS_WITH_NOTES, CONFUSABLE_PAIRS } from '../claimNote'
import { CLAIM_PATHS_WITH_SENTENCES } from '../claimSentence'

describe('claimNote', () => {
  it('separates a zoom from a camera move — the pair that caused this file', () => {
    const position = claimNote('camera.positionChanges')!
    const framing = claimNote('camera.framingChanges')!
    expect(position.toLowerCase()).toContain('zoom')
    expect(position.toLowerCase()).toContain('does not count')
    expect(framing.toLowerCase()).toContain('zoom counts')
  })

  it('says stock and B-roll do not add a location you would have to film', () => {
    // A piece to camera cut against a stock sunset shows two places but needs
    // one. Without this, "two places appear" is read as "two locations needed".
    const note = claimNote('requirements.multipleLocations')!.toLowerCase()
    expect(note).toContain('film yourself')
    expect(note).toContain('license or download')
  })

  it('separates handling a product from NEEDING one', () => {
    // performance.productInteraction observes; requirements.physicalProduct
    // requires. A coffee someone happens to drink is handled, not needed.
    expect(claimNote('requirements.physicalProduct')!.toLowerCase())
      .toContain('just happens to be in shot is not needed')
    expect(claimNote('performance.productInteraction')!.toLowerCase())
      .not.toContain('remake')
  })

  it('separates the place changing from the camera moving', () => {
    expect(claimNote('setting.changes')!.toLowerCase()).toContain('still one place')
    expect(claimNote('requirements.multipleLocations')!.toLowerCase()).toContain('still one location')
  })

  it('says what a product is, since the sentence does not', () => {
    for (const p of ['performance.productInteraction', 'requirements.physicalProduct']) {
      expect(claimNote(p)!.toLowerCase()).toContain('made and sold')
    }
  })

  it('says a product need not belong to the person holding it', () => {
    // The owner hesitated over someone holding a coffee because it was not the
    // creator's own product. The model was asked only whether ANYONE handles a
    // physical product; ownership is not part of the question.
    expect(claimNote('performance.productInteraction')!.toLowerCase())
      .toContain('does not have to be')
    expect(claimNote('requirements.physicalProduct')!.toLowerCase())
      .toContain('does not have to be')
  })

  it('keeps talkingHead LOOSE, matching the open limitation', () => {
    // TALKINGHEAD_LOOSER_THAN_INDUSTRY is OPEN: the note must not smuggle in the
    // stricter industry framing the model was never asked about.
    const note = claimNote('performance.talkingHead')!.toLowerCase()
    expect(note).toContain('any distance')
    for (const banned of ['head and shoulders', 'close-up shot', 'framing']) {
      expect(note).not.toContain(banned)
    }
  })

  it('returns null rather than padding a claim that reads fine alone', () => {
    expect(claimNote('primaryMode')).toBeNull()
    expect(claimNote('nonsense.path')).toBeNull()
  })

  it('every note glosses a path that actually has a sentence', () => {
    // ⚠️ MEMBERSHIP, NOT A GUESSED VALUE. An earlier version called
    // claimSentence(p, true) ?? claimSentence(p, 'one'), which reports "no
    // sentence" for every enum field -- setting.complexity takes
    // simple/moderate/complex and matches neither guess. The test was wrong, not
    // the module.
    for (const p of CLAIM_PATHS_WITH_NOTES) {
      expect(CLAIM_PATHS_WITH_SENTENCES, `${p} has no sentence`).toContain(p)
    }
  })
})

describe('a note must not tell the reviewer how to answer', () => {
  const ALL = CLAIM_PATHS_WITH_NOTES.map((p) => claimNote(p)!).join(' ').toLowerCase()

  it('never leans toward yes or no', () => {
    for (const banned of [
      'usually', 'most videos', 'probably', 'likely', 'in most cases',
      'you should answer', 'press 1', 'press 2', 'press 3', 'the answer is',
    ]) {
      expect(ALL, `a note must not say "${banned}"`).not.toContain(banned)
    }
  })

  it('never describes what is in any frame', () => {
    for (const banned of ['in this frame', 'the picture shows', 'you can see that']) {
      expect(ALL).not.toContain(banned)
    }
  })

  it('reads as plain English, with no field paths or jargon', () => {
    for (const banned of ['claim_path', 'boolean', 'json']) {
      expect(ALL).not.toContain(banned)
    }
    // ⚠️ A FIELD PATH, NOT ANY WORD FOLLOWED BY A FULL STOP. Banning the bare
    // string 'camera.' flagged the sentence "People visible on camera." -- the
    // same false positive as scanning source for a phrase that also appears in
    // prose. Match the dotted-path shape instead.
    expect(ALL).not.toMatch(/\b(camera|performance|requirements|setting)\.[a-z]/)
  })
})

describe('the confusable pairs are named, not implied', () => {
  it('both sides of every pair carry a note', () => {
    for (const [a, b] of CONFUSABLE_PAIRS) {
      expect(claimNote(a), `${a} needs a note`).toBeTruthy()
      expect(claimNote(b), `${b} needs a note`).toBeTruthy()
    }
  })

  it('the two sides do not say the same thing', () => {
    for (const [a, b] of CONFUSABLE_PAIRS) {
      expect(claimNote(a)).not.toBe(claimNote(b))
    }
  })
})
