// THE NICHE HAD A VOCABULARY AND NOBODY READ IT.
//
// ⚠️ `nicheVocabularies` WAS BUILT, TESTED AND CALLED BY NOTHING.
// `check_symbol_readers` registered it with the exact unlock condition — "the
// prompt assembler calling nicheVocabularies" — and this is that call.
//
// ⚠️ THE YIELD WAS MEASURED BEFORE ANY OF IT WAS WIRED, because a term list
// nobody can fill is a prompt block that is always absent. Terms clearing BOTH
// gates per bucket on the live corpus 2026-09-14: business 35, food 16,
// entertainment 13, tech 9, beauty_fashion 7, creator 0, health 0.
//
// ⚠️⚠️ AND THE GROUPING WAS THE WHOLE FINDING. Grouped by the raw free-text
// `niche`, business yields ZERO, and several niches pass the distinctiveness
// gate for a SPURIOUS reason — a term looks unique to one niche because only
// one creator's bespoke label contains those words. Bucketed, business goes
// 0 -> 35. The facet vector was the prerequisite, exactly as the registry said.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import {
  nicheVocabularies, termsIn, MIN_CREATORS_FOR_TERM, MAX_NICHES_FOR_TERM,
  type NicheCard,
} from '../corpus/nicheVocabulary'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE_RAW = readFileSync(
  join(REPO, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
const EDGE = EDGE_RAW.split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n')

function loadInline() {
  const start = EDGE_RAW.indexOf('// ── NICHE VOCABULARY, INLINED ─')
  const end = EDGE_RAW.indexOf('// ── END NICHE VOCABULARY ─', start)
  expect(start, 'inlined block marker missing — fix the marker, do not delete it').toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const js = transformSync(EDGE_RAW.slice(start, end), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return {
    nicheVocabulariesInline, termsInInline, renderNicheVocabularyInline }`)() as {
      nicheVocabulariesInline: (m: ReadonlyMap<string, readonly NicheCard[]>) => Map<string, unknown>
      termsInInline: (t: unknown) => Set<string>
      renderNicheVocabularyInline: (
        bucket: string | null,
        terms: ReadonlyArray<{ term: string; creators: number; cards: number }>,
        creators: number,
      ) => string
    }
}

/** N creators each posting one card carrying `words`. */
const spread = (n: number, words: string, prefix = 'c') =>
  Array.from({ length: n }, (_, i) => ({ creator: `${prefix}${i}`, title: words }))

/** ⚠️ FIXTURES THAT STRADDLE EVERY GATE. A table that never crosses one cannot
 *  tell two implementations apart. */
const CASES: ReadonlyArray<{ name: string; map: Map<string, readonly NicheCard[]> }> = [
  { name: 'empty', map: new Map() },
  { name: 'one bucket, nothing clears spread', map: new Map([['food', spread(9, 'sourdough starter')]]) },
  { name: 'one bucket, exactly at the spread floor', map: new Map([['food', spread(10, 'sourdough starter')]]) },
  { name: 'one bucket only — distinctiveness cannot apply', map: new Map([['food', spread(30, 'sourdough starter')]]) },
  { name: 'two buckets, term distinctive to one', map: new Map([
    ['food', spread(15, 'sourdough starter')],
    ['tech', spread(15, 'kubernetes cluster', 't')],
  ]) },
  { name: 'two buckets sharing a term above the presence bar', map: new Map([
    ['food', spread(15, 'sourdough protein')],
    ['tech', spread(15, 'kubernetes protein', 't')],
  ]) },
  { name: 'shared term BELOW the presence bar elsewhere', map: new Map([
    ['food', spread(15, 'sourdough protein')],
    ['tech', [...spread(2, 'protein', 't'), ...spread(15, 'kubernetes', 'u')]],
  ]) },
  { name: 'the @ creator pooled — must not manufacture spread', map: new Map([
    ['food', Array.from({ length: 30 }, () => ({ creator: '@', title: 'sourdough starter' }))],
  ]) },
  // ⚠️ THE FIXTURE THAT ACTUALLY DISCRIMINATES, and the first one did not.
  // Thirty cards all carrying the creator "@" pool to a spread of ONE, so
  // removing the "@" guard could not change the outcome and the mutant
  // survived. The fixture was wrong, not the code. Nine real creators plus a
  // pile of "@" cards sits exactly ONE below the floor: with the guard the term
  // is dropped, without it "@" becomes the tenth creator and it passes.
  { name: 'nine real creators plus an @ pile — @ must not be the tenth', map: new Map([
    ['food', [
      ...spread(9, 'sourdough'),
      ...Array.from({ length: 40 }, () => ({ creator: '@', title: 'sourdough' })),
    ]],
    ['tech', spread(15, 'kubernetes', 't')],
  ]) },
  { name: 'blank creators', map: new Map([
    ['food', Array.from({ length: 30 }, () => ({ creator: '  ', title: 'sourdough starter' }))],
  ]) },
  { name: 'the label leaks into the titles', map: new Map([
    ['food', spread(20, 'food sourdough')],
    ['tech', spread(15, 'kubernetes', 't')],
  ]) },
  { name: 'one card repeating a word nine times votes once', map: new Map([
    ['food', spread(12, 'chicken chicken chicken chicken chicken chicken chicken chicken chicken')],
    ['tech', spread(15, 'kubernetes', 't')],
  ]) },
  { name: 'hashtags and mentions are not words', map: new Map([
    ['food', spread(20, '#foodtiktok @somechef sourdough')],
    ['tech', spread(15, 'kubernetes', 't')],
  ]) },
  { name: 'null and non-string titles', map: new Map([
    ['food', [
      ...spread(12, 'sourdough'),
      { creator: 'x', title: null }, { creator: 'y', title: undefined },
    ]],
    ['tech', spread(15, 'kubernetes', 't')],
  ]) },
]

describe('the shared rule and the edge mirror agree', () => {
  const inline = loadInline()

  it('the fixture table crosses the gates it claims to', () => {
    // ⚠️ A VACUOUS PASS IS REFUSED. If every case returned nothing the
    // comparison below would be trivially true.
    const outs = CASES.map((c) => nicheVocabularies(c.map))
    const anyTerms = outs.filter((m) => [...m.values()].some((t) => t.length > 0))
    const anyEmpty = outs.filter((m) => [...m.values()].every((t) => t.length === 0))
    expect(anyTerms.length).toBeGreaterThan(4)
    expect(anyEmpty.length).toBeGreaterThan(2)
  })

  for (const c of CASES) {
    it(`agrees: ${c.name}`, () => {
      const mine = nicheVocabularies(c.map)
      const theirs = inline.nicheVocabulariesInline(c.map) as Map<string, unknown>
      expect([...theirs.keys()].sort()).toEqual([...mine.keys()].sort())
      for (const [k, v] of mine) expect(theirs.get(k)).toEqual(v)
    })
  }

  it('agrees on tokenisation, including the cases that bite', () => {
    for (const t of [
      'Sourdough STARTER', '#foodtiktok @chef sourdough', 'https://x.com/a sourdough',
      'the a an of sourdough', 'it', null, undefined, 42, '', "don't stop",
    ]) {
      expect([...inline.termsInInline(t)].sort()).toEqual([...termsIn(t)].sort())
    }
  })

  it('the mirror carries the same two gates, not its own', () => {
    expect(EDGE).toContain(`const MIN_CREATORS_FOR_TERM_INLINE = ${MIN_CREATORS_FOR_TERM}`)
    expect(EDGE).toContain(`const MAX_NICHES_FOR_TERM_INLINE = ${MAX_NICHES_FOR_TERM}`)
    expect(EDGE).toContain('const PRESENT_IN_NICHE_INLINE = 3')
  })
})

describe('the block says what it may and may not contribute', () => {
  const inline = loadInline()
  const terms = [
    { term: 'sourdough', creators: 23, cards: 97 },
    { term: 'hydration', creators: 14, cards: 40 },
  ]

  it('names the terms and their creator spread', () => {
    const out = inline.renderNicheVocabularyInline('food', terms, 304)
    expect(out).toContain('sourdough (23 creators)')
    expect(out).toContain('hydration (14 creators)')
    expect(out).toContain('304 creators in this field')
  })

  it('says VOCABULARY ONLY, and forbids using a term to assert anything', () => {
    // ⚠️ THE HARDEST RULE IN THE PROJECT: every claim comes from HER MATERIAL.
    // A niche term is a wording aid; without this sentence it reads as licence.
    const out = inline.renderNicheVocabularyInline('food', terms, 304)
    expect(out).toContain('NOT a source of claims')
    expect(out).toContain('never facts she may assert')
    expect(out).toContain('HER MATERIAL')
    expect(out).toContain('a product, a result or an experience she has not')
  })

  it('is ABSENT when the list is empty, never a hedge', () => {
    // creator and health yield nothing today. Silence, like the SHAPE block.
    expect(inline.renderNicheVocabularyInline('health', [], 82)).toBe('')
    expect(inline.renderNicheVocabularyInline('creator', [], 8)).toBe('')
  })

  it('is absent when she has no bucket at all', () => {
    expect(inline.renderNicheVocabularyInline(null, terms, 304)).toBe('')
  })

  it('caps how many terms reach the prompt', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ term: `t${i}`, creators: 40 - i, cards: 1 }))
    const out = inline.renderNicheVocabularyInline('business', many, 969)
    expect(out).toContain('t0 (40 creators)')
    expect(out).not.toContain('t20 (')
  })
})

describe('the chain from cache to prompt', () => {
  it('reads the weekly cache table', () => {
    expect(EDGE).toContain("from('niche_vocabulary')")
    expect(EDGE).toContain("select('terms, creators_in_bucket, computed_at')")
  })

  it('recomputes EVERY bucket, because the gate asks about the others', () => {
    // A single-bucket recompute would skip the distinctiveness gate entirely
    // and return the common-word list — what the singular helper warns about.
    expect(EDGE).toContain('nicheVocabulariesInline(byBucket)')
    expect(EDGE).toMatch(/upsert\(writes,\s*\{\s*onConflict:\s*'bucket'\s*\}\)/)
  })

  it('refuses to write from a truncated read', () => {
    // At the cap we cannot know which terms are distinctive, so the previous
    // row stands — the same refusal `corpusCardsComplete` makes for shapes.
    expect(EDGE).toContain('rows.length < VOCAB_CARD_CAP')
  })

  it('uses a STALE row rather than discarding it', () => {
    // Vocabulary does not rot in seven days; discarding on a failed refresh
    // would turn a slow cache into silence.
    const at = EDGE.indexOf('const VOCAB_MAX_AGE_MS')
    expect(at).toBeGreaterThan(-1)
    const body = EDGE.slice(at, EDGE.indexOf('const vocabBlock', at))
    expect(body).toContain('vocabTerms = cached.terms')
    expect(body.indexOf('vocabTerms = cached.terms')).toBeLessThan(body.indexOf('if (!fresh)'))
  })

  it('cannot fail a generation', () => {
    const at = EDGE.indexOf('const VOCAB_MAX_AGE_MS')
    const body = EDGE.slice(at, EDGE.indexOf('const vocabBlock', at))
    expect(body).toContain('catch')
    expect(body.slice(body.lastIndexOf('catch'))).not.toMatch(/\bthrow\b/)
  })

  it('reaches the prompt in BOTH variants — the reader-removal assertion', () => {
    // ⚠️ Delete the interpolation and every other test here still passes while
    // the block is computed and thrown away — the exact defect #870 exists for.
    const slots = EDGE.match(/\$\{vocabBlock\}/g) ?? []
    expect(slots.length).toBe(2)
  })

  it('gets its OWN slot, never containerBlock', () => {
    // containerBlock is REASSIGNED when a container template matches; appending
    // there discarded 620 of 666 visual blocks before #870.
    expect(EDGE).not.toMatch(/containerBlock\s*\+=\s*`[^`]*\$\{vocabBlock\}/)
  })
})
