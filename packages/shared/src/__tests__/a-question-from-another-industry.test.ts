// "WHAT NUMBER DO YOU TRACK THE MOST?" ASKED OF SOMEONE WITH NO DASHBOARD.
//
// ⚠️ REPORTED LIVE. Not a bad question — a question from another industry. By
// the time she reaches it Twin holds her niche, her vocabulary and her own
// opinions, and it still asks her to translate all of that into our words.
//
// ⚖️ MEASURED 2026-09-09 OVER ALL 47 STORED NICHES, with the real function:
//   business 22 · entertainment 8 · tech 8 · health 3 · food 2 · creator 1
//   no bucket 3   → 30 of 47 (64%) receive niche wording.
import { describe, expect, it } from 'vitest'
import { nicheBucket, creatorQuestionsFor, NICHE_BUCKETS } from '../nicheQuestions'
import { CREATOR_QUESTIONS, nextQuestion } from '../creatorQuestions'

// Verbatim stored niches, read from production.
const REAL = {
  business: 'Business strategy, scaling, hiring, and entrepreneurial mindset.',
  businessOdd: 'Real estate investing, cash flow optimization, property transformation, co-living',
  tech: 'Android tech tips, phone customization, hidden settings, and app tutorials',
  fashionTech: 'Fashion Tech / AI Virtual Try-On / E-commerce Optimization',
  food: 'Baking & Micro-Bakery Process',
  health: 'Physiotherapy & Knee/ACL Rehabilitation',
  none: 'Handmade Soy Candles & Personal Lifestyle Storytelling',
}

describe('the raw niche cannot key a table, so it buckets', () => {
  it('buckets the real stored strings', () => {
    expect(nicheBucket(REAL.business)).toBe('business')
    expect(nicheBucket(REAL.tech)).toBe('tech')
    expect(nicheBucket(REAL.food)).toBe('food')
    expect(nicheBucket(REAL.health)).toBe('health')
  })

  it('commerce wins where a niche is both', () => {
    // ⚠️ "AI tools for founders and business idea validation" IS BOTH, and
    // reading it as tech loses that the audience is founders — which is the
    // thing that changes the question.
    expect(nicheBucket('AI tools for founders and business idea validation')).toBe('business')
  })

  it('says null rather than guessing', () => {
    // ⚖️ THREE OF 47 LAND HERE and they are real: soy candles, mobile auto
    // repair, women's empowerment and trades. Forcing them into a bucket would
    // ask a trades creator a founder's question.
    expect(nicheBucket(REAL.none)).toBeNull()
    expect(nicheBucket('')).toBeNull()
    expect(nicheBucket(null)).toBeNull()
    expect(nicheBucket(42)).toBeNull()
  })
})

describe('the id never changes, only the wording', () => {
  it('every question keeps its id', () => {
    // ⚠️⚠️ THE LOAD-BEARING RULE, and it is `CreatorQuestion.id`'s own warning:
    // "NEVER REUSE AN ID FOR A DIFFERENT QUESTION. A creator who answered the
    // old one would silently never see the new one." A niche variant is the SAME
    // question in her language.
    const bank = creatorQuestionsFor(REAL.business)
    expect(bank.map((q) => q.id)).toEqual(CREATOR_QUESTIONS.map((q) => q.id))
  })

  it('so somebody who already answered stays answered', () => {
    const answered = CREATOR_QUESTIONS.map((q) => q.id)
    expect(nextQuestion(answered, creatorQuestionsFor(REAL.business))).toBeNull()
  })

  it('and the reported question is actually reworded', () => {
    const generic = CREATOR_QUESTIONS.find((q) => q.id === 'number_that_matters')!
    const forBusiness = creatorQuestionsFor(REAL.business).find((q) => q.id === 'number_that_matters')!
    expect(forBusiness.ask).not.toBe(generic.ask)
    expect(forBusiness.ask).not.toMatch(/in your niche/i)
  })
})

