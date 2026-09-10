// NICHE, VOCABULARY AND AUDIENCE APPEARED TWICE ON THE SAME TAB.
//
// ⚠️⚠️ THE TWO-AUTHORITIES DEFECT, ON A SCREEN. The "What Twin learned" panel
// and the Creator DNA block both showed the creator her niche, her vocabulary
// and her audience — in different words, a scroll apart. She cannot tell which
// one Twin actually writes from, and that is the same class of bug as two
// modules holding the same fact.
//
// ⚠️ I INTRODUCED HALF OF IT. The panel was a correct fix to a card that opened
// nothing; it was added without removing what it then duplicated. Recording
// that is the point of this file — a correct fix can create this defect.
//
// ⚖️ AND THE DUPLICATE DEFEATED THE PROVENANCE, which is the whole reason the
// panel exists. A per-fact "heard in your videos" / "read from your captions"
// only means something if each fact appears ONCE. Two copies means one carries
// its evidence and its twin does not, which makes the honest one look arbitrary
// rather than earned.
//
// ⚖️ THE RESOLUTION: the panel is the single read view, the DNA block is the
// edit form, and Edit lands on the field she was looking at. Never a second
// summary to scroll for it.
//
// Source-scraped, matching this directory's idiom: there is no jsdom component
// harness here, and a guard that exists beats one that waits for one.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EDITS_INTO } from '@twinai/shared'

const SRC = readFileSync(join(__dirname, '..', 'pages', 'Settings.tsx'), 'utf8')

/** ⚠️ A SOURCE GUARD CANNOT TELL CODE FROM A COMMENT ABOUT CODE. This file's
 *  own subject matter is quoted at length in Settings.tsx's comments — scanning
 *  raw source for the duplicate would match the note explaining its removal. */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')

/** The DNA block, from its header to the end of its section. */
const dnaBlock = (): string => {
  const start = CODE.indexOf('Creator DNA')
  expect(start).toBeGreaterThan(-1)
  const end = CODE.indexOf('Sign out', start)
  expect(end).toBeGreaterThan(start)
  return CODE.slice(start, end)
}

describe('one fact, one place', () => {
  // ⚠️ THE SECOND SUMMARY, BY NAME. A teal "What we learned from your posts"
  // card sat inside the DNA block restating the profile summary and the
  // vocabulary chips the panel already shows with provenance.
  it('the DNA block carries no second summary of what Twin learned', () => {
    expect(CODE).not.toContain('What we learned from your posts')
    expect(dnaBlock()).not.toContain('voiceProfile.vocabulary')
    expect(dnaBlock()).not.toContain('voiceProfile.summary')
  })

  // ⚠️ AND NO SECOND READ VIEW OF THE EDITABLE FACTS. The block used to render
  // DNA_FIELDS twice: once as read-only rows, once as inputs. One of those is
  // the read view the panel now owns.
  it('DNA_FIELDS is rendered once — as the edit form, not also as rows', () => {
    const uses = dnaBlock().split('DNA_FIELDS.map').length - 1
    expect(uses).toBe(1)
    expect(dnaBlock()).toContain('data-testid={`dna-input-${f.key}`}')
  })

  // ⚖️ THE COLLAPSED TEASER IS NOT A THIRD COPY EITHER. It used to print the
  // voice summary and then "niche · audience" — the same facts, with no
  // evidence attached, on the way to the panel that has it.
  it('the collapsed voice line points at the facts instead of restating them', () => {
    const teaser = CODE.slice(CODE.indexOf('data-testid="voice-teaser"'),
      CODE.indexOf('voice-open-learned'))
    expect(teaser).not.toContain('dna.niche')
    expect(teaser).not.toContain('dna.audience')
    expect(teaser).toContain('learnedTotal')
  })

  // ⚖️ ONE FACT, ONE PATH. A row in the read view must land on the input that
  // edits it. An Edit that drops her at the top of a form to hunt for the field
  // is the second summary rebuilt as navigation.
  it('a learned row edits into the field she was looking at', () => {
    expect(CODE).toContain('editTargetOf(f)')
    expect(CODE).toContain('setFocusField(editTargetOf(f))')
    // and the input claims that focus
    expect(CODE).toContain('focusField === f.key')
    expect(CODE).toContain('el.focus()')
  })

  // ⚠️⚠️ EVERY TARGET MUST BE A FIELD THAT EXISTS, AND NOTHING ASSERTED THAT.
  // `EDITS_INTO` names a form key by string; a key that is not on the form
  // focuses nothing and leaves her at the top of it — the exact defect this
  // whole mapping was built to end, reachable by a typo. Three targets were
  // added at once (tone and pacing into `voice`, hook_style into
  // `editing_style`) and the only thing that made that safe was checking the
  // field list, so the check belongs here rather than in my head.
  it('every edit target names a field that is actually on the form', () => {
    const keys = [...CODE.matchAll(/key: '([a-z_]+)'/g)].map((m) => m[1])
    expect(keys.length, 'the DNA field list could not be located').toBeGreaterThan(3)
    const targets = Object.values(EDITS_INTO).filter((v): v is string => v !== null)
    expect(targets.length, 'no fact offers an edit at all').toBeGreaterThan(0)
    for (const t of targets) {
      expect(keys, `EDITS_INTO points at '${t}', which is not a form field`).toContain(t)
    }
  })

  // ⚖️ AND `null` MEANS "OFFERS NONE", NOT "FORGOTTEN". The two list-valued
  // facts have no scalar field on this form, so a target for them would be a
  // button that lands nowhere. Stated, so the next person does not fill them in
  // to make the map look complete.
  it('the facts with no field offer no edit', () => {
    expect(EDITS_INTO.vocabulary).toBeNull()
    expect(EDITS_INTO.recurring_ctas).toBeNull()
    // ⚠️ AND THE BUTTON IS GATED ON THAT NULL, so a null target renders no
    // control rather than a dead one.
    expect(CODE).toContain('editTargetOf(f) !== null &&')
  })

  // ⚠️ AND THE PANEL IS REACHABLE FROM THE BLOCK THAT NO LONGER READS. If the
  // read view is the only place a fact is shown, every entry point that used to
  // show facts must now open it.
  it('the DNA block sends her to the read view rather than rendering one', () => {
    expect(dnaBlock()).toContain('setLearnedOpen(true)')
  })
})
