// SHE HAD AN ENDING ALL ALONG AND NOTHING EVER OFFERED IT TO HER.
//
// ⚠️⚠️ MEASURED IN PRODUCTION 2026-09-09: 0 of 51 voices carry a `defaultCta`;
// 47 of 51 carry extracted `recurring_ctas`. The pipe between them has never
// existed, and the consequence was observed live — a TikTok creator's script
// ending on "subscribe to our channel" while her real endings sat one field
// away.
//
// ⚖️ AND THIS IS WHY "2 of 4 ready" WAS RIGHT. `setupAreas` derives from values,
// not a stored flag — there is no flag to delete. The CTA area reads
// `hasConfirmedCta`, which requires a string a PERSON typed, so it has read
// `needs_setup` for every creator Twin has ever had. The readiness bug and the
// CTA bug are one bug, and this is its root.
import { describe, expect, it } from 'vitest'
import { suggestedCta, hasConfirmedCta, ctaMechanismIn } from '../cta'

// ── VERBATIM PRODUCTION SETS, read 2026-09-09 ─────────────────────────────
const REAL = {
  linkFirst: [
    'head to the first link in the description and you can grab this database 100% for free',
    "All right, let's get back to the episode.",
  ],
  // ⚠️ THE MODEL DESCRIBING HER RATHER THAN QUOTING HER. A real stored set.
  aDescription: [
    'Ends videos by highlighting the ongoing success, virality, or customer growth'
    + ' of the business rather than a traditional call to action',
  ],
  // ⚠️ THE LITERAL STRING "None". Also a real stored set.
  literalNone: ['None'],
  // ⚠️ SIGN-OFFS, NOT ASKS. Three separate accounts store variations of these.
  signOffsOnly: ['Do the work', 'Take more shots on goal', 'Stop talking about the market'],
  // ⚠️ LINE ONE ASKS NOTHING, LINE TWO DOES. A real stored set.
  askIsSecond: ['check that out as well', 'links down below and on screen somewhere', "let's get back to it"],
  bakeryQuestion: ['Mechanics, what would you do in this situation?'],
  commerce: ['Sign up now for new exclusive drops each month!', 'Link in bio', 'What would you do if...'],
  // ⚠️ A GENUINE ASK THE DETECTOR MISSES. Kept as a fixture so the gap is
  // visible rather than remembered — see the test at the bottom of this file.
  knownMiss: ['Buy lunch.ly because this could be you.', 'Go to lunch.ly.com slash sweepstakes for more details.'],
}

describe('it offers her own sentence, verbatim', () => {
  it('takes the first line that actually asks something', () => {
    const s = suggestedCta(REAL.linkFirst)!
    expect(s.text).toBe(REAL.linkFirst[0])
    // Her words, not a smoothed version — the same rule `resolveCta` states.
    expect(s.text).not.toMatch(/^Follow for more/)
  })

  it('skips a leading sign-off to reach the real ask', () => {
    // ⚠️ "check that out as well" IS FIRST AND ASKS NOTHING SPECIFIC. A naive
    // [0] would offer it as her call to action.
    const s = suggestedCta(REAL.askIsSecond)
    expect(s?.text).toBe('links down below and on screen somewhere')
    expect(s?.mechanism).toBe('link')
  })

  it('reads a direct question to the viewer as an ask', () => {
    expect(suggestedCta(REAL.bakeryQuestion)?.mechanism).toBe('comment')
  })

  it('carries the mechanism the writer already uses', () => {
    const s = suggestedCta(REAL.commerce)!
    expect(s.mechanism).toBe(ctaMechanismIn(s.text))
  })
})

describe('it refuses the three things that are not endings', () => {
  it('refuses a set that only signs off', () => {
    // ⚖️ 18 OF 47 ACCOUNTS ARE IN THIS STATE. Offering "Do the work" as a call
    // to action would teach her the suggestion is not worth reading.
    expect(suggestedCta(REAL.signOffsOnly)).toBeNull()
  })

  it('refuses the literal string "None"', () => {
    expect(suggestedCta(REAL.literalNone)).toBeNull()
  })

  it('refuses the model DESCRIBING her endings instead of quoting one', () => {
    // ⚠️⚠️ THE LOAD-BEARING REFUSAL. This is a real stored value, and a naive
    // `recurring_ctas[0]` would put a sentence ABOUT her endings in front of her
    // as though it were one of them — she would tap "yes, that's mine" on a
    // description of herself.
    expect(suggestedCta(REAL.aDescription)).toBeNull()
  })

  it('refuses absent, empty and malformed input', () => {
    expect(suggestedCta(null)).toBeNull()
    expect(suggestedCta(undefined)).toBeNull()
    expect(suggestedCta([])).toBeNull()
    expect(suggestedCta(['   ', ''])).toBeNull()
    expect(suggestedCta([42, { text: 'buy now' }] as unknown[])).toBeNull()
  })
})

