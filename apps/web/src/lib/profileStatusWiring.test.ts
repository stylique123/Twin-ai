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
import { setupAreas, SETUP_STATES } from '@twinai/shared'

const here = dirname(fileURLToPath(import.meta.url))
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
const SETTINGS = strip(readFileSync(join(here, '..', 'pages', 'Settings.tsx'), 'utf8'))
const REMINDER = strip(readFileSync(join(here, '..', 'components', 'BrandReminder.tsx'), 'utf8'))

describe('the meter is fed only creative answers', () => {
  // ⚠️⚠️ THIS ASSERTION IS INVERTED, AND IT IS STRONGER THAT WAY. It used to
  // require `const content = contentProfile({` in Settings and then check that
  // no brand field was threaded into it. The meter it guarded is DELETED — it
  // showed a percentage nobody set over four rows that duplicated the cards
  // above them, twelve cards for six facts on one screen.
  //
  // ⚖️ SO WHAT IS GUARDED NOW IS THE DELETION. If this page computes a content
  // profile again, the second telling is back, and that is the regression worth
  // catching. The old concern — a kit or palette threaded into the meter's
  // input — cannot occur when there is no call; and `ProfileInput` has no such
  // field, which tsc enforces on excess properties (demonstrated on this branch
  // when a stray `productCount` was caught by the typecheck ratchet).
  //
  // ⚖️ `setupAreas` STILL CALLS IT INTERNALLY, which is where the measurement
  // belongs: it decides the voice card's state, on a card a creator can act on.
  it('the page does not compute a second content profile of its own', () => {
    expect(SETTINGS).not.toContain('contentProfile(')
    expect(SETTINGS).not.toContain('content.percent')
    expect(SETTINGS).not.toContain('content.gaps')
  })

  // ⚠️⚠️ THE SUBJECT MOVED AND THE PROPERTY SURVIVED. This asserted that the
  // page computed `kitStatus` and `productDna` and printed "Not set up" — all
  // three belonged to two read-only status lines that duplicated the setup
  // cards beside them, and those lines are deleted. The page no longer computes
  // either status: `setupAreas` derives both itself from the raw answers,
  // product count and kit it is already given.
  //
  // ⚖️ THE PROPERTY IS WHAT MATTERED — these two are reported as STATES, never
  // folded into a score — and it is asserted behaviourally now, which also makes
  // it immune to the next rename.
  it('reports brand kit and product DNA as states, not as score', () => {
    const areas = setupAreas({
      answers: { commercialTies: ['own_product'] }, dnaReady: true, cta: null,
      productCount: 0, brandKit: null,
    })
    const kit = areas.find((a) => a.id === 'brand_kit')
    const products = areas.find((a) => a.id === 'products')
    expect(kit, 'the brand kit stopped being an area').toBeTruthy()
    expect(products, 'products stopped being an area').toBeTruthy()
    // ⚖️ A STATE A CREATOR CAN READ, AND AN ACTION THEY CAN TAKE — which is the
    // whole difference between this and the status lines that were removed.
    expect(SETUP_STATES as readonly string[]).toContain(kit!.state)
    expect(SETUP_STATES as readonly string[]).toContain(products!.state)
    expect(kit!.action).toBeTruthy()
    expect(products!.action).toBeTruthy()
    // ⚠️ AND THE KIT IS NEVER COUNTED. Nothing it holds changes a script, so a
    // score that included it would nag for work that cannot help.
    expect(kit!.counts).toBe(false)
  })

  it('only a manual palette makes the kit ready, on the page as in the module', () => {
    // ⚖️ An auto-extracted palette is a reading, not a decision. Passing the raw
    // source through is what lets the module draw that line.
    expect(SETTINGS).toMatch(/paletteSource: brandKit\.palette_source/)
  })

  // ⚖️ THE CLAIM MOVED WITH THE CARD IT JUSTIFIED. That sentence lived in the
  // deleted panel, and it was the panel's own argument for why logo and colours
  // did not belong on this screen — so the line went when the card did. The
  // claim itself still has to be made somewhere a reader meets it, and it is
  // made in the area's own detail text in shared, which is the one place that
  // survives whichever surface renders it.
  it('says out loud that visuals do not change a script', () => {
    const areas = setupAreas({ answers: null, dnaReady: true, cta: null, productCount: 0, brandKit: null })
    const kit = areas.find((a) => a.id === 'brand_kit')
    expect(kit, 'the brand kit area disappeared entirely').toBeTruthy()
    expect(kit!.detail).toMatch(/does not change what your scripts say/i)
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

  // ⚠️ ONE HOME PER FACT. The hero's "Next step" block and the card grid below
  // it both rendered the same area, so "Content profile · Edit profile →"
  // appeared at the top and "Content profile · Needs setup · Edit profile"
  // again beneath it — the same fact twice, and the second copy carried a
  // status the first did not, so the two did not even agree.
  //
  // ⚖️ ASSERTED AS THE EXACT FILTER WITH THE UNFILTERED MAP ASSERTED ABSENT,
  // because the difference between them is one call and a reader cannot see it.
  // ⚠️⚠️ THIS ASSERTION USED TO PIN THE FILTER'S SOURCE TEXT AND BROKE TWICE IN
  // ONE AFTERNOON — once when a second exclusion was added, once when the chain
  // spanned lines — each time failing without naming the cause. The rule now
  // lives in `panelAreas` in shared and is tested BEHAVIOURALLY there. What is
  // left here is the only part that is genuinely a property of this file: the
  // grid must go through that function rather than filtering inline again.
  it('the card grid delegates its exclusions to panelAreas', () => {
    expect(SETTINGS).toContain('panelAreas(areas, summary.next).map')
    // ⚠️ AND NO INLINE RE-IMPLEMENTATION MAY CREEP BACK. Named precisely: the
    // first version of this assertion banned any `areas.filter(` and caught the
    // PROGRESS-SEGMENT bar, which is a different concern and correctly inline.
    // What must not return is an exclusion decided here instead of in shared.
    expect(SETTINGS).not.toContain('a.id !== summary.next?.id')
    expect(SETTINGS).not.toContain("a.id !== 'brand_kit'")
  })

  // ⚠️⚠️ THE PREFILL EXISTED AND THE CLICK THAT OPENED THE BOX THREW IT AWAY.
  // `ctaDraft` is initialised to `ctaText || ctaSuggestion?.text` — correct —
  // and the Add one / Edit handler then overwrote it with `ctaText`, which is ''
  // for every creator who has never saved an ending. Measured: 0 of 51 voices
  // had a stored ending and 47 had one extracted, so OPENING THE BOX EMPTIED IT
  // for everybody who had something to offer. Her own ending survived only as
  // grey placeholder text, which cannot be saved and is not an answer.
  //
  // ⚖️ ASSERTED AS THE EXACT HANDLER, AND THE OLD ONE ASSERTED ABSENT, because
  // the difference between the two is one token and a reader cannot see it.
  it('opening the box seeds it with her own ending, by whatever route', () => {
    // ⚠️ THIS ASSERTION MOVED WITH THE BEHAVIOUR AND GOT STRONGER FOR IT. It
    // used to pin the seeding to the panel's own button — which meant every
    // OTHER route into the editor (the setup card, the hero's Next step) opened
    // an empty box, because `ctaSuggestion` is null at mount and arrives with
    // `loadVoice`. The seeding is now on the OPEN TRANSITION, so it holds for
    // all of them.
    expect(SETTINGS).toContain("if (ctaOpen) setCtaDraft(ctaText || ctaSuggestion?.text || '')")
    // ⚖️ ON THE OPENING EDGE ONLY, so it cannot overwrite what somebody types.
    expect(SETTINGS).toContain('if (ctaOpen !== wasCtaOpen)')
    // ⚠️ THE ORIGINAL DEFECT: the handler that emptied the box on open. It must
    // not come back, in either spelling.
    expect(SETTINGS).not.toMatch(/setCtaDraft\(ctaText\); setCtaOpen\(true\)/)
    // ⚖️ AND ONE HOME PER FACT: the button opens, it does not also seed.
    expect(SETTINGS).toContain('onClick={() => setCtaOpen(true)}')
    // ⚖️ THE SUGGESTION IS STILL NOT STORED WITHOUT A TAP, and this assertion had
    // to be narrowed to say that properly. It banned `onCtaCommit(ctaSuggestion`
    // ANYWHERE, which also banned the one place it belongs: an explicit
    // "That's mine" button. The property was never "never commit the
    // suggestion" — it is "never commit it without the creator pressing
    // something". A rule stated too broadly forbids its own correct
    // implementation.
    //
    // ⚠️ SO WHAT IS ASSERTED IS THE MOUNT AND OPEN PATHS. Neither the seeding
    // transition nor the initial state may commit anything.
    const openBlock = SETTINGS.slice(
      SETTINGS.indexOf('if (ctaOpen !== wasCtaOpen)'),
      SETTINGS.indexOf('return (', SETTINGS.indexOf('if (ctaOpen !== wasCtaOpen)')))
    expect(openBlock, 'the open-transition block could not be located').not.toBe('')
    expect(openBlock).not.toContain('onCtaCommit')
    // ⚖️ AND THE COMMIT THAT DOES EXIST IS BEHIND A BUTTON OF ITS OWN, so it
    // cannot fire except by a press.
    expect(SETTINGS).toContain('data-testid="cta-accept-suggestion"')
  })

  // ⚠️⚠️ NOTHING EVER STORED A CTA, AND THE WRITER'S WORDING RULE IS DOWNSTREAM
  // OF THAT. Measured on the audited account: `pre_script_brief.defaultCta` is
  // null — the key is not even present — across ten consecutive Product Mode
  // runs, while two CTAs sit extracted on her profile. `generate-blueprint`
  // builds "THE CREATOR'S OWN CALL TO ACTION" from `brief.defaultCta`, so that
  // line never fired once in ten runs. This offer is the only thing on any
  // screen that turns an extracted ending into a stored one.
  describe('her own ending is offered inline, and accepting it is one tap', () => {
    it('the offer is gated on the store having been read', () => {
      // ⚖️ OFFERING BEFORE THE READ IS HOW A READING OVERWRITES AN ANSWER. A
      // failed read keeps its retry rather than offering a suggestion over
      // something we never saw.
      expect(SETTINGS).toContain(
        'const canOfferHerEnding = ctaLoaded && !ctaLoadFailed && ctaText === \'\' && !!ctaSuggestion')
    })

    it('it commits the suggestion’s own text, never the editor draft', () => {
      // ⚠️ `ctaDraft` IS THE EDITOR'S STATE. Committing it from here would save
      // whatever was last typed and abandoned.
      const btn = SETTINGS.slice(SETTINGS.indexOf('data-testid="cta-accept-suggestion"'))
      const head = btn.slice(0, 500)
      expect(head).toContain('onCtaCommit(ctaSuggestion!.text)')
      expect(head).not.toContain('ctaDraft')
    })

    it('the accept button reads before the change button', () => {
      // ⚖️ THE ANSWER IN NINE CASES OUT OF TEN COMES FIRST. Order is the whole
      // affordance: "Change it" first would make accepting look like the
      // secondary path.
      const accept = SETTINGS.indexOf('data-testid="cta-accept-suggestion"')
      const change = SETTINGS.indexOf("canOfferHerEnding ? 'Change it'")
      expect(accept).toBeGreaterThan(-1)
      expect(change).toBeGreaterThan(-1)
      expect(accept).toBeLessThan(change)
    })

    it('the line shown says where it came from', () => {
      // ⚠️ UNATTRIBUTED, A SUGGESTION READS AS SOMETHING SHE ALREADY AGREED TO.
      expect(SETTINGS).toContain('— from your own posts')
    })
  })

  // ⚠️⚠️ AND EVERY ROUTE TO THE EDITOR MUST ACTUALLY REACH IT. `edit_cta` was
  // `setTab('twin')` — dispatched from a card that only ever renders ON the twin
  // tab, and from the hero's Next step button, so both did nothing at all.
  // `view_dna` had this exact bug and its comment still describes it: "Not a
  // broken handler — a no-op, which reads to a creator as 'Twin has nothing to
  // show me'." It was fixed there by lifting the state to the page. This is the
  // same fix.
  it('the edit_cta action opens the editor rather than switching to the tab it is on', () => {
    expect(SETTINGS).toContain("case 'edit_cta': { setTab('twin'); return setCtaOpen(true) }")
    expect(SETTINGS).not.toContain("case 'edit_cta': return setTab('twin')")
    // The state is owned by the page, so the action can reach it.
    expect(SETTINGS).toMatch(/const \[ctaOpen, setCtaOpen\] = useState\(false\)/)
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

describe('a field that says "loading" forever is not loading', () => {
  // ⚠️ REPORTED AS "THE CTA FIELD DOESN'T ACCEPT INPUT". The <input> was always
  // fine. `defaultCta === null` meant BOTH "still in flight" and "the read
  // failed" — the catch never touched it — so a failed voice-list read left the
  // row saying "Loading your usual ending…" beside a button disabled forever.
  // The door never unlocked, and the page said something false while it stayed
  // shut. Unknown is not a default in either direction.

  it('a failed load is marked as failed, not left looking like loading', () => {
    expect(SETTINGS).toMatch(/setCtaLoadFailed\(true\)/)
    // …and in the SAME catch that already surfaces the voice error, so the two
    // cannot drift into disagreeing about whether the read worked.
    expect(SETTINGS).toMatch(/setVoiceErr\(true\); setCtaLoadFailed\(true\)/)
  })

  it('a retry clears the failure before it starts', () => {
    // Otherwise the second attempt renders as failed while it is in flight.
    expect(SETTINGS).toMatch(/setVoiceErr\(false\); setVoiceLoading\(true\); setCtaLoadFailed\(false\)/)
  })

  it('the failed row does NOT claim to be loading', () => {
    const at = SETTINGS.indexOf('ctaLoadFailed')
    expect(at).toBeGreaterThan(-1)
    expect(SETTINGS).toMatch(/could not load your usual ending/)
    // The loading copy must sit BEHIND the failure branch, not before it.
    const failIdx = SETTINGS.indexOf('could not load your usual ending')
    const loadIdx = SETTINGS.indexOf('Loading your usual ending')
    expect(failIdx).toBeGreaterThan(-1)
    expect(loadIdx).toBeGreaterThan(-1)
    expect(failIdx).toBeLessThan(loadIdx)
  })

  it('the creator gets a retry, not a greyed rectangle', () => {
    expect(SETTINGS).toMatch(/onClick=\{onCtaRetry\}/)
    expect(SETTINGS).toMatch(/>Try again</)
  })

  it('editing stays closed while the stored answer is unread', () => {
    // ⚖️ THE FIX IS NOT "LET THEM TYPE ANYWAY". Saving from a failed read would
    // overwrite an answer nobody managed to read — a worse bug than the dead
    // button, and a silent one.
    expect(SETTINGS).toMatch(/disabled=\{cta === null\}/)
    expect(SETTINGS).not.toMatch(/setDefaultCta\(''\)[^\n]*catch/)
  })
})
