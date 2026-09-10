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
import { dirname, join } from 'node:path'
import { setupAreas, setupSummary, type SetupInput } from '../setupAreas'

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

describe('what Twin has learned appears beside what is missing', () => {
  it('Settings renders the strength card', () => {
    // ⚠️ IT ALWAYS EXISTED — on the Dashboard. It was never on the screen that
    // showed the fraction, so the one number a creator saw here had a ceiling
    // and no evidence behind it.
    expect(SETTINGS).toContain("import { TwinStrengthCard }")
    expect(SETTINGS).toMatch(/<TwinStrengthCard voiceId=\{defaultVoiceId\} \/>/)
  })
})
