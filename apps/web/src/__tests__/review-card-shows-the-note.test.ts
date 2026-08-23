// THE CARD MUST SHOW WHAT THE FIELD MEANS, OR THE REVIEWER GUESSES.
//
// The owner hit three of these in twenty claims: whether a ZOOM counts as the
// camera moving (it does not -- that is a separate claim), whether a stick is a
// product, and whether a coffee counts when it is not the creator's own product
// (it does; ownership was never part of the question).
//
// Each one produces a confident label of the WRONG question, which afterwards is
// indistinguishable from a real judgement.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(
  join(__dirname, '..', 'pages', 'PilotVisualReview.tsx'), 'utf8')

/** ⚠️ Comments stripped before any banned-token check: this page's own comments
 *  DISCUSS the things that must not be rendered, so scanning the raw file for
 *  them flags the warning rather than the defect. */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')

describe('the labelling card shows the field note', () => {
  it('imports and renders claimNote', () => {
    expect(SRC).toContain('claimNote')
    expect(SRC).toContain('claimNote(claim.claim_path)')
  })

  it('renders the note under the claim, above the debug path', () => {
    const note = SRC.indexOf('claimNote(claim.claim_path)')
    const said = SRC.indexOf('claimSentence(claim.claim_path')
    const path = SRC.lastIndexOf('{claim.claim_path}</div>')
    expect(said).toBeGreaterThan(-1)
    expect(note).toBeGreaterThan(said)
    expect(path).toBeGreaterThan(note)
  })

  it('renders nothing when a claim has no note, rather than an empty box', () => {
    expect(SRC).toContain(': null')
  })
})

describe('jumping to the next unanswered claim', () => {
  it('binds j and wires the button to jumpTarget', () => {
    expect(SRC).toContain("e.key === 'j'")
    expect(SRC).toContain('jumpTarget(')
    expect(SRC).toContain('Next unanswered')
  })

  it('passes ONLY booleans, so navigation cannot leak label values', () => {
    // !!c.current?.label collapses the label to answered/not. Passing the label
    // itself would be the first step toward showing a reviewer their own rate.
    expect(SRC).toContain('claims.map((c) => !!c.current?.label)')
  })

  it('disables the control when there is nowhere to jump', () => {
    expect(SRC).toContain('=== null}')
  })

  it('still shows progress, never a score', () => {
    expect(SRC).toContain('left to answer')
    expect(CODE).not.toContain('supportedRate')
  })
})
