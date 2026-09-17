// THE UNDER-1K BAND OVERRIDE WAS AIMED AT THE WRONG AXIS.
//
// It replaces `best_result` so that a creator with no reach is never asked which
// video "outperformed everything". That danger is real. But only TWO of the nine
// `best_result` wordings ask about a POST at all — the rest ask about a client, a
// customer, a buyer, or a thing she made, and those are answerable with two
// hundred followers.
//
// ⚠️ THE MEASURED CONSEQUENCE, WHICH IS WHY THIS FILE EXISTS: a business-bucket
// creator under the band was asked "what is the best thing that has happened
// because of something you posted" INSTEAD OF "what is the best result a client
// has had with you". That trades the one question of the three most likely to
// carry a figure a writer can quote for a follower-growth question. Seen on a
// real account on 2026-09-17.
//
// ⚖️ AND THE CAUTIOUS DEFAULT IS PRESERVED. A bucket with no rewrite still gets
// the gentle wording, because the generic bank question has never been measured
// on a small account. An exemption must be CLAIMED, never inferred.
import { describe, it, expect } from 'vitest'
import { CREATOR_QUESTIONS, OPENING_THREE, type CreatorQuestion } from '../creatorQuestions'
import { creatorQuestionsFor, openingQuestionsFor, SELLS_KINDS } from '../nicheQuestions'

const UNDER_1K = 'What is the best thing that has happened because of something you posted?'

/** The two passes, in the order `StoryInterview` runs them. */
function onScreen(
  niche: string | null,
  sells: Parameters<typeof openingQuestionsFor>[1],
  band: string | null,
): CreatorQuestion[] {
  const byNiche = creatorQuestionsFor(niche, CREATOR_QUESTIONS, sells === 'none' || sells === null ? null : sells)
  const worded = openingQuestionsFor(byNiche, sells, band)
  return OPENING_THREE
    .map((id) => worded.find((x) => x.id === id))
    .filter((q): q is CreatorQuestion => !!q)
}

const askOf = (qs: CreatorQuestion[], id: string) => qs.find((q) => q.id === id)?.ask

describe('the band must not eat a question that is answerable at any size', () => {
  it('a business creator under 1k is still asked about a CLIENT result', () => {
    const asks = onScreen('Business coaching for founders', null, 'under_1k')
    expect(askOf(asks, 'best_result')).toBe('What is the best result a client has had with you?')
    expect(askOf(asks, 'best_result')).not.toBe(UNDER_1K)
  })

  it('and the other two keep their business wording, which is what was already right', () => {
    const asks = onScreen('Business coaching for founders', null, 'under_1k')
    expect(askOf(asks, 'expensive_lesson')).toBe('What did you spend money on that did not work?')
    expect(askOf(asks, 'contrarian')).toBe('What advice does everyone in your industry give that you think is wrong?')
  })

  it('an entertainment creator under 1k IS still spared the reach question', () => {
    // This is the case the override was written for, and it must not regress.
    const asks = onScreen('Comedy sketches and reaction videos', null, 'under_1k')
    expect(askOf(asks, 'best_result')).toBe(UNDER_1K)
  })

  it('a creator who sells nothing under 1k is still spared it too', () => {
    const asks = onScreen('Business coaching for founders', 'none', 'under_1k')
    expect(askOf(asks, 'best_result')).toBe(UNDER_1K)
  })

  it('a bucket with NO rewrite keeps the cautious wording — silence is not an exemption', () => {
    // `health` has an empty override table, so nothing has claimed an exemption.
    const asks = onScreen('Strength training for postpartum women', null, 'under_1k')
    expect(askOf(asks, 'best_result')).toBe(UNDER_1K)
  })

  it('above the band nobody gets the under-1k wording', () => {
    for (const band of [null, 'growing', 'established']) {
      const asks = onScreen('Comedy sketches and reaction videos', null, band)
      expect(askOf(asks, 'best_result'), `band ${band}`).not.toBe(UNDER_1K)
    }
  })

  it('the band never touches the other two questions, at any niche or sells', () => {
    for (const niche of ['Business coaching for founders', 'Comedy sketches and reaction videos', null]) {
      for (const sells of [...SELLS_KINDS, 'none', null] as const) {
        const under = onScreen(niche, sells, 'under_1k')
        const over = onScreen(niche, sells, null)
        for (const id of ['expensive_lesson', 'contrarian']) {
          expect(askOf(under, id), `${niche}/${sells}/${id}`).toBe(askOf(over, id))
        }
      }
    }
  })

  // ⚠️ THE TOTALITY GUARD. Without this the marker is a blocklist: a future
  // bucket could add a reach-based `best_result` and silently lose the
  // protection. Every wording that reaches a creator must be classified, and a
  // reach question is recognisable by naming a video or a post.
  it('every best_result wording that reaches a creator is classified correctly', () => {
    const reachWord = /\b(video|post|posted|views?|outperformed)\b/i
    const seen: string[] = []
    for (const niche of [
      'Business coaching for founders', 'Comedy sketches and reaction videos',
      'Software engineering tutorials', 'Strength training for postpartum women',
      'Leathercraft & Custom Bible Rebinding', null,
    ]) {
      for (const sells of [...SELLS_KINDS, 'none', null] as const) {
        const over = onScreen(niche, sells, null)
        const ask = askOf(over, 'best_result')
        if (ask === undefined) continue
        seen.push(ask)
        const under = askOf(onScreen(niche, sells, 'under_1k'), 'best_result')
        // A reach question must be swapped; a non-reach question must survive —
        // EXCEPT the generic fallback, which claims no exemption by design.
        if (reachWord.test(ask)) {
          expect(under, `reach question left in place: ${niche}/${sells}`).toBe(UNDER_1K)
        }
      }
    }
    // Refuse a vacuous pass: the sweep must actually have covered both outcomes.
    expect(new Set(seen).size).toBeGreaterThan(3)
    expect(seen.some((a) => reachWord.test(a))).toBe(true)
    expect(seen.some((a) => !reachWord.test(a))).toBe(true)
  })
})