describe('falling back is a real answer, not a gap', () => {
  it('an unbucketed niche gets the bank that has always been there', () => {
    expect(creatorQuestionsFor(REAL.none)).toBe(CREATOR_QUESTIONS)
    expect(creatorQuestionsFor(null)).toBe(CREATOR_QUESTIONS)
  })

  it('a bucket with too few creators to write for also falls back', () => {
    // ⚖️ food IS 2 VOICES AND health IS 3. Hand-writing four questions for a
    // bucket of two is writing for almost nobody, and an empty override says
    // "measured, and too few" rather than "nobody looked".
    expect(creatorQuestionsFor(REAL.food)).toBe(CREATOR_QUESTIONS)
    expect(creatorQuestionsFor(REAL.health)).toBe(CREATOR_QUESTIONS)
  })

  it('beauty_fashion is declared and matches nobody, on purpose', () => {
    // ⚠️⚠️ THE REPORT CAME FROM A BEAUTY CREATOR AND THAT BUCKET IS EMPTY IN
    // PRODUCTION. The only fashion-shaped niches stored are "Fashion Tech / AI
    // Virtual Try-On" — B2B software for e-commerce, which buckets as business
    // and should. Saying so is better than inventing a beauty table on a sample
    // of zero.
    expect(NICHE_BUCKETS).toContain('beauty_fashion')
    expect(nicheBucket(REAL.fashionTech)).not.toBe('beauty_fashion')
    // The pattern itself is right; it is the corpus that has nobody in it yet.
    expect(nicheBucket('skincare routines and honest product reviews')).toBe('beauty_fashion')
  })
})

describe('no chips are generated per creator', () => {
  it('every reworded question comes from the written table', () => {
    // ⚖️ THE OWNER'S RULE FROM THE AUDIENCE CARDS: generating options throws
    // away a better stored answer to ask a worse question. Two banks, both from
    // a list a human wrote, so both are arguable.
    for (const niche of [REAL.business, REAL.businessOdd, REAL.tech]) {
      for (const q of creatorQuestionsFor(niche)) {
        expect(typeof q.ask).toBe('string')
        expect(q.ask.trim().length).toBeGreaterThan(10)
        expect(q.hint.trim().length).toBeGreaterThan(10)
      }
    }
  })
})

// ── AND THE CARD ACTUALLY ASKS THE REWORDED ONE ───────────────────────────
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const CARD = readFileSync(join(
  dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
  'apps', 'web', 'src', 'components', 'CreatorQuestionCard.tsx'), 'utf8')

describe('the bank reaches the one screen that asks', () => {
  it('the selector is handed the niche bank', () => {
    // ⚠️ THIS PINNED THE WHOLE CALL AND WENT STALE ON 2026-09-12 WHILE ITS CLAIM
    // GREW. The claim is that the SELECTOR IS HANDED THE NICHE BANK rather than
    // the raw one. It now also receives what she sells, so the argument list
    // grew and the literal stopped matching correct code. Asserted as "the bank
    // the selector gets comes from `creatorQuestionsFor(niche...)`", which a
    // regression to `CREATOR_QUESTIONS` still fails.
    expect(CARD).toMatch(/nextQuestionByDeficit\(put, counts, creatorQuestionsFor\(niche[,)]/)
    expect(CARD).not.toMatch(/nextQuestionByDeficit\([^)]*CREATOR_QUESTIONS/)
    expect(CARD).toMatch(/loadVoiceNiche\(voiceId\)/)
  })

  it('the effect depends on voiceId now that it reads it', () => {
    // ⚠️ IT WAS `[]` WHILE `voiceId` WAS ONLY USED BY THE SUBMIT HANDLER.
    // Leaving it empty once the effect loads the niche would show the previous
    // voice's wording after a switch.
    expect(CARD).toMatch(/\}, \[voiceId\]\)/)
  })
})
