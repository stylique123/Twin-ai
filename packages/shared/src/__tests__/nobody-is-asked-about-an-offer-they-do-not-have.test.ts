// THE REMIX CARD ASKED EVERY CREATOR ABOUT THEIR OFFER.
//
// ⚠️ REPORTED WITH A SCREENSHOT AND CONFIRMED IN THE DATABASE. A relationship
// question, a claims question and "what does the OFFER do?" were shown on an
// account whose stored answer was "nothing of anyone else's" and whose Product
// Library was empty. Three questions about a thing that did not exist — on the
// screen that exists to avoid being a questionnaire.
//
// ⚖️ IT DECIDES WHAT TO ASK, NEVER WHAT IS PERMITTED. Showing the block grants
// nothing — the entity's relationship still decides what a script may claim —
// and hiding it forbids nothing. That separation is what makes it safe to skip.
import { describe, expect, it } from 'vitest'
import { compileVideoIntent, showsCommercialBlock, VIDEO_GOALS, CONTENT_FOCUS } from '../videoIntent'

const shows = (answers: Parameters<typeof compileVideoIntent>[0]) =>
  showsCommercialBlock(compileVideoIntent(answers))

describe('it appears when the video has something to promote', () => {
  it('appears when the creator asked to sell or to get leads', () => {
    expect(shows({ goal: 'sell' })).toBe(true)
    expect(shows({ goal: 'leads' })).toBe(true)
  })

  it('appears when the video is ABOUT a product or a review', () => {
    // ⚖️ NEITHER SIGNAL IMPLIES THE OTHER. Somebody can review a product they
    // do not sell, and sell without the video being about the product — so one
    // condition would have missed half the cases.
    expect(shows({ goal: 'authority', focus: 'product' })).toBe(true)
    expect(shows({ goal: 'followers', focus: 'review' })).toBe(true)
  })
})

describe('it stays away from everybody else', () => {
  it('is absent for the creator with nothing to sell', () => {
    // ⚠️ THE EXACT REPORTED CASE: build authority, hot take, no product.
    expect(shows({ goal: 'authority', focus: 'opinion' })).toBe(false)
  })

  it('is absent for teaching, entertaining and growing', () => {
    for (const goal of ['educate', 'entertain', 'followers', 'conversations'] as const) {
      expect(shows({ goal, focus: 'expertise' }), goal).toBe(false)
    }
  })

  it('is absent when nothing was answered at all', () => {
    // ⚖️ SILENCE IS NOT A SALE. An unanswered card must not open a commercial
    // section on the assumption that one might apply.
    expect(shows({})).toBe(false)
  })

  it('is absent for a personal experience or a story', () => {
    expect(shows({ goal: 'authority', focus: 'experience' })).toBe(false)
    expect(shows({ goal: 'followers', focus: 'story' })).toBe(false)
  })
})

describe('the rule is total and stable', () => {
  it('answers for every goal and focus without throwing', () => {
    for (const goal of VIDEO_GOALS) {
      for (const focus of CONTENT_FOCUS) {
        expect(typeof shows({ goal, focus }), `${goal}/${focus}`).toBe('boolean')
      }
    }
  })

  it('reads the compiled signals rather than re-deciding them', () => {
    // ⚖️ ONE DEFINITION OF "COMMERCIAL". `wantsSale` and `wantsProductSubstance`
    // already exist and already have readers; a second rule that re-derived
    // commerciality from goals and focuses would be the copy that drifts.
    const intent = compileVideoIntent({ goal: 'sell', focus: 'expertise' })
    expect(showsCommercialBlock({ wantsSale: false, wantsProductSubstance: false })).toBe(false)
    expect(showsCommercialBlock(intent)).toBe(intent.wantsSale || intent.wantsProductSubstance)
  })
})

// ── AND THE CARD MUST ACTUALLY STOP ASKING ────────────────────────────────
//
// ⚠️ A RULE WITH NO READER IS A STORED OPINION. The whole defect was that the
// verdict already resolved these fields and the card asked them anyway.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { COMMERCIAL_READINESS_FIELDS, isCommercialField, READINESS_FIELDS } from '../generationReadiness'

const BUILD = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'apps', 'web', 'src', 'pages', 'v2', 'V2Building.tsx'), 'utf8')

describe('the remix card reads the rule', () => {
  it('drops the commercial questions when this video sells nothing', () => {
    expect(BUILD).toMatch(/missing\.filter\(\(m\) => !isCommercialField\(m\.field\)\)/)
    expect(BUILD).toMatch(/showsCommercialBlock\(answeredIntent\)/)
  })

  it('suppresses only once the creator has actually answered', () => {
    // ⚠️ SILENCE IS NOT "NOT COMMERCIAL". An unanswered card would otherwise
    // hide a question from somebody who simply had not tapped yet.
    expect(BUILD).toMatch(/const decidedCommercially = Boolean\(/)
    expect(BUILD).toMatch(/decidedCommercially && !showsCommercialBlock/)
  })
})

describe('the commercial field list is part of the vocabulary', () => {
  it('names only fields that exist', () => {
    for (const f of COMMERCIAL_READINESS_FIELDS) {
      expect(READINESS_FIELDS as readonly string[], f).toContain(f)
    }
  })

  it('never suppresses a question that is not about commerce', () => {
    // ⚖️ goal, audience, angle and referenceTransfer apply to every video, and
    // dropping one of those would be hiding a real gap rather than an
    // irrelevant question.
    for (const f of ['goal', 'audience', 'angle', 'referenceTransfer']) {
      expect(isCommercialField(f), f).toBe(false)
    }
    for (const f of ['offer', 'relationship', 'cta', 'claims']) {
      expect(isCommercialField(f), f).toBe(true)
    }
  })
})
