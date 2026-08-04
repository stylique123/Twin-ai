// The permanent glossary — §6's "any hard words?".
//
// Two things carry this file: a term is ONE WORD (the same bound a review
// respelling lives under, because a glossary entry becomes caption text), and
// the stored list does not depend on the order a form submitted it (because a
// boot manifest pins its digest, and a digest that moves with form order would
// make two identical glossaries look like two different ones).
import { describe, expect, it } from 'vitest'
import {
  glossaryKey, glossaryKeySet, normalizeGlossary, validateGlossaryTerm,
  MAX_GLOSSARY_TERMS, MAX_GLOSSARY_TERM_CHARS,
} from '../glossary'

describe('a term is ONE WORD', () => {
  it('accepts an ordinary hard word', () => {
    expect(validateGlossaryTerm('TwinAI')).toEqual({ term: 'TwinAI' })
    expect(validateGlossaryTerm('  Kubernetes  ')).toEqual({ term: 'Kubernetes' })
  })

  it('refuses whitespace inside — that is inventing speech', () => {
    // A glossary entry becomes caption text. "Twin AI and also buy my course"
    // would let one spoken word render as six, through the one door this
    // pipeline keeps closed everywhere else.
    expect(validateGlossaryTerm('Twin AI')).toEqual({ rejected: 'not_one_word' })
    expect(validateGlossaryTerm('a\tb')).toEqual({ rejected: 'not_one_word' })
  })

  it('refuses empty and over-long entries, and says which', () => {
    expect(validateGlossaryTerm('')).toEqual({ rejected: 'empty' })
    expect(validateGlossaryTerm('   ')).toEqual({ rejected: 'empty' })
    expect(validateGlossaryTerm(null)).toEqual({ rejected: 'empty' })
    expect(validateGlossaryTerm('x'.repeat(MAX_GLOSSARY_TERM_CHARS))).toEqual({
      term: 'x'.repeat(MAX_GLOSSARY_TERM_CHARS),
    })
    expect(validateGlossaryTerm('x'.repeat(MAX_GLOSSARY_TERM_CHARS + 1)))
      .toEqual({ rejected: 'too_long' })
  })
})

describe('the key folds case and accents; the DISPLAY form does not', () => {
  it('one entry, however it is capitalised', () => {
    expect(glossaryKey('TwinAI')).toBe(glossaryKey('twinai'))
    expect(glossaryKey('TWINAI')).toBe(glossaryKey('TwinAi'))
  })

  it('folds accents, so "Renée" and "Renee" are not two entries', () => {
    expect(glossaryKey('Renée')).toBe(glossaryKey('Renee'))
  })

  it('folds to the AGREED form — the same table the worker pins', () => {
    // The worker has its own copy of this fold (`foldGlossaryKey`, editorCompile)
    // because it deliberately does not depend on this package. A term folded two
    // ways is a term the two halves of the product disagree about: this side
    // stores one entry and the compiler looks up another. Neither imports the
    // other; both assert this identical table, so a drift in EITHER fails its
    // own suite.
    const AGREED: Array<[string, string]> = [
      ['TwinAI', 'twinai'], ['twinai', 'twinai'], ['TWINAI', 'twinai'],
      ['Renée', 'renee'], ['Renee', 'renee'], ['ÄÖÜ', 'aou'],
      ['Kubernetes', 'kubernetes'], ['café', 'cafe'],
    ]
    for (const [input, folded] of AGREED) expect(glossaryKey(input)).toBe(folded)
  })

  it('the first spelling wins and is kept VERBATIM — it is what renders', () => {
    const { terms } = normalizeGlossary(['TwinAI', 'twinai', 'TWINAI'])
    expect(terms).toEqual([{ term: 'TwinAI' }])
  })
})

describe('the stored list does not depend on submission order', () => {
  it('two identical glossaries submitted differently normalise identically', () => {
    // The boot manifest pins this list and its digest. A digest that moved with
    // form order would make one glossary look like two, and a re-pin would read
    // as a changed input.
    const a = normalizeGlossary(['zeta', 'alpha', 'Mu'])
    const b = normalizeGlossary(['Mu', 'zeta', 'alpha'])
    expect(a.terms).toEqual(b.terms)
    expect(a.terms.map((t) => t.term)).toEqual(['alpha', 'Mu', 'zeta'])
  })

  it('accepts objects or bare strings, since a form may send either', () => {
    expect(normalizeGlossary([{ term: 'TwinAI' }, 'Kubernetes']).terms)
      .toEqual([{ term: 'Kubernetes' }, { term: 'TwinAI' }])
  })

  it('a non-array is no glossary rather than a crash', () => {
    for (const raw of [null, undefined, 'TwinAI', 42, {}]) {
      expect(normalizeGlossary(raw)).toEqual({ terms: [], rejected: [], overCap: 0 })
    }
  })
})

describe('refusals are REPORTED, never silent', () => {
  it('names each rejected entry and why', () => {
    // A term the creator typed and never sees again is a promise the product
    // broke — and this is the field the plan calls the highest-value one.
    const { terms, rejected } = normalizeGlossary(['TwinAI', 'Twin AI', '', 'x'.repeat(99)])
    expect(terms).toEqual([{ term: 'TwinAI' }])
    expect(rejected).toEqual([
      { input: 'Twin AI', reason: 'not_one_word' },
      { input: '', reason: 'empty' },
      { input: 'x'.repeat(99), reason: 'too_long' },
    ])
  })

  it('reports how many went over the cap rather than truncating quietly', () => {
    const many = Array.from({ length: MAX_GLOSSARY_TERMS + 3 }, (_, i) => `term${String(i).padStart(4, '0')}`)
    const { terms, overCap } = normalizeGlossary(many)
    expect(terms.length).toBe(MAX_GLOSSARY_TERMS)
    expect(overCap).toBe(3)
  })
})

describe('the key set is what a consumer asks', () => {
  it('answers "is this word a known term?" case-insensitively', () => {
    const keys = glossaryKeySet(normalizeGlossary(['TwinAI', 'Kubernetes']).terms)
    expect(keys.has(glossaryKey('twinai'))).toBe(true)
    expect(keys.has(glossaryKey('TWINAI'))).toBe(true)
    expect(keys.has(glossaryKey('cucumbers'))).toBe(false)
  })
})
