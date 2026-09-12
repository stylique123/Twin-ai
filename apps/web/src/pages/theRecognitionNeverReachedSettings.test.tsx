// @vitest-environment jsdom
//
// THREE STORED FACTS ON NO SCREEN SHE CAN REACH.
//
// ⚠️ THE RECOGNITION SHIPPED INTO ONBOARDING AND NEVER REACHED SETTINGS — the
// same shape as the commercial question beside it, pointed the other way.
// Onboarding's own note carries the measurement: 45 of 47 voices hold these
// facts and "the only reader was the writer's prompt... it was the creator never
// being shown the inference." A creator who finished onboarding before that
// shipped, or who skipped past it, has never seen them and had nowhere to go.
//
// ⚠️ AND THEY ARE NOT BLANK, WHICH IS THE CORRECTION THAT MATTERS. Measured on
// production 2026-09-12: 47 of 53 voices carry an `enemy`, 47 a `pov`, 49
// `donts`. The reported account's own stored enemy reads "Blank screen paralysis
// and burning 5 hours trying to create social posts from scratch every week."
// Rich, specific, read by the prompt — and rendered nowhere. The defect was
// never that the fact was missing; it was that the screen did not show it.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const here = import.meta.dirname
const SETTINGS = readFileSync(join(here, 'Settings.tsx'), 'utf8')
/** Code only — a comment describing the block must never satisfy a check that
 *  the block exists. This repo has been bitten by exactly that twice. */
const CODE = SETTINGS.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')

describe('the scanned facts are shown where she can change them', () => {
  it('renders them from the shared helper, not a second copy of the rule', () => {
    expect(CODE).toMatch(/scannedAudienceFacts\(voiceProfile\)/)
    expect(CODE).toMatch(/audienceFactConfirmed\(/)
  })

  it('quotes the sentence verbatim rather than paraphrasing it', () => {
    // ⚠️ A PARAPHRASE WOULD ASK HER TO AGREE TO SOMETHING THE WRITER NEVER READS.
    expect(CODE).toMatch(/\{fact\.text\}/)
    expect(CODE).toMatch(/\{fact\.question\}/)
  })

  it('offers both answers', () => {
    expect(CODE).toContain('That is right')
    expect(CODE).toContain('Not quite')
  })
})

describe('declining records nothing, because silence is not an answer', () => {
  // ⚖️ THE STORED VALUE IS THE CONFIRMED SENTENCE, NEVER A FLAG. "Not quite"
  // writes null — it does not write a different sentence and it does not record
  // a refusal, because only a confirmation is an answer.
  it('"Not quite" clears rather than storing anything', () => {
    expect(CODE).toMatch(/confirmedAudiencePain: null/)
    expect(CODE).toMatch(/confirmedDreamOutcome: null/)
  })

  it('"That is right" stores the exact sentence she was shown', () => {
    expect(CODE).toMatch(/confirmedAudiencePain: fact\.text/)
    expect(CODE).toMatch(/confirmedDreamOutcome: fact\.text/)
  })
})

describe('a confirmed fact stays visible here, unlike in onboarding', () => {
  // ⚠️ ONBOARDING HIDES A CONFIRMED FACT BECAUSE IT IS A QUEUE MOVING FORWARD.
  // This screen is where she comes to CHECK things, and a fact that vanishes the
  // moment she agrees cannot be corrected later — which is the whole reason this
  // block exists rather than being a second onboarding.
  // ⚠️ AND CHECKING THE STRING EXISTS IS NOT CHECKING IT RENDERS. A mutant that
  // changed the branch to `{false ? (` left the sentence sitting in dead code
  // and PASSED — the mention-vs-call defect this repo has a written rule about,
  // committed by the guard rather than the code this time. The branch has to be
  // gated on the confirmation itself.
  it('shows a confirmed state with a way back out, on a live branch', () => {
    expect(CODE).toContain('You confirmed this')
    expect(CODE).toMatch(/\{already \? \(/)
    const start = CODE.indexOf('{already ? (')
    const body = CODE.slice(start, CODE.indexOf('Read from your own posts', start))
    expect(body, 'the confirmed state no longer offers a way out').toContain('Not quite')
  })

  // ⚠️ AND THIS CONTROL DID NOT WORK THE FIRST TIME. It forbade the literal
  // `audienceFactConfirmed(...)) return null` — onboarding's exact spelling — so
  // a mutant that hoisted the check into `const already` and then wrote
  // `if (already) return null` matched nothing and PASSED. A negative control
  // written against one spelling of a mistake tests that spelling, not the
  // mistake.
  //
  // ⚖️ SO IT ASSERTS THE PROPERTY OVER THE WHOLE RENDER BODY: nothing inside the
  // fact block may bail out early. Any way of writing "skip a confirmed fact" —
  // hoisted, inverted, guarded, under any variable name — puts a `return null`
  // in here and fails.
  it('nothing in the fact block bails out early', () => {
    const start = CODE.indexOf('scannedAudienceFacts(voiceProfile).map((fact) => {')
    expect(start, 'the fact block was renamed').toBeGreaterThan(-1)
    const body = CODE.slice(start, CODE.indexOf('Read from your own posts', start))
    expect(body.length, 'the block was not bounded').toBeGreaterThan(400)
    expect(body).not.toMatch(/return null/)
  })
})

describe('it reads the confirmation from where it is actually stored', () => {
  // ⚠️ `readProfileAnswers` CARRIES FOUR FIELDS AND THESE ARE NOT AMONG THEM.
  // Routing through it would read `undefined` for every creator and show a
  // confirmed fact as unconfirmed forever — the same mistake `AddYourProductCard`
  // records making with `commercialTies`.
  it('uses the stored brief, not the profile-answers helper', () => {
    expect(CODE).toMatch(/storedBrief\.confirmedAudiencePain/)
    expect(CODE).not.toMatch(/profileAnswers\?\.confirmedAudiencePain/)
  })
})