describe('a suggestion is not a confirmation', () => {
  it('suggesting does not make the profile ready', () => {
    // ⚠️⚠️ THE RULE THIS WHOLE CHANGE TURNS ON. `hasConfirmedCta`'s own comment
    // records the precedent: the meter must not tick off a sentence Twin wrote
    // for itself, "which is precisely how the old palette meter came to report
    // brand colours nobody chose." A candidate she has not seen is not an answer
    // she has given.
    const s = suggestedCta(REAL.commerce)!
    expect(s.text).toBeTruthy()
    // The stored value is still empty, so readiness is still false.
    expect(hasConfirmedCta(null)).toBe(false)
    expect(hasConfirmedCta('')).toBe(false)
    expect(hasConfirmedCta('   ')).toBe(false)
  })

  it('and once she confirms it, it counts', () => {
    const s = suggestedCta(REAL.commerce)!
    expect(hasConfirmedCta(s.text)).toBe(true)
  })
})

describe('a gap in the shared detector, recorded rather than papered over', () => {
  it('misses a buy CTA that names a brand instead of a pronoun', () => {
    // ⚠️⚠️ "Buy lunch.ly because this could be you." IS A REAL STORED ENDING AND
    // A REAL CALL TO ACTION, and `ctaMechanismIn` does not see it: the `buy`
    // pattern requires `buy (it|now|yours|here|your first)`, so a brand name
    // after the verb falls through. Neither does the second line.
    //
    // ⚖️ NOT WIDENED HERE, ON PURPOSE. `ctaMechanismIn` is shared with the
    // WRITER — generate-blueprint reads it to decide what a line asks for — so
    // loosening it changes script behaviour, which is a different change with a
    // different tier and its own evidence. This test PINS the miss so the next
    // person to widen the patterns has a failing case waiting for them, exactly
    // as `a-virtual-haul-has-no-object` pinned its residual.
    //
    // If a future change catches it, this test fails, and the coverage figure
    // in the module header (29 of 47) is what needs updating.
    expect(suggestedCta(REAL.knownMiss)).toBeNull()
  })
})

// ── AND THE SCREEN ACTUALLY OFFERS IT ─────────────────────────────────────
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const SETTINGS = readFileSync(join(
  dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
  'apps', 'web', 'src', 'pages', 'Settings.tsx'), 'utf8')

describe('the suggestion reaches the one screen that asks', () => {
  it('Settings computes it from her extracted endings', () => {
    expect(SETTINGS).toMatch(/suggestedCta\(\s*\(voiceProfile as \{ recurring_ctas\?: unknown\[\] \} \| null\)\?\.recurring_ctas\)/)
  })

  it('seeds the DRAFT, never the stored value', () => {
    // ⚠️⚠️ THE WHOLE SAFETY PROPERTY IN ONE LINE. Seeding the stored value would
    // tick readiness off a sentence she never read — the palette-meter failure
    // exactly. Seeding the draft leaves Save as the only thing that confirms.
    expect(SETTINGS).toMatch(/useState\(ctaText \|\| \(ctaSuggestion\?\.text \?\? ''\)\)/)
    expect(SETTINGS).not.toMatch(/savePreScriptBrief\([^)]*suggestedCta/)
  })

  it('says where the sentence came from', () => {
    expect(SETTINGS).toContain('We took this from your own posts')
    expect(SETTINGS).toContain('cta-suggestion-note')
  })

  it('the invented placeholder is gone', () => {
    // ⚖️ "Try Twin free" WAS A SENTENCE ABOUT US, shown to a creator as an
    // example of her own ending, on the field whose emptiness produced four
    // invented CTAs.
    expect(SETTINGS).not.toContain('placeholder="Try Twin free"')
  })
})
