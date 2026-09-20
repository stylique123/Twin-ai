// ONE ACCOUNT, SCANNED TWICE, AND THE SECOND SCAN TOOK HER QUESTIONS AWAY.
//
// ⚠️⚠️ MEASURED IN PRODUCTION 2026-09-20. `firo.candles` holds two rows. The
// first stored her niche as "Handmade candle crafting and DIY process" — bucket
// `making`, so she was asked "What did you have to remake or throw away while
// learning this?". A later re-scan rewrote it as "Home Decor", which matches no
// pattern, and from that moment she was asked "What does almost everyone in
// YOUR NICHE believe that you think is wrong?" — the generic bank.
//
// Nothing about her changed. The model chose a broader word and the questions
// silently got vaguer, which is exactly what the owner reported: "they were
// specific to the DNA and now these questions are very vague".
import { describe, expect, it } from 'vitest'
import { creatorBucket, nicheBucket, creatorQuestionsFor } from '../nicheQuestions'
import { CREATOR_QUESTIONS } from '../creatorQuestions'

const ask = (niche: string, sub: string | null, id: string): string =>
  (creatorQuestionsFor(niche, CREATOR_QUESTIONS, null, sub).find((q) => q.id === id) as { ask: string }).ask

describe('the re-scan that broadened her niche', () => {
  it('the FIRST scan reached the maker questions', () => {
    expect(nicheBucket('Handmade candle crafting and DIY process')).toBe('making')
    expect(ask('Handmade candle crafting and DIY process', null, 'expensive_lesson'))
      .toMatch(/remake or throw away/)
  })

  it('the SECOND scan matched nothing on `niche` alone — the regression', () => {
    expect(nicheBucket('Home Decor')).toBeNull()
  })

  it('and `sub_niche` puts her back, because it stayed specific', () => {
    // Her stored sub_niche never changed: "aesthetic handmade soy candles".
    expect(creatorBucket('Home Decor', 'aesthetic handmade soy candles')).toBe('making')
    expect(ask('Home Decor', 'aesthetic handmade soy candles', 'expensive_lesson'))
      .toMatch(/remake or throw away/)
    expect(ask('Home Decor', 'aesthetic handmade soy candles', 'contrarian'))
      .toMatch(/your trade/)
  })
})

describe('the fallback is a fallback, never an override', () => {
  it('a niche that answers keeps its bucket', () => {
    // ⚠️ A NARROWER PHRASE MUST NOT MOVE HER INTO A DIFFERENT WORLD mid-answer.
    expect(creatorBucket('real estate investing', 'handmade candles')).toBe('business')
  })

  it('both blank is still null, and null is still a real answer', () => {
    expect(creatorBucket(null, null)).toBeNull()
    expect(creatorBucket('underwater basket weaving', '')).toBeNull()
  })

  it('a sub_niche alone is enough when the scan recorded no niche', () => {
    expect(creatorBucket('', 'custom Bible rebinding')).toBe('making')
  })
})

describe('the real stored pairs, all of them', () => {
  // Every niche/sub_niche pair below is a REAL production row read 2026-09-20.
  const ROWS: Array<[string, string, string | null]> = [
    ['Home Decor', 'aesthetic handmade soy candles', 'making'],
    ['Handmade candle crafting and DIY process', 'aesthetic handmade soy candles', 'making'],
    ['Handmade Soy Candles & Personal Lifestyle Storytelling', 'artisan wood wick candles', 'making'],
    ['Leathercraft & Custom Bible Rebinding', 'custom Bible rebinding', 'making'],
    ['Bible Rebidding & Leather Craftsmanship', 'custom Bible rebinding', 'making'],
  ]
  for (const [niche, sub, want] of ROWS) {
    it(`${niche} -> ${want}`, () => {
      expect(creatorBucket(niche, sub)).toBe(want)
    })
  }
})
