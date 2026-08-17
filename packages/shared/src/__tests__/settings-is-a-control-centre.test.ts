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
    const grid = PAGE.slice(PAGE.indexOf('{areas.map((a) => ('))
    expect(grid.slice(0, 1200)).toMatch(/onClick=\{\(\) => goTo\(a\)\}/)
    expect(grid.slice(0, 1200)).toMatch(/hover:/)
  })

  it('the destination map is total, so a new action cannot be forgotten', () => {
    // ⚖️ A `switch` OVER THE UNION WITH NO DEFAULT. Adding an action without a
    // destination becomes a compile error rather than a dead button.
    const go = PAGE.slice(PAGE.indexOf('const goTo = (a: SetupArea)'))
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
    expect(PAGE).toMatch(/View everything/)
  })

  it('folding is not hiding — the same record is one tap away', () => {
    expect(PAGE).toMatch(/Back to the summary/)
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
