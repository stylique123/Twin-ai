#!/usr/bin/env node
// THE THING THAT ACTUALLY USES THE PRODUCT, ON A SCHEDULE.
//
// ⚠️ EVERY GUARD WE HAD ASKED A QUESTION ABOUT THE CODE. None asked whether
// the product still works. `generate-blueprint` could not boot for two days;
// the deploy said SUCCESS, CI was green throughout, and a person found it.
//
// ⚖️ TWO VARIANTS EVERY HOUR, AND THE SECOND IS NOT DECORATION.
//   reference  a generation from a FIXED FILE ON OUR OWN STORAGE
//   idea       a generation from a FIXED SENTENCE, no reference at all
// The idea variant is what would have caught this outage on the path that has
// no reference to blame. It shares the run's setup, so it costs one more call.
//
// ⚠️ THE REFERENCE IS OUR OWN FILE, NOT A TIKTOK URL, AND THAT IS DELIBERATE.
// A public URL can be deleted, geo-blocked or rate-limited, and then the
// heartbeat alerts on somebody else's platform. Paging yourself at 3am about
// TikTok's availability is how you learn to ignore the pager.

import {
  decideHeartbeat, runIsBad, INITIAL_PAGE_STATE, PAGE_IF_SLOWER_THAN_MS,
  wrongVoiceFinding, sponsoredSpokenAsLivedFinding, lengthBandFinding,
} from '../../packages/shared/src/ops/heartbeatPolicy.ts'

const SELFTEST = process.argv.includes('--selftest')
const DRY_RUN = process.argv.includes('--dry-run')

// The frozen store. Set up once, never edited — see 0190's header for why.
export const FROZEN_STORE = {
  voiceId: process.env.HEARTBEAT_VOICE_ID ?? 'twin-heartbeat-voice',
  ownedProductName: 'Ledger Notebook',
  sponsoredNeverUsedProductName: 'Northwind Serum',
  lengthBand: { min: 90, max: 160 },
}

export const IDEA_SENTENCE =
  'Why I stopped keeping three notebooks and went back to one.'

/** Findings the frozen store makes decidable, gathered in one place so the
 *  runner cannot check some and forget others. */
export function inspect(script, producedVoiceId) {
  return [
    wrongVoiceFinding(FROZEN_STORE, producedVoiceId),
    sponsoredSpokenAsLivedFinding(FROZEN_STORE, script),
    lengthBandFinding(FROZEN_STORE, script),
  ].filter(Boolean)
}

// ── The self-test: the policy, exercised THROUGH this runner ───────────────
//
// ⚖️ A POLICY UNIT-TESTED IN ISOLATION AND CALLED BY NOBODY IS THE DEFECT THIS
// REPOSITORY KEEPS PAYING FOR. This runs the same decisions the scheduled job
// will, with no network and no database, so the wiring is checked and not
// merely the arithmetic.
if (SELFTEST) {
  let fail = 0
  const check = (name, ok, detail = '') => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`)
    if (!ok) fail++
  }

  const dead = (at) => ({ at, mode: 'reference', failed: 'non-2xx from generate-blueprint', durationMs: null })
  const good = (at) => ({ at, mode: 'idea', failed: null, durationMs: 42_000 })

  let state = INITIAL_PAGE_STATE
  const pages = []
  for (let i = 0; i < 24; i++) {
    const d = decideHeartbeat(state, dead(i * 30 * 60_000))
    state = d.nextState
    if (d.page) pages.push({ at: i * 30, page: d.page })
  }
  // 24 runs over 12 hours: one page at the break, then one an hour.
  check('one page on the break, then hourly — never once per run',
    pages[0].page === 'started_failing' && pages.length === 12,
    `pages=${pages.length} first=${pages[0]?.page}`)

  const back = decideHeartbeat(state, good(99 * 60 * 60_000))
  check('recovery pages', back.page === 'recovered', String(back.page))
  check('and then goes quiet', decideHeartbeat(back.nextState, good(100 * 60 * 60_000)).page === null)

  check('a slow run pages even though a script arrived',
    runIsBad({ at: 0, mode: 'reference', failed: null, durationMs: PAGE_IF_SLOWER_THAN_MS + 1 }))
  check('an unmeasured duration does not read as fast',
    decideHeartbeat(INITIAL_PAGE_STATE, { at: 0, mode: 'idea', failed: null, durationMs: null })
      .digest.some((f) => f.kind === 'duration_not_measured'))

  // The frozen store's checks, through `inspect` — the function the scheduled
  // run calls, not the individual checkers.
  const wrong = inspect('word '.repeat(120), 'someone-else')
  check('a script from another voice is caught', wrong.some((f) => f.kind === 'wrong_voice'),
    JSON.stringify(wrong))
  const lived = inspect(`I have used ${FROZEN_STORE.sponsoredNeverUsedProductName} for months. ${'w '.repeat(110)}`, FROZEN_STORE.voiceId)
  check('testifying to the sponsored product is caught',
    lived.some((f) => f.kind === 'sponsored_product_spoken_as_lived'), JSON.stringify(lived))
  const clean = inspect('word '.repeat(120), FROZEN_STORE.voiceId)
  check('a healthy script produces no findings', clean.length === 0, JSON.stringify(clean))

  console.log(fail === 0 ? '\nheartbeat selftest: OK' : `\nheartbeat selftest: ${fail} FAILED`)
  process.exit(fail === 0 ? 0 : 1)
}

if (DRY_RUN) {
  console.log('heartbeat dry run — configuration only, no calls made')
  console.log(`  voice          ${FROZEN_STORE.voiceId}`)
  console.log(`  reference      ${process.env.HEARTBEAT_REFERENCE_URL ?? '(unset — set HEARTBEAT_REFERENCE_URL)'}`)
  console.log(`  idea sentence  ${IDEA_SENTENCE}`)
  console.log(`  pages if slower than  ${PAGE_IF_SLOWER_THAN_MS / 1000}s`)
  process.exit(0)
}

console.error('heartbeat: live mode needs HEARTBEAT_REFERENCE_URL and the service context.')
console.error('Run with --selftest to exercise the policy, or --dry-run to print the configuration.')
process.exit(2)
