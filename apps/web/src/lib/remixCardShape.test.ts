// THE REMIX CARD IS TWO BLOCKS AND MUST STAY ONE BEHAVIOUR.
//
// ⚖️ THE THREE DECISIONS ARE ASKED OF EVERY VIDEO; THE OFFER QUESTIONS ARE ASKED
// OF ALMOST NONE. Stacked into one list they read as a form — a card that is
// normally three taps looked like work, because two free-text boxes sat under
// the chips with nothing saying they were a different subject or optional.
//
// ⚠️ SO THE RISK THE SPLIT INTRODUCES IS THE ONE THIS PINS: two columns rendered
// by two copies of the chip logic. The sub-option row, the tap-to-clear rule and
// the save-on-every-keystroke all live in that block, and a second copy would
// drift silently — the columns would look identical and behave differently, and
// only one of them would still survive a reclaimed background tab.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'v2', 'V2Building.tsx'), 'utf8')

describe('one renderer, two columns', () => {
  it('renders both blocks through the same function', () => {
    expect(SRC).toMatch(/const renderAsk = \(q: AskItem\) =>/)
    expect(SRC).toMatch(/\{decisions\.map\(renderAsk\)\}/)
    expect(SRC).toMatch(/\{commercial\.map\(renderAsk\)\}/)
  })

  it('defines the renderer exactly once', () => {
    expect(SRC.match(/const renderAsk =/g)).toHaveLength(1)
    // ⚠️ THE KEYSTROKE-LEVEL SAVE IS THE ONE THAT MATTERS MOST, and it is why a
    // second copy is a data-loss bug rather than a styling inconsistency.
    expect(SRC.match(/rememberAnswers\(buildKey\(state\), next\)/g)!.length).toBeLessThanOrEqual(3)
  })

  it('splits on the existing chip distinction, not a new parallel flag', () => {
    // ⚖️ A second notion of "which block is this" is a field that can disagree
    // with the renderer. `isChip` already means "fixed-enum decision".
    expect(SRC).toMatch(/const decisions = \(askQuestions \?\? \[\]\)\.filter\(isChip\)/)
    expect(SRC).toMatch(/const commercial = \(askQuestions \?\? \[\]\)\.filter\(\(q\) => !isChip\(q\)\)/)
  })
})

describe('what the creator sees', () => {
  it('widens to two columns only when there are two blocks to show', () => {
    // ⚠️ EVERY OTHER STATE OF THIS SCREEN IS A NARROW COLUMN — building, refused,
    // errored — and widening it unconditionally would stretch all of them.
    expect(SRC).toMatch(/const hasTwoBlocks = decisions\.length > 0 && commercial\.length > 0/)
    expect(SRC).toMatch(/hasTwoBlocks && 'lg:max-w-3xl'/)
    expect(SRC).toMatch(/hasTwoBlocks && 'lg:grid lg:grid-cols-2 lg:gap-8'/)
  })

  it('says the offer questions are optional where they are read', () => {
    // ⚖️ THE BUTTON ALREADY DOES NOT WAIT FOR THEM, and these boxes fire from an
    // INFERRED offer — so a creator who cannot answer one must be able to see
    // that without discovering it by clicking.
    expect(SRC).toMatch(/About what you sell/)
    expect(SRC).toMatch(/— optional/)
  })

  it('names the button after what it produces', () => {
    // ⚠️ "Build my video plan" described an artefact from an earlier product.
    // What the creator gets is their version of the reference.
    expect(SRC).toMatch(/Create my version/)
    expect(SRC).not.toMatch(/>\s*Build my video plan/)
  })
})
