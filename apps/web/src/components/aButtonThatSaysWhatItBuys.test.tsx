// @vitest-environment jsdom
//
// THE BUTTON THAT SPENDS HER EFFORT SAID THE LEAST.
//
// ⚠️ "Add to my voice" NAMES THE ACTION AND NOT THE CONSEQUENCE, on the one
// surface whose entire purpose is stated consequences. Every other line on this
// card says what a thing is FOR — "Only you can answer this — your videos
// cannot" — and the strength sentence next door tells her exactly what two or
// three more answers buy.
//
// ⚖️ AND A STATED CONSEQUENCE MAY ONLY BE PRINTED IF IT IS TRUE. Verified
// against production on 2026-09-12: the answer lands in `creator_knowledge` with
// `source: 'asked'`; `generate-blueprint` runs a SECOND query for exactly those
// rows, because the top-40-by-`times_seen` ranking cannot see a row stated once;
// and it places them FIRST so they survive truncation.
//
// ⚠️ SO THIS FILE HOLDS THE COPY TO THE MECHANISM. The promise and the code that
// keeps it are asserted together — delete the read and the promise fails, rather
// than quietly becoming a lie on a button.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const CARD = readFileSync(join(import.meta.dirname, 'CreatorQuestionCard.tsx'), 'utf8')
const EDGE = readFileSync(
  join(repo, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

describe('the button says what it buys', () => {
  it('states the consequence, not only the action', () => {
    expect(CARD).toContain('Add to my voice — scripts can use this')
  })

  it('and does so in her language, not ours', () => {
    const label = 'Add to my voice — scripts can use this'
    expect(label).not.toMatch(/creator_knowledge|source|row|corpus|persist/i)
  })
})

describe('the promise is kept by the code, which is why it may be made', () => {
  // ⚠️ THE READ THAT MAKES IT TRUE. A `times_seen`-ranked read CANNOT see an
  // answered row — she states it once, so it is a 1, and forty caption rows of
  // 2 and 3 sit above it. Without this second query the whole channel is
  // decorative: she answers, the row lands, and the writer never sees it.
  it('the edge reads asked rows specifically', () => {
    expect(EDGE).toContain("const { data: askedRows }")
    expect(EDGE).toMatch(/\.eq\('source', 'asked'\)/)
  })

  // ⚖️ AND FIRST, SO TRUNCATION CANNOT SILENTLY DROP THEM. Order is the
  // difference between "can use this" and "can use this unless she also has
  // forty caption rows".
  it('and puts them ahead of the ranked ones', () => {
    const line = EDGE.slice(EDGE.indexOf('const knowledgeRows = '))
      .slice(0, EDGE.slice(EDGE.indexOf('const knowledgeRows = ')).indexOf('\n'))
    const asked = line.indexOf('askedRows')
    const ranked = line.indexOf('rankedRows')
    expect(asked, 'asked rows are no longer merged in').toBeGreaterThan(-1)
    expect(ranked, 'ranked rows are no longer merged in').toBeGreaterThan(-1)
    expect(asked, 'asked rows lost their place at the front').toBeLessThan(ranked)
  })
})

describe('what was already right is untouched', () => {
  it('keeps the line that says only she can answer', () => {
    expect(CARD).toContain('Only you can answer this — your videos cannot.')
  })

  // ⚖️ "Not this one" IS NOT A CONSEQUENCE-BEARING ACTION and must stay plain.
  // Dressing up the skip would make declining feel like a decision with a cost.
  it('leaves the skip unchanged', () => {
    expect(CARD).toContain('Not this one')
  })
})
