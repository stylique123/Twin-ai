// A QUESTION THE PARSER CANNOT ACCEPT AN ANSWER TO IS A FIELD THROWN AWAY.
//
// ⚠️ MEASURED IN PRODUCTION 2026-09-01. `FIELD_QUESTIONS.primaryMode` named six
// words of its own — talking_head, voiceover_broll, demonstration, skit,
// interview, screen_recording — while `visualExtraction` validated against
// `PRODUCTION_MODES`. The lists shared exactly ONE word. Every other answer the
// model gave was rejected `not_in_vocabulary`, so across 158 assessed
// references the only mode that ever survived was talking_head (19 rows) and
// 141 carried none at all.
//
// ⚖️ THE COST WAS THE WHOLE GALLERY. `galleryPolicy.eligibility` refuses a card
// with `unsupported_production` by reading this field, and the field could never
// hold a value that raised it — `other_unsupported` was not even in the question,
// so the model could not have said it. The gate was built, wired, and starved,
// which is why a business account was served skits and B-roll with a "Remix in
// my voice" button under each one.
import { describe, expect, it } from 'vitest'
import { PRODUCTION_MODES } from '@twinai/shared'
import { FIELD_QUESTIONS } from '../visualPrompt.js'

describe('the primaryMode question and the primaryMode validator agree', () => {
  const question = FIELD_QUESTIONS['primaryMode']

  it('asks for every mode the parser accepts', () => {
    for (const mode of PRODUCTION_MODES) {
      expect(question, `the question never offers "${mode}", so a model cannot answer it`)
        .toContain(mode)
    }
  })

  // ⚠️ THE FOUR THE MODEL ACTUALLY RETURNED AND WAS REFUSED FOR, verbatim from
  // `reference_content_profiles.visual_rejections`. Naming them is what stops
  // the old vocabulary quietly coming back.
  it('no longer offers words the parser rejects', () => {
    for (const dead of ['voiceover_broll', 'demonstration', 'skit', 'screen_recording']) {
      // `skit` is a substring of nothing in PRODUCTION_MODES except `pov_skit`,
      // so it is checked as a whole word rather than a substring.
      const asWord = new RegExp(`(^|[^a-z_])${dead}([^a-z_]|$)`)
      expect(asWord.test(question), `"${dead}" is offered but cannot be stored`).toBe(false)
    }
  })

  it('offers the refusal value the gallery gate keys on', () => {
    // Without this word in the question the model can never report that a video
    // is made in a way Twin cannot help with, and no card is ever refused.
    expect(question).toContain('other_unsupported')
  })
})
