// A NICHE TERM IS NOT A CREATOR'S NAME.
//
// ⚠️ THE FIXTURES ARE THE REAL MEASUREMENT. A TF-IDF pass over 5,814 real cards
// in six niches returned `madaan`, `eesh`, `gopal`, `gaur`, `vogue`,
// `rodrigo's` and `olivia` alongside genuine terminology. On the CARD axis they
// are indistinguishable from real terms — `vogue` 91 vs `garlic` 97, `madaan`
// 52 vs `tbsp` 60. Only creator spread separates them.
import { describe, it, expect } from 'vitest'
import {
  termsIn, nicheVocabulary, nicheVocabularies, MIN_CREATORS_FOR_TERM, type NicheCard,
} from '../nicheVocabulary'

// ⚠️ THE FILLER IS UNIQUE PER CARD, AND THAT IS NOT COSMETIC. My first fixtures
// used a shared "something ... here" filler, and `something` accumulated spread
// across every creator and qualified as vocabulary — correctly. The TEST was
// wrong, not the module: shared filler IS a term used by many creators. Unique
// filler keeps each fixture about the one term it is testing.
// ⚠️ LETTERS ONLY: the tokeniser is /[a-z][a-z'-]{2,}/, so `wordx0` and `wordx1`
// both tokenise to `wordx` and shared filler crept back in through the digits.
const A = 'abcdefghijklmnopqrstuvwxyz'
const filler = (i: number): string => `qq${A[i % 26]}${A[Math.floor(i / 26) % 26]}`

/** n cards from n distinct creators, all carrying `term`. */
const spread = (term: string, creators: number): NicheCard[] =>
  Array.from({ length: creators }, (_, i) => ({ creator: `c${i}`, title: `${filler(i)} ${term}` }))

/** `cards` cards from ONE creator — the shape of a name or a brand. */
const oneCreator = (term: string, cards: number): NicheCard[] =>
  Array.from({ length: cards }, (_, i) => ({ creator: 'solo', title: `${filler(i)} ${term}` }))

describe('tokenising a title', () => {
  it('strips hashtags, mentions and urls before counting', () => {
    const t = termsIn('Crispy chicken #foodtiktok @chef https://x.co/a')
    expect(t.has('chicken')).toBe(true)
    expect(t.has('crispy')).toBe(true)
    expect(t.has('foodtiktok')).toBe(false)
    expect(t.has('chef')).toBe(false)
  })

  // ⚖️ ONE CARD, ONE VOTE PER TERM. A recipe repeating "chicken" nine times is
  // one card's opinion, not nine.
  it('deduplicates within a card', () => {
    expect([...termsIn('chicken chicken chicken')]).toEqual(['chicken'])
  })

  it('drops stopwords and things too short to be terms', () => {
    const t = termsIn('the a of to in it is')
    expect(t.size).toBe(0)
  })

  it('is not a string, is no terms', () => {
    expect(termsIn(null).size).toBe(0)
    expect(termsIn(42).size).toBe(0)
  })
})

describe('creator spread is the discriminator, not frequency', () => {
  // ⚠️⚠️ THE WHOLE POINT. 52 cards from one creator is a name; 13 cards from 13
  // creators is terminology. Frequency ranks the name HIGHER.
  it('a term on 52 cards from ONE creator is refused', () => {
    const v = nicheVocabulary(oneCreator('madaan', 52), 'Business')
    expect(v).toEqual([])
  })

  it('a term on 13 cards from 13 creators is kept', () => {
    const v = nicheVocabulary(spread('tbsp', 13), 'Food')
    expect(v.map((x) => x.term)).toContain('tbsp')
    expect(v.find((x) => x.term === 'tbsp')!.creators).toBe(13)
  })

  it('the name loses to the term even when it has far more cards', () => {
    const v = nicheVocabulary([...oneCreator('madaan', 52), ...spread('tbsp', 13)], 'Food')
    expect(v.map((x) => x.term)).toEqual(['tbsp'])
  })

  it('holds the measured line exactly at ten creators', () => {
    expect(MIN_CREATORS_FOR_TERM).toBe(10)
    expect(nicheVocabulary(spread('whitening', 9), 'Beauty')).toEqual([])
    expect(nicheVocabulary(spread('whitening', 10), 'Beauty').map((x) => x.term))
      .toEqual(['whitening'])
  })

  // ⚖️ ORDERED BY SPREAD, NOT CARDS. Ordering by cards puts the near-miss names
  // at the top of the list, which is the failure this module exists to prevent.
  it('orders by creator spread', () => {
    const v = nicheVocabulary([...spread('chicken', 30), ...spread('garlic', 15)], 'Food')
    expect(v.map((x) => x.term)).toEqual(['chicken', 'garlic'])
  })
})

describe('the label’s own words are circular', () => {
  // ⚠️ MEASURED: "beauty" was the top Beauty term (324 cards) and "education"
  // the top Education term (331). The label leaks into titles and tags.
  it('never reports the niche label back as its own vocabulary', () => {
    const v = nicheVocabulary(spread('beauty', 40), 'Beauty')
    expect(v).toEqual([])
  })

  it('drops every word of a multi-word label', () => {
    const v = nicheVocabulary(spread('comedy', 40), 'Relatable Comedy')
    expect(v).toEqual([])
  })
})

