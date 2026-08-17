// A GUESSED OFFER WAS PRESENTED AS A COMMITMENT THE CREATOR HAD MADE.
//
// ⚠️ MEASURED ON A REAL ACCOUNT. The offer field was auto-filled with "A radical
// mindset shift towards patience, self-awareness…" — a THEME read off somebody's
// posts, not an offer — under the sentence "it becomes the call to action on
// every video."
//
// ⚖️ AND THE SENTENCE WAS FALSE. `offer` is written to the brief only when
// `offerTouched`, so a guess nobody edits is stored as null and reaches no
// script. The behaviour was already correct; the notice was manufacturing the
// alarm, and a creator who believes the notice has been told their video will
// promote something they never claimed.
//
// ⚖️ AN INFERENCE MUST NOT CREATE AN OBLIGATION. That rule is enforced in three
// places and all three are checked here, because the failure mode is one of them
// quietly disagreeing: what is STORED, what the READINESS gate is given, and
// what the creator is TOLD.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { assessReadiness } from '../generationReadiness'

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'apps', 'web', 'src')
const ONBOARDING = readFileSync(join(WEB, 'pages', 'Onboarding.tsx'), 'utf8')
const BUILDING = readFileSync(join(WEB, 'pages', 'v2', 'V2Building.tsx'), 'utf8')

describe('what is stored', () => {
  it('writes the offer only when the creator typed it', () => {
    // ⚠️ THE LINE THAT MAKES THE REST TRUE. Without it a guess becomes an
    // answer by nobody touching it, which is consent by inaction.
    expect(ONBOARDING).toMatch(/offer: offerTouched \? product : null/)
  })
})

describe('what the readiness gate is given', () => {
  it('is the brief, never the scan\'s guess', () => {
    // ⚠️ `profile.offer` IS FORBIDDEN A BLANK BY THE SCAN PROMPT, so the model
    // must produce something. Passing it here made every creator "promoting".
    expect(BUILDING).toMatch(/offer: str\(vBrief\.offer\) \?\? null/)
    expect(BUILDING).not.toMatch(/offer:[^\n]*profile\?\.offer/)
  })

  it('asks nothing about products when nothing is being promoted', () => {
    // ⚖️ THE BEHAVIOUR THE CREATOR SHOULD HAVE SEEN. With no offer stated and
    // "nothing of anyone else's" on file, the commercial questions resolve
    // themselves rather than being asked.
    const verdict = assessReadiness({
      goal: 'authority', angle: 'https://example.com/x', offer: null,
      relationship: 'nothing_to_sell', cta: null, audience: 'solo founders',
      referenceRead: true, hasCreatorKnowledge: true,
    })
    const asked = verdict.fields.filter((f) => f.state === 'MISSING_REQUIRED').map((f) => f.field)
    expect(asked).not.toContain('relationship')
    expect(asked).not.toContain('claims')
  })

  it('and DOES ask once an offer is genuinely stated', () => {
    // ⚖️ THE GATE IS NOT BEING WEAKENED. A creator who names an offer is
    // promoting something, and the disclosure questions are owed.
    const verdict = assessReadiness({
      goal: 'sell', angle: 'https://example.com/x', offer: 'Twin — it edits your videos',
      relationship: null, cta: null, audience: 'solo founders',
      referenceRead: true, hasCreatorKnowledge: true,
    })
    const asked = verdict.fields.filter((f) => f.state === 'MISSING_REQUIRED').map((f) => f.field)
    expect(asked).toContain('relationship')
  })
})

describe('what the creator is told', () => {
  it('no longer claims an untouched guess drives every video', () => {
    // ⚠️ THE EXACT SENTENCE THIS EXISTS FOR.
    expect(ONBOARDING).not.toMatch(/it becomes the call to action on every video/)
  })

  it('says plainly that an unedited guess is not used', () => {
    expect(ONBOARDING).toMatch(/We will not use it until you edit it/)
  })
})
