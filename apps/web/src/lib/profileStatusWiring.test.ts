// THE SEPARATION IS ONLY REAL IF THE SCREENS HONOUR IT.
//
// ⚠️ `profileCompletion` CAN BE PERFECTLY HONEST AND THE PRODUCT STILL LIE, if a
// page threads a logo into the meter or keeps interrupting people about colours.
// The model argues that four obligations are different; these are the two places
// a creator actually experiences that claim.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
const SETTINGS = strip(readFileSync(join(here, '..', 'pages', 'Settings.tsx'), 'utf8'))
const REMINDER = strip(readFileSync(join(here, '..', 'components', 'BrandReminder.tsx'), 'utf8'))

describe('the meter is fed only creative answers', () => {
  it('computes the number from the profile input alone', () => {
    expect(SETTINGS).toMatch(/const content = contentProfile\(\{/)
    // ⚠️ THE REGRESSION THIS EXISTS FOR: a kit, a logo or a palette threaded into
    // the meter's input. The shared module has no such parameter, so this would
    // have to be added deliberately — and it must not be.
    const call = SETTINGS.slice(SETTINGS.indexOf('contentProfile({'), SETTINGS.indexOf('const productDna'))
    expect(call).not.toMatch(/brandKit|logo|palette|Hex/i)
  })

  it('reports brand kit and product DNA as states, beside the number', () => {
    expect(SETTINGS).toMatch(/const kitStatus = brandKitStatus\(/)
    expect(SETTINGS).toMatch(/const productDna = productDnaStatus\(/)
    expect(SETTINGS).toMatch(/Not set up/)
  })

  it('only a manual palette makes the kit ready, on the page as in the module', () => {
    // ⚖️ An auto-extracted palette is a reading, not a decision. Passing the raw
    // source through is what lets the module draw that line.
    expect(SETTINGS).toMatch(/paletteSource: brandKit\.palette_source/)
  })

  it('says out loud that visuals do not change a script', () => {
    expect(SETTINGS).toMatch(/never change what a script says/)
  })
})

describe('nobody is interrupted about a logo again', () => {
  it('only a missing voice can raise the modal', () => {
    // ⚠️ THE EXACT OLD CONDITION. It stopped a fully-answered creator on sign-in
    // for two things that cannot change one word of a script — and the way to
    // make it stop was to invent a palette.
    expect(REMINDER).not.toMatch(/gaps\.colors \|\| gaps\.logo/)
    expect(REMINDER).not.toMatch(/g\.colors \|\| g\.logo/)
    expect(REMINDER).toMatch(/const incomplete = gaps && gaps\.voice/)
    expect(REMINDER).toMatch(/if \(g\.voice && sessionStorage/)
  })

  it('and the copy describes the gap it now has, not the one it used to', () => {
    // ⚖️ A NARROWED TRIGGER WITH THE OLD WORDS IS ITS OWN BUG: a creator told to
    // "finish your brand — we couldn't confirm your colours" would go and set
    // colours, and the banner would still be there.
    expect(REMINDER).not.toMatch(/never invent colours or a logo/)
    expect(REMINDER).toMatch(/hasn’t read your account yet/)
  })
})

describe('the CTA is the creator’s to type, and only theirs', () => {
  it('reads their stored wording rather than deriving one', () => {
    // ⚠️ `cta: null` WAS HARDCODED, which made the item permanently unfillable —
    // an honest gap while no field existed, and a bug the moment one did.
    expect(SETTINGS).toMatch(/cta: defaultCta/)
    expect(SETTINGS).toMatch(/readStoredBrief\(def\?\.pre_script_brief\)\.defaultCta/)
    // ⚠️ THE MAPPING I WAS ASKED NOT TO MAKE. A goal is what the video should
    // achieve; a CTA is the sentence said at the end. Deriving one from the other
    // would satisfy the meter with an answer to a different question.
    expect(SETTINGS).not.toMatch(/cta: dna\.goal|cta: .*goal/)
  })

  it('writes only what a person typed, on blur rather than per keystroke', () => {
    // ⚖️ Every intermediate value of a sentence being typed would otherwise be
    // stored as a confirmed preference.
    expect(SETTINGS).toMatch(/savePreScriptBrief\(defaultVoiceId, \{ defaultCta: next\.trim\(\) \}\)/)
    expect(SETTINGS).toMatch(/onBlur=\{\(e\) => onCtaCommit\(e\.target\.value\)\}/)
  })

  it('distinguishes not-loaded from set-to-nothing', () => {
    // ⚠️ RENDERING "not loaded" AS AN EMPTY BOX would show a blank to somebody
    // who has a CTA — and a save from that box would erase it.
    expect(SETTINGS).toMatch(/disabled=\{cta === null\}/)
  })

  it('says what happens when it is left blank', () => {
    // ⚖️ Twin writing one is not a penalty and should not read as a warning.
    expect(SETTINGS).toMatch(/Twin will\s*\n?\s*write one that fits each video/)
  })
})
