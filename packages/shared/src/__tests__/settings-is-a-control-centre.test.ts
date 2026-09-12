// THE PAGE MUST RENDER THE MODEL, NOT RE-DECIDE IT.
//
// ⚠️ THE FAILURE THIS GUARDS IS QUIET. A component that computes its own idea of
// "ready" passes every unit test in `setupAreas` while showing something else on
// screen — and the next screen computes a third answer. The shared module is the
// only place a status is decided; these assertions keep the page honest about
// reading it.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'apps', 'web', 'src')
const PAGE = readFileSync(join(WEB, 'pages', 'Settings.tsx'), 'utf8')
const PRODUCTS = readFileSync(join(WEB, 'pages', 'ProductLibrary.tsx'), 'utf8')

describe('the status comes from the shared model', () => {
  it('reads setupAreas and setupSummary rather than deriving its own', () => {
    expect(PAGE).toMatch(/setupAreas\(\{/)
    expect(PAGE).toMatch(/setupSummary\(areas\)/)
  })

  it('the next step is the model\'s, not the first card that looks unfinished', () => {
    expect(PAGE).toMatch(/summary\.next/)
  })

  it('the progress segments count only what the model counts', () => {
    // ⚖️ BRAND KIT MUST NOT APPEAR IN THE BAR. Rendering every area would put it
    // back into the completion story that the whole separation exists to keep it
    // out of — visually, where nobody would think to check.
    expect(PAGE).toMatch(/areas\.filter\(\(a\) => a\.counts && a\.state !== 'not_needed'\)/)
  })
})

describe('every card actually goes somewhere', () => {
  it('the whole card is the control, not a decorative panel', () => {
    // ⚠️ THE ORIGINAL COMPLAINT. Panels that looked clickable and did nothing
    // are worse than a plain list: they cost somebody an attempt to find out.
    // ⚠️ THE LOCATOR IS ASSERTED FOUND BEFORE IT IS USED, because it silently
    // wasn't. This test pinned the grid with `indexOf('{areas.map((a) => (')`;
    // when the grid gained a `.filter` — so the hero's next step is not drawn
    // twice — `indexOf` returned -1, `slice(-1)` returned "\n", and the
    // assertion compared a newline against the pattern. It failed for the right
    // reason with a message that named neither the cause nor the file. A
    // locator that can miss must say it missed.
    // ⚖️ AND IT IS LOCATED BY WHAT MAKES IT THE CARD GRID, not by its current
    // spelling. There are several `{areas … .map(` blocks on this page — the
    // progress segments are one — so the right one is the block whose card
    // actually navigates. Pinning a literal is what broke; pinning the intent
    // survives the next refactor.
    const blocks = [...PAGE.matchAll(/\{(?:areas|panelAreas\()[\s\S]{0,400}?\.map\(\(a\) => \(/g)]
    const grid = blocks.map((m) => PAGE.slice(m.index ?? 0, (m.index ?? 0) + 1200))
      .find((b) => /goTo\(a\)/.test(b)) ?? ''
    expect(grid, 'the card grid could not be located in Settings.tsx').not.toBe('')
    expect(grid).toMatch(/onClick=\{\(\) => goTo\(a\)\}/)
    expect(grid).toMatch(/hover:/)
  })

  it('the destination map is total, so a new action cannot be forgotten', () => {
    // ⚖️ A `switch` OVER THE UNION WITH NO DEFAULT. Adding an action without a
    // destination becomes a compile error rather than a dead button.
    // ⚠️ POINTED AT `goToAction`, WHERE THE SWITCH ACTUALLY LIVES NOW. `goTo`
    // became a one-line delegate when the completion gaps started dispatching
    // actions too, and this slice still passed — but only because it ran PAST
    // the delegate into the switch below it. A test that passes by accident of
    // adjacency is one edit away from passing by accident of nothing.
    const go = PAGE.slice(PAGE.indexOf('const goToAction = (action: SetupAction)'))
    expect(go, 'the destination switch could not be located').not.toBe('')
    const body = go.slice(0, go.indexOf('\n  }'))
    for (const a of ['add_product', 'manage_products', 'setup_brand_kit', 'view_dna', 'edit_profile', 'edit_cta']) {
      expect(body, a).toContain(`case '${a}'`)
    }
    expect(body).not.toMatch(/default:/)
  })

  it('"add a product" lands in the add flow, not on a list', () => {
    // ⚠️ A DEEP LINK WITH NO READER IS THE SAME DEAD AFFORDANCE, one screen
    // later, where it is harder to notice.
    expect(PAGE).toMatch(/nav\('\/products\?add=1'\)/)
    expect(PRODUCTS).toMatch(/params\.get\('add'\) === '1'/)
  })
})

describe('the page has a shape', () => {
  it('separates what Twin knows from what it costs', () => {
    // ⚖️ PLAN AND ADD-ONS OUT OF THE MIDDLE OF PROFILE INTELLIGENCE. Scrolling
    // from voice into credit packs into branding is not an information
    // architecture.
    expect(PAGE).toMatch(/'plan', 'Plan'/)
    expect(PAGE).toMatch(/tab === 'plan' && \(/)
    expect(PAGE).toMatch(/tab === 'brand' && \(/)
    expect(PAGE).toMatch(/tab === 'account' && \(/)
  })

  it('the tab labels are plain English', () => {
    // ⚠️ "Brand Kit" IS OUR WORD FOR IT. "Logo & colours" is what it is.
    expect(PAGE).toMatch(/'brand', 'Logo & colours'/)
    expect(PAGE).not.toMatch(/'Twin Profile'|'Creator DNA Settings'/)
  })

  it('and the column is wide enough for two columns of cards', () => {
    expect(PAGE).toMatch(/max-w-5xl/)
    expect(PAGE).toMatch(/sm:grid-cols-2/)
  })
})

describe('editing is deliberate, and the record is folded', () => {
  it('the CTA is a summary with an edit, not a naked input on the page', () => {
    // ⚠️ A PERMANENTLY EDITABLE FIELD IS NOT A SETTING. It is something to
    // notice, decide about, and then wonder whether it saved.
    expect(PAGE).toMatch(/setCtaOpen\(true\)/)
    expect(PAGE).toMatch(/role="dialog"/)
  })

  it('and "I have no usual ending" is storable as an answer', () => {
    // ⚖️ CLEARING A BOX AND LEAVING IS AMBIGUOUS; THIS IS NOT. Plenty of
    // creators do not want every video to end with an ask.
    expect(PAGE).toMatch(/I don't have a usual ending/)
    expect(PAGE).toMatch(/No usual ending — Twin writes one to fit each video/)
  })

  it('the full DNA record is folded behind a summary', () => {
    // ⚠️ IT OCCUPIED HALF A KILOMETRE OF SETTINGS. Every visit meant scrolling
    // past niche, audience, vocabulary, POV, hooks and pacing to reach anything
    // else — most of why the page read as a document.
    expect(PAGE).toMatch(/const \[dnaOpen, setDnaOpen\] = useState\(false\)/)
    // ⚖️ ASSERTS THE FOLD, NOT THE BUTTON'S WORDING. The label was "View
    // everything" while the block held a read view of its own; it now reads
    // "What Twin learned" because the read view moved to the learned panel and
    // the block became the edit form. The record is still folded behind one
    // deliberate control, which is what this test is for — pinning the label
    // made it fail on a change that strengthened the thing it guards.
    // ⚠️ THE CONTROL CHANGED AGAIN, AND THIS TEST HAD ALREADY LEARNED THAT
    // LESSON ONCE — see the note above about pinning the label. It pinned the
    // teaser's testid next, and the teaser is now deleted: it duplicated the
    // "Your voice" setup card, same label and same destination. The record is
    // still folded behind one deliberate control; that control is now the card,
    // routed through `view_dna` in the destination switch.
    expect(PAGE).toMatch(/case 'view_dna':/)
    expect(PAGE).toMatch(/setDnaOpen\(true\)/)
    // ⚖️ AND IT IS STILL FOLDED, WHICH IS THE WHOLE POINT: the form starts
    // closed, so nobody scrolls the record to reach anything else.
    expect(PAGE).toMatch(/const \[dnaOpen, setDnaOpen\] = useState\(false\)/)
  })

  it('folding is not hiding — the same record is one tap away', () => {
    expect(PAGE).toMatch(/Back to the summary/)
  })
})

describe('the brand tab is honest about what it changes', () => {
  it('offers every palette slot that something downstream reads', () => {
    // ⚠️ `highlight` HAD TWO READERS AND NO WRITER. `brandSnapshot` and the
    // blueprint's `paletteHex` both consume it, and Settings offered no way to
    // set it — the asked-and-discarded defect, running in reverse.
    expect(PAGE).toMatch(/\['highlight', 'Highlight'\]/)
  })

  it('does not claim to change what scripts say', () => {
    // ⚖️ OVERSTATING WHAT A SETTING DOES IS HOW SOMEBODY CONCLUDES THE WHOLE
    // PAGE IS DECORATIVE. The palette steers packaging, thumbnails and supported
    // visual styling; it changes no word of a script.
    expect(PAGE).toMatch(/they do not change what your scripts say/)
    expect(PAGE).not.toMatch(/used across your blueprints and videos/)
  })

  it('and never renders a colour the creator did not choose', () => {
    // ⚠️ AN UNSET COLOUR ONCE SHOWED A FABRICATED TEAL, which reads as "a colour
    // I do not have". Unset renders an empty chip instead.
    expect(PAGE).toMatch(/border-dashed/)
  })
})

describe('editing the profile happens here, not somewhere else', () => {
  it('opens a drawer rather than navigating to onboarding', () => {
    // ⚠️ CHANGING ONE ANSWER MEANT RE-WALKING A FLOW FINISHED WEEKS AGO. So
    // nobody changed anything, and the profile silently aged.
    expect(PAGE).toMatch(/case 'edit_profile': return setProfileOpen\(true\)/)
    expect(PAGE).not.toMatch(/case 'edit_profile': return nav\('\/onboarding'\)/)
  })

  // ⚠️ THE 4000-CHARACTER WINDOW WAS A PROXY FOR "IN THE DRAWER" AND IT BROKE ON
  // 2026-09-12 — not because either answer left the drawer, but because the
  // block gained a comment. A byte offset is not a structure, and a guard that
  // fails when prose grows is measuring the wrong thing. Bounded by the drawer's
  // actual end instead, which is what the claim was always about.
  it('offers the two answers the pipeline actually branches on', () => {
    // ⚖️ NOT THE WHOLE QUESTIONNAIRE. What they know decides how much a script
    // explains; the commercial tie decides what it may claim. Reprinting the
    // rest would rebuild the wall of forms this page was rescued from.
    const start = PAGE.indexOf('{profileOpen && (')
    expect(start, 'the profile drawer was renamed').toBeGreaterThan(-1)
    const d = PAGE.slice(start, PAGE.indexOf('Go through all the questions again', start))
    expect(d.length, 'the drawer bound was not found').toBeGreaterThan(500)
    expect(d).toMatch(/audienceKnowledge:/)
    expect(d).toMatch(/commercialTies:/)
  })

  // ⚠️ THIS CASE WAS STALE ON 2026-09-12, AND ITS CLAIM IS NOW STRUCTURAL RATHER
  // THAN CONDITIONAL. It asserted the hand-written exclusivity logic that kept
  // "nothing commercial" from being held beside a real tie — six chips, any
  // number selectable, so the contradiction had to be prevented in code.
  //
  // ⚖️ THE SIX CHIPS COLLAPSED TO TWO MUTUALLY EXCLUSIVE ANSWERS, so the
  // contradiction is now unrepresentable rather than prevented: each write
  // REPLACES the list via `SELLS_ANSWER_TO_TIES`, it never appends. Asserting
  // the old `filter` would demand code whose reason for existing is gone.
  //
  // ⚠️ SO IT ASSERTS THE PROPERTY THAT SURVIVED: a write can never accumulate.
  // A mutant that appends instead of replacing brings the contradiction back and
  // fails here.
  // ⚠️ AND THE FIRST VERSION OF THIS CONTROL DID NOT WORK — A MUTANT THAT
  // ACCUMULATED PASSED IT. It forbade `...ties` and `ties.filter`, which are the
  // OLD code's variable names; the collapsed write reads the current value as
  // `profileAnswers?.commercialTies`, so an appending mutant matched neither
  // pattern. A negative control written against the shape of the code it
  // replaced tests nothing.
  //
  // ⚖️ SO IT ASSERTS THE STRUCTURE INSTEAD OF NAMING FORBIDDEN SPELLINGS: the
  // write takes EXACTLY ONE spread, and that spread is the shared map. Any way
  // of folding the existing list back in — under any variable name, present or
  // future — adds a second one and fails.
  it('a commercial answer replaces the previous one, never accumulates', () => {
    const drawer = PAGE.slice(PAGE.indexOf('{profileOpen && ('))
    const at = drawer.indexOf('commercialTies:')
    expect(at, 'the commercial write was renamed').toBeGreaterThan(-1)
    // The write expression is one line — `commercialTies: <expr>,` — so the line
    // IS the bound. No brace matching, nothing to get subtly wrong.
    const write = drawer.slice(at, drawer.indexOf('\n', at))
    expect(write.length, 'the write expression was not bounded').toBeGreaterThan(10)

    expect(write).toMatch(/SELLS_ANSWER_TO_TIES\[/)
    const spreads = write.match(/\.\.\./g) ?? []
    expect(spreads.length, `expected one spread, found ${spreads.length} in: ${write}`).toBe(1)
  })

  it('and the full questionnaire is still reachable for anyone who wants it', () => {
    // ⚖️ FOLDING IS NOT REMOVING, here as with the DNA record.
    expect(PAGE).toMatch(/Go through all the questions again/)
  })
})

describe('the five states reach the screen as five different things', () => {
  it('each has its own words', () => {
    const chip = PAGE.slice(PAGE.indexOf('function StateChip'))
    const body = chip.slice(0, chip.indexOf('\n}'))
    for (const label of ['Ready', 'Needs setup', 'Worth a look', 'Optional', 'Not needed']) {
      expect(body, label).toContain(label)
    }
  })

  it('and none of them leaks the internal name', () => {
    const chip = PAGE.slice(PAGE.indexOf('function StateChip'))
    const body = chip.slice(0, chip.indexOf('\n}'))
    expect(body).not.toMatch(/>needs_setup<|>not_needed<|>needs_review</)
  })
})
