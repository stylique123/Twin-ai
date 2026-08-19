// A QUESTION NOBODY IS ASKED COLLECTS NOTHING.
//
// ⚠️ THIS REPO'S RECURRING FAILURE IS THE UNWIRED CAPABILITY, not the wrong
// rule. `scanTargetConfirmation`, the caption extractor and `csEntities` each
// shipped complete, passed their own tests, and were never reached by the thing
// that needed them — CI green throughout. A survey component is the easiest
// possible version of that mistake: it renders perfectly in isolation and is
// never mounted.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const RESULT = readFileSync(join(HERE, '..', 'pages', 'Result.tsx'), 'utf8')
const CARD = readFileSync(join(HERE, '..', 'components', 'WouldYouPostThis.tsx'), 'utf8')
const WRITER = readFileSync(join(HERE, 'publishIntent.ts'), 'utf8')

describe('the question actually reaches a creator', () => {
  it('is imported and rendered by the result page', () => {
    expect(RESULT).toMatch(/import WouldYouPostThis from '\.\.\/components\/WouldYouPostThis'/)
    expect(RESULT).toMatch(/<WouldYouPostThis generationId=\{gen\.id\} \/>/)
  })

  it('is shown only when a finished video exists', () => {
    // ⚖️ A creator still deciding whether to film cannot say whether they would
    // post it. Asking then collects a guess and teaches them to dismiss us.
    expect(RESULT).toMatch(/\{finished && <WouldYouPostThis/)
  })
})

describe('telemetry may never cost the creator anything', () => {
  it('never awaits the write before acknowledging the tap', () => {
    // ⚠️ The same rule `recordScriptEdit` follows. Making somebody wait on our
    // analytics round-trip to see their own tap acknowledged is backwards.
    expect(CARD).toMatch(/void recordPublishIntent\(generationId, v\)/)
    const choose = CARD.slice(CARD.indexOf('const choose'))
    expect(choose.indexOf('setAnswer(v)')).toBeLessThan(choose.indexOf('recordPublishIntent'))
  })

  it('swallows every failure rather than surfacing one', () => {
    // ⚠️ 0148 is EXCLUDED from the staging matrix and must be applied to
    // production by hand, so "relation does not exist" is a real possibility
    // here and must not look like a broken page.
    expect(WRITER).toMatch(/console\.warn\('publish intent not recorded'/)
    expect(WRITER).toMatch(/catch/)
    expect(WRITER).not.toMatch(/throw /)
  })

  it('keeps "said nothing" distinguishable from "typed and cleared it"', () => {
    expect(WRITER).toMatch(/trimmed === '' \? null :/)
  })

  it('upserts, so a change of mind replaces the old answer rather than duplicating', () => {
    // ⚖️ Somebody who says "only if I changed some of it", changes it, and then
    // would post it has told us the most useful thing we can learn. 0148's
    // trigger keeps the previous answer in `answered_before`.
    expect(WRITER).toMatch(/\.upsert\(/)
    expect(WRITER).toMatch(/onConflict: 'generation_id'/)
  })

  it('writes no row without an owner', () => {
    expect(WRITER).toMatch(/if \(!ownerId\) return false/)
  })
})

describe('it asks once, and shows nothing until it knows the answer', () => {
  it('reads the previous answer before rendering anything', () => {
    // ⚠️ Flashing the question and then replacing it with the stored answer
    // reads as though we lost their response.
    expect(CARD).toMatch(/if \(!known\) return null/)
    expect(CARD).toMatch(/readPublishIntent\(generationId\)/)
  })

  it('marks the chosen option for a screen reader, not just visually', () => {
    expect(CARD).toMatch(/aria-pressed=\{picked\}/)
  })
})

describe('the words a creator reads', () => {
  it('uses the shared labels rather than re-typing them here', () => {
    // ⚖️ Two copies of a question are two questions, and the analysis would be
    // pooling answers to whichever one each creator happened to see.
    expect(CARD).toMatch(/PUBLISH_INTENT_LABELS\[v\]/)
    expect(CARD).toMatch(/from '@twinai\/shared'/)
  })

  it('says what the answer is FOR, because "help us improve" is what ignored surveys say', () => {
    expect(CARD).toMatch(/changes what we write next/)
    expect(CARD).toMatch(/Nobody else sees it/)
  })

  it('acknowledges without celebrating', () => {
    // ⚠️ A creator who just told us they would not post it must not be met with
    // a tick and "thanks!".
    expect(CARD).toMatch(/Noted — thank you\./)
    expect(CARD).not.toMatch(/🎉|Awesome|Great!/)
  })
})