describe('a broken scrape cannot manufacture spread', () => {
  // ⚠️ 940 CARDS IN THE CORPUS CARRY THE CREATOR LITERALLY NAMED "@". Pooling
  // them under one blank would let one failure look like one creator — or, if
  // treated as distinct, like hundreds.
  it('skips the "@" creator entirely', () => {
    const cards: NicheCard[] = Array.from({ length: 40 },
      (_, i) => ({ creator: '@', title: `${filler(i)} chicken` }))
    expect(nicheVocabulary(cards, 'Food')).toEqual([])
  })

  // ⚠️⚠️ THE CASE MY FIRST TEST MISSED, FOUND BY A SURVIVING MUTANT. Forty cards
  // all under "@" pool to ONE creator and fail the threshold whether "@" is
  // skipped or not — so that test passed with the guard removed. The real
  // failure is "@" casting the TENTH vote and carrying a term over the line on
  // the strength of a scrape that captured nothing.
  it('"@" cannot cast the deciding vote for a term', () => {
    const nine: NicheCard[] = Array.from({ length: 9 },
      (_, i) => ({ creator: `real${i}`, title: `${filler(i)} sourdough` }))
    const atCards: NicheCard[] = Array.from({ length: 30 },
      (_, i) => ({ creator: '@', title: `${filler(i + 9)} sourdough` }))
    // nine real creators is below the bar, and "@" must not make it ten
    expect(nicheVocabulary([...nine, ...atCards], 'Food')).toEqual([])
    // whereas a tenth REAL creator does
    expect(nicheVocabulary([...nine, { creator: 'real9', title: 'zzq sourdough' }], 'Food')
      .map((x) => x.term)).toEqual(['sourdough'])
  })

  it('skips blank and missing creators', () => {
    const cards: NicheCard[] = Array.from({ length: 40 },
      (_, i) => ({ creator: '  ', title: `${filler(i)} chicken` }))
    expect(nicheVocabulary(cards, 'Food')).toEqual([])
    expect(nicheVocabulary([{ creator: null, title: 'chicken' }], 'Food')).toEqual([])
  })
})

describe('silence rather than a short list', () => {
  it('an empty corpus yields no vocabulary, not a guess', () => {
    expect(nicheVocabulary([], 'Food')).toEqual([])
  })

  // ⚖️ A niche Twin cannot describe yet is silence, not a best guess.
  it('a niche where nothing clears the bar yields nothing', () => {
    expect(nicheVocabulary(spread('sourdough', 3), 'Food')).toEqual([])
  })
})

describe('it stores terms, never sentences', () => {
  // ⚠️⚠️ THE RULE THE WHOLE CORPUS RESTS ON, checked at the type level here and
  // by check_corpus_stores_no_sentences.mjs in CI.
  it('every stored value is a single word', () => {
    const v = nicheVocabulary(spread('chicken', 12), 'Food')
    for (const t of v) {
      expect(t.term).not.toContain(' ')
      expect(t.term.length).toBeLessThan(40)
    }
  })
})

describe('distinctiveness — spread alone keeps common words', () => {
  // ⚠️⚠️ MEASURED ON THE REAL CORPUS. With only the spread gate, "Business
  // vocabulary" came back as: mit(28) und(23) ich(20) die(19) das(19) — German
  // function words — and "Beauty" as today, just, going, easy, follow.
  // Those ARE used by many creators. They are simply not terminology.
  const many = (term: string, n: number, tag: string): NicheCard[] =>
    Array.from({ length: n }, (_, i) => ({ creator: `${tag}${i}`, title: `${filler(i)} ${term}` }))

  it('a word present in every niche is dropped from all of them', () => {
    const v = nicheVocabularies(new Map([
      ['Food', [...many('das', 12, 'f'), ...many('chicken', 12, 'f')]],
      ['Beauty', many('das', 12, 'b')],
      ['Education', many('das', 12, 'e')],
    ]))
    expect(v.get('Food')!.map((x) => x.term)).toEqual(['chicken'])
    expect(v.get('Beauty')).toEqual([])
    expect(v.get('Education')).toEqual([])
  })

  // ⚖️ AND THIS IS WHY NO GERMAN STOPWORD LIST IS NEEDED. `und` is removed for
  // exactly the same reason `today` is: it is common, not because it is German.
  it('removes cross-niche words in any language, with no per-language list', () => {
    const v = nicheVocabularies(new Map([
      ['Food', [...many('und', 12, 'f'), ...many('garlic', 12, 'f')]],
      ['Business', many('und', 12, 'b')],
    ]))
    expect(v.get('Food')!.map((x) => x.term)).toEqual(['garlic'])
  })

  // ⚠️ THE PRESENCE BAR IS LOWER THAN THE KEEP BAR. A word need not be prominent
  // elsewhere to disqualify — merely present.
  it('a term merely present elsewhere is disqualified, not just a prominent one', () => {
    const v = nicheVocabularies(new Map([
      ['Food', many('tips', 12, 'f')],
      ['Beauty', many('tips', 3, 'b')], // below the keep bar, at the presence bar
    ]))
    expect(v.get('Food')).toEqual([])
  })

  it('but presence by fewer than three creators does not disqualify', () => {
    const v = nicheVocabularies(new Map([
      ['Food', many('paprika', 12, 'f')],
      ['Beauty', many('paprika', 2, 'b')],
    ]))
    expect(v.get('Food')!.map((x) => x.term)).toEqual(['paprika'])
  })

  // ⚖️ ONE NICHE HAS NOTHING TO BE DISTINCTIVE AGAINST, so the gate is skipped
  // rather than applied vacuously and removing everything.
  it('a single niche returns its spread-qualified terms, gate skipped', () => {
    const v = nicheVocabularies(new Map([['Food', many('chicken', 12, 'f')]]))
    expect(v.get('Food')!.map((x) => x.term)).toEqual(['chicken'])
  })
})
