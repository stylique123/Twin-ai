// "2 of 4 ready" ON A PROFILE THE CREATOR HAD COMPLETELY FILLED IN.
//
// ⚠️ THE COUNT WAS ACCURATE, AND THAT IS THE INTERESTING PART. It was reported
// as reading a stale completion flag. It does not: every state in `setupAreas`
// is derived from the values at render time. It said `needs_setup` because
// `hasConfirmedCta` requires a sentence a PERSON typed and — measured
// 2026-09-09 — 0 of 51 voices had one, while 47 had their real endings extracted
// one field away. Nothing had ever offered her a CTA to confirm. #787 closed
// that half; this closes the other.
//
// ⚖️ A FRACTION IS THE WRONG SHAPE REGARDLESS. A denominator promises an end,
// and the day a fifth area is added every creator who reached "4 of 4" is
// silently demoted. What Twin has LEARNED is counted by `strengthSentence`
// instead, which grows without a ceiling because knowledge does.
//
// ⚠️ AND NO TEST HELD THE OLD LINE. The most-complained-about sentence on the
// screen had no coverage at all, which is why it survived being reported.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { setupAreas, setupSummary, type SetupInput } from '../setupAreas'

// ⚖️ ANCHORED TO THIS FILE, NOT TO process.cwd(). CI runs each workspace with
// cwd = that workspace, so a repo-root-relative path built from cwd doubles
// into apps/web/apps/web/... and the file fails to COLLECT -- every test in it
// still reports as passing, which is how it hides. This is the pattern the
// long-standing tests in this repo already use.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')


// ⚠️ THE FIXTURE IS TYPED, NOT CAST, AND MY FIRST DRAFT WAS WRONG IN THE WAY
// THIS WHOLE SESSION KEEPS FINDING. It set `goal: 'sell'` and `promotes:
// 'own_product'`; `satisfied()` reads `contentGoals` for the goal item and
// `contentGoals && workKind` for promotes, so the fixture looked complete and
// was not. A cast would have hidden it — the compiler cannot check a field name
// that is merely absent.
const ANSWERED = {
  contentGoals: ['sell'],
  // ⚠️ AN ENUM MEMBER, NOT PROSE. The first draft read 'everyday people' and
  // vitest passed — `check_test_typecheck_ratchet` failed the build, because a
  // test that does not compile is a broken build rather than a passing suite.
  audience: 'consumers',
  workKind: 'creator',
  desiredFormats: ['talking_head'],
  commercialTies: ['none'],
} as const

/** Everything answered except the ending — the reported state, exactly. */
const ALMOST: SetupInput = {
  answers: ANSWERED,
  dnaReady: true,
  dnaConfirmed: true,
  cta: null,
  conflicts: [],
  productCount: 1,
  brandKit: null,
}

const summaryFor = (input: SetupInput) => setupSummary(setupAreas(input))

describe('the headline never states a fraction', () => {
  it('names the next thing instead of counting', () => {
    const s = summaryFor(ALMOST)
    // ⚠️⚠️ THE LOAD-BEARING ASSERTION. "2 of 4 ready" and every relative of it.
    expect(s.headline).not.toMatch(/\d+\s+of\s+\d+/)
    expect(s.headline).toMatch(/^Next: /)
  })

  it('and the underlying counts are still available to whoever wants them', () => {
    // ⚖️ THE NUMBERS ARE NOT DELETED, ONLY THE SENTENCE. The per-area rows below
    // the headline are what make the screen actionable, and they read these.
    const s = summaryFor(ALMOST)
    expect(s.total).toBeGreaterThan(0)
    expect(s.ready).toBeLessThan(s.total)
    expect(s.next).not.toBeNull()
  })

  it('still gets out of the way when everything is done', () => {
    const done = summaryFor({ ...ALMOST, cta: 'Use my code VICKIE and get 10% off' })
    expect(done.headline).not.toMatch(/\d+\s+of\s+\d+/)
    expect(done.headline).toMatch(/Twin has what it needs/)
  })
})

describe('the CTA is why it said needs_setup, and that was true', () => {
  it('an unconfirmed CTA is not ready', () => {
    // ⚖️ THE CHECK IS NOT LOOSENED HERE. `hasConfirmedCta` must keep requiring a
    // person's sentence — the palette meter is the precedent for what happens
    // when a meter ticks off something Twin wrote for itself.
    const cta = setupAreas(ALMOST).find((a) => a.action === 'edit_cta')!
    expect(cta.state).toBe('needs_setup')
  })

  it('and confirming one moves it, without any other change', () => {
    const cta = setupAreas({ ...ALMOST, cta: 'Tag that friend' })
      .find((a) => a.action === 'edit_cta')!
    expect(cta.state).toBe('ready')
  })
})

// ── AND THE GROWING COUNT IS ON THE SCREEN THAT SHOWED THE FRACTION ───────
const SETTINGS = readFileSync(join(
  dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
  'apps', 'web', 'src', 'pages', 'Settings.tsx'), 'utf8')

describe('what Twin has learned has exactly ONE home', () => {
  // ⚠⚠ THIS ASSERTED THE OPPOSITE, AND IT WAS RIGHT AT THE TIME. The card was
  // put beside the fraction because that number "had a ceiling and no evidence
  // behind it" — a real gap. But it then appeared TWICE, here and on the
  // Dashboard, and one fact with two homes is a fact a creator reads twice and
  // can act on once.
  //
  // ⚖️ THE DASHBOARD KEEPS IT BECAUSE OF WHEN SHE IS THERE: before she starts,
  // which is the moment "two or three more stories and it stops sounding
  // generic" can change what she does next. By Settings she has already come
  // looking. The reversal is deliberate, and the cost — the fraction losing its
  // evidence — is carried by the per-area states below it, including
  // "N to confirm".
  //
  // ⚠️ AND "ONE HOME" IS THE STRONGER CLAIM. The old test passed while the
  // count was on two screens; this one fails in both directions.
  it('Settings does not render it', () => {
    expect(SETTINGS).not.toContain('import { TwinStrengthCard }')
    expect(SETTINGS).not.toMatch(/<TwinStrengthCard/)
  })

  it('and the Dashboard does', () => {
    const dashboard = readFileSync(
      resolve(REPO, 'apps/web/src/pages/Dashboard.tsx'), 'utf8')
    expect(dashboard).toMatch(/<TwinStrengthCard/)
  })
})
