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

  it('writes only what a person typed, and only when they say so', () => {
    // ⚖️ EVERY INTERMEDIATE VALUE OF A SENTENCE BEING TYPED would otherwise be
    // stored as a confirmed preference.
    //
    // ⚠️ THIS ASSERTION WAS REWRITTEN, NOT RELAXED. It used to pin an `onBlur`
    // commit on a naked input; the screen now edits in a dialog with an explicit
    // Save, which is a STRONGER version of the same property — so the test
    // follows the property rather than the markup it was first written against.
    expect(SETTINGS).toMatch(/savePreScriptBrief\(defaultVoiceId, \{ defaultCta: next\.trim\(\) \}\)/)
    // The box edits a DRAFT; nothing commits from a keystroke.
    expect(SETTINGS).toMatch(/onChange=\{\(e\) => setCtaDraft\(e\.target\.value\)\}/)
    expect(SETTINGS).not.toMatch(/onChange=\{[^}]*onCtaCommit/)
    // And an explicit "I have no usual ending" is storable, which a cleared box
    // and a walk away is not.
    expect(SETTINGS).toMatch(/onCtaCommit\(''\)/)
  })

  it('distinguishes not-loaded from set-to-nothing', () => {
    // ⚠️ RENDERING "not loaded" AS "no usual ending" TELLS A CREATOR WHO HAS ONE
    // THAT THEY DO NOT, and offers to "Add one" over the top of their answer.
    // `(cta ?? '').trim()` did exactly that until this test caught it.
    expect(SETTINGS).toMatch(/const ctaLoaded = cta !== null/)
    expect(SETTINGS).toMatch(/disabled=\{cta === null\}/)
    expect(SETTINGS).toMatch(/!ctaLoaded\s*\n?\s*\? 'Loading your usual ending/)
  })

  // ⚠️ THE SAVE THAT NEVER HAPPENED AND NEVER SAID SO. `saveCta` opened with
  // `if (!defaultVoiceId) return` — a bare early return. The Save button sets the
  // sentence locally BEFORE committing, so the card showed her CTA, the dialog
  // closed, and no write was attempted. Identical in shape to the intake bug:
  // the answer was accepted, discarded, and reported as stored.
  it('never discards a typed CTA in silence', () => {
    // ⚖️ ANCHORED ON THE FUNCTION, NOT THE FILE. A `return` guarded by an error
    // anywhere else in Settings must not satisfy this, and a future early exit
    // added to THIS function must not slip past it.
    const at = SETTINGS.indexOf('const saveCta')
    expect(at).toBeGreaterThan(-1)
    const end = SETTINGS.indexOf('const saveKit', at)
    expect(end).toBeGreaterThan(at)
    const body = SETTINGS.slice(at, end)

    // No exit from this function may be silent.
    expect(body).not.toMatch(/if \(!defaultVoiceId\) return/)

    // ⚠️ THE FIRST VERSION OF THIS ASSERTION LET A MUTANT THROUGH. It asked
    // whether `setCtaErr('` appeared ANYWHERE before each return, which the
    // first guarded return already satisfies for every return after it — so a
    // newly added silent `if (...) return` passed. Adding one is exactly the
    // regression this test exists for, so it checks each return against the
    // line immediately before it instead of against the whole preceding body.
    const lines = body.split('\n')
    const returns = lines
      .map((l, i) => ({ l: l.trim(), i }))
      .filter(({ l }) => /^return\b/.test(l) || /\breturn$/.test(l))
    expect(returns.length, 'saveCta should still have its guarded exit').toBeGreaterThan(0)
    for (const { i } of returns) {
      let j = i - 1
      while (j >= 0 && (lines[j].trim() === '' || lines[j].trim().startsWith('//'))) j--
      expect(
        lines[j] ?? '',
        `the exit on line ${i} of saveCta must be preceded by the reason it gives the creator`,
      ).toMatch(/setCtaErr\('/)
    }
  })

  it('tells the two failures apart', () => {
    // ⚖️ "Try again" IS WRONG ADVICE FOR A SAVE THAT CANNOT BE ATTEMPTED, and a
    // boolean cannot carry two sentences — so the state holds the reason.
    expect(SETTINGS).toMatch(/const \[ctaErr, setCtaErr\] = useState<string \| null>\(null\)/)
    expect(SETTINGS).toMatch(/ctaErr: string \| null/)
    // The message is rendered, not restated in the markup.
    expect(SETTINGS).toMatch(/\{ctaErr !== null && <p[^>]*>\{ctaErr\}<\/p>\}/)
    // ⚠️ `{ctaErr && ...}` WOULD RENDER AN EMPTY STRING AS NOTHING and, worse,
    // print a bare `0`-style falsy leak for any non-null empty reason.
    expect(SETTINGS).not.toMatch(/\{ctaErr && </)
  })

  it('says what happens when it is left blank', () => {
    // ⚖️ Twin writing one is not a penalty and should not read as a warning.
    expect(SETTINGS).toMatch(/Twin writes one to fit each video/)
  })
})
