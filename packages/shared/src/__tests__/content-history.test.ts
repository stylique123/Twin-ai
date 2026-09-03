// WHAT HAS THIS CREATOR ALREADY MADE? — and what this refuses to tell the writer.
//
// ⚠️ THE FEATURE THIS IS NOT. An anti-repetition rule was the obvious build, and
// the production data does not support one: of the 11 owners with more than one
// generation, exactly ONE repeats a format and ONE repeats a hook opening, and
// no creator has more than three videos. So this supplies facts and issues no
// instruction, and these tests hold it to that.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  renderContentHistory, MIN_PRIOR_VIDEOS, MAX_PRIOR_SHOWN, type PriorVideo,
} from '../contentHistory'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

const vid = (over: Partial<PriorVideo> = {}): PriorVideo => ({
  formatLabel: 'The Trust Builder', hook: 'Most founders get this wrong', premise: null, ...over,
})

describe('it stays silent until there is something to say', () => {
  it('no history renders nothing', () => {
    expect(renderContentHistory([])).toBe('')
  })

  it('ONE prior video renders nothing', () => {
    // ⚠️ A writer shown a single item treats it as the thing to differ from,
    // which is a novelty rule arriving through the back door.
    expect(renderContentHistory([vid()])).toBe('')
    expect(MIN_PRIOR_VIDEOS).toBe(2)
  })

  it('rows carrying nothing usable do not count toward the threshold', () => {
    const empty = [{ formatLabel: '', hook: null, premise: '  ' }, vid()]
    expect(renderContentHistory(empty)).toBe('')
  })

  it('two usable rows render', () => {
    const out = renderContentHistory([vid(), vid({ hook: 'Second one' })])
    expect(out).toMatch(/ALREADY MADE FOR THIS CREATOR \(2 most recent/)
  })
})

describe('it supplies facts and issues no instruction', () => {
  const out = renderContentHistory([vid(), vid({ hook: 'Second' }), vid({ hook: 'Third' })])

  it('says plainly that this is not a list to avoid', () => {
    expect(out).toMatch(/not a list to avoid/)
  })

  it('carries NO avoidance instruction, in any of its usual phrasings', () => {
    // ⚖️ THE ASSERTION THAT KEEPS THIS HONEST. A "do not repeat" line would be
    // inert — every prompt rule measured in this project changed nothing — and
    // premature, since the repetition it polices does not reproduce.
    for (const banned of [/do not repeat/i, /avoid (?:these|repeating)/i, /must differ/i, /something new/i]) {
      expect(out).not.toMatch(banned)
    }
  })

  it('includes the fields a creator would notice repeating', () => {
    // ⚠️ THE FIXTURE NOW STATES PROVENANCE, BECAUSE THE RENDERER NOW READS IT.
    // This assertion used to pass on a fixture that said nothing about who chose
    // the hook, which is exactly the ambiguity `hook_choice` was added to end —
    // a row with no provenance renders as `opened (unconfirmed):` now, and that
    // is the correct output, not a regression. Asserting the confirmed wording
    // requires supplying the fact that makes it true.
    const o = renderContentHistory([
      vid({ premise: 'Why pricing pages fail', hookChoice: { source: 'creator', index: 2 } }),
      vid({ hook: 'Second', hookChoice: { source: 'creator', index: 1 } }),
    ])
    expect(o).toMatch(/format: The Trust Builder/)
    expect(o).toMatch(/premise: Why pricing pages fail/)
    expect(o).toMatch(/opened: "Most founders get this wrong"/)
  })

  it('a hook with no recorded provenance is rendered unconfirmed, not as fact', () => {
    // The rows that predate 0134. They are real hooks and stay visible; what
    // changes is that the block stops asserting the creator chose them.
    const o = renderContentHistory([vid({ premise: 'p' }), vid({ hook: 'Second' })])
    expect(o).toMatch(/opened \(unconfirmed\): "Most founders get this wrong"/)
    expect(o).not.toMatch(/(?<!\()opened: "/)
  })

  it('caps the list so it cannot crowd out the reference', () => {
    const many = Array.from({ length: 20 }, (_, i) => vid({ hook: `hook ${i}` }))
    const o = renderContentHistory(many)
    expect(o).toMatch(new RegExp(`\\(${MAX_PRIOR_SHOWN} most recent`))
    expect(o.split('\n').filter((l) => /^\d+\./.test(l))).toHaveLength(MAX_PRIOR_SHOWN)
  })
})

describe('the block reaches the writer', () => {
  it('is interpolated into the user prompt', () => {
    // ⚠️ MUTATION-CHECKED: removing this leaves the read running and the result
    // discarded — the write-only shape this repo keeps finding.
    expect(EDGE).toMatch(/\$\{historyBlock \? `/)
    expect(EDGE).toMatch(/fenced\("this creator's existing catalogue", historyBlock\)/)
  })

  it('is FENCED, because prior blueprints contain model-written text', () => {
    // ⚖️ Same treatment as the reference transcript and the DNA: text this
    // system generated earlier is still text, and re-feeding it unfenced would
    // let a prior injection ride into the next script.
    const i = EDGE.indexOf('this creator\'s existing catalogue')
    expect(EDGE.slice(i - 20, i)).toContain('fenced(')
  })

  it('scopes the read to this owner', () => {
    expect(EDGE).toMatch(/\.from\('generations'\)[\s\S]{0,220}\.eq\('user_id', ownerId\)/)
  })

  it('keeps the inline cap in step with the shared module', () => {
    expect(EDGE).toContain(`const MAX_PRIOR_SHOWN = ${MAX_PRIOR_SHOWN}`)
    expect(EDGE).toContain(`const MIN_PRIOR_VIDEOS = ${MIN_PRIOR_VIDEOS}`)
  })

  it('a failed read yields no block rather than a partial one', () => {
    expect(EDGE).toMatch(/catch \{[\s\S]{0,200}historyBlock = ''/)
  })
})
