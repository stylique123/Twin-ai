import { describe, it, expect } from 'vitest'
import {
  decideHeartbeat, runIsBad, INITIAL_PAGE_STATE, PAGE_IF_SLOWER_THAN_MS, REMINDER_INTERVAL_MS,
  wrongVoiceFinding, sponsoredSpokenAsLivedFinding, lengthBandFinding,
  type HeartbeatRun, type PageState, type FrozenStore,
} from '../ops/heartbeatPolicy'
import { FIRST_PERSON_MARKER } from '../script/witnessScore'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HOUR = 60 * 60 * 1000
const ok = (at: number, durationMs = 40_000): HeartbeatRun =>
  ({ at, mode: 'reference', failed: null, durationMs })
const dead = (at: number): HeartbeatRun =>
  ({ at, mode: 'reference', failed: 'worker boot error', durationMs: null })

const STORE: FrozenStore = {
  voiceId: 'twin-heartbeat-voice',
  ownedProductName: 'Ledger Notebook',
  sponsoredNeverUsedProductName: 'Northwind Serum',
  lengthBand: { min: 90, max: 160 },
}

describe('a heartbeat that spams gets muted', () => {
  it('pages ONCE when it breaks, not on every run after', () => {
    // ⚠️ THE SPECIFIC FAILURE MODE. Two variants an hour, twenty-four hours:
    // 48 runs. A monitor that pages on each one is a monitor somebody mutes by
    // the second hour, and a muted monitor is worse than none.
    let state: PageState = INITIAL_PAGE_STATE
    const pages: (string | null)[] = []
    for (let i = 0; i < 12; i++) {
      // twelve runs inside one hour — every five minutes
      const d = decideHeartbeat(state, dead(i * 5 * 60_000))
      state = d.nextState
      pages.push(d.page)
    }
    expect(pages[0]).toBe('started_failing')
    expect(pages.slice(1).filter(Boolean)).toEqual([])
  })

  it('reminds once an hour while it stays broken', () => {
    let state = decideHeartbeat(INITIAL_PAGE_STATE, dead(0)).nextState
    // 59 minutes: still quiet.
    expect(decideHeartbeat(state, dead(59 * 60_000)).page).toBeNull()
    // 60 minutes: one reminder, and the clock restarts from it.
    const r = decideHeartbeat(state, dead(HOUR))
    expect(r.page).toBe('still_failing')
    state = r.nextState
    expect(decideHeartbeat(state, dead(HOUR + 59 * 60_000)).page).toBeNull()
    expect(decideHeartbeat(state, dead(2 * HOUR)).page).toBe('still_failing')
  })

  it('pages on RECOVERY too', () => {
    // "It is back" is the other thing worth interrupting somebody for. A pager
    // that only ever brings bad news is one you learn to dread.
    const broken = decideHeartbeat(INITIAL_PAGE_STATE, dead(0)).nextState
    const back = decideHeartbeat(broken, ok(10 * 60_000))
    expect(back.page).toBe('recovered')
    expect(back.nextState.failing).toBe(false)
    // …and then goes quiet again.
    expect(decideHeartbeat(back.nextState, ok(20 * 60_000)).page).toBeNull()
  })

  it('a failing state with no recorded page still pages', () => {
    // Missing state is not a reason to stay silent forever — that is how a
    // monitor becomes decorative. It pages and repairs its own state.
    const orphaned: PageState = { failing: true, lastPagedAt: null }
    const d = decideHeartbeat(orphaned, dead(5_000))
    expect(d.page).toBe('still_failing')
    expect(d.nextState.lastPagedAt).toBe(5_000)
  })
})

describe('slow is a page, unmeasured is not', () => {
  it('over three minutes pages; under does not', () => {
    expect(runIsBad(ok(0, PAGE_IF_SLOWER_THAN_MS + 1))).toBe(true)
    expect(runIsBad(ok(0, PAGE_IF_SLOWER_THAN_MS))).toBe(false)
  })

  it('an unmeasured duration is NOT treated as fast, and NOT paged', () => {
    // ⚠️ `null > threshold` is false in JS. Compared directly, a run we failed
    // to time would read as healthy — the exact shape of bug that lets a
    // broken thing look fine. It does not page (the script did arrive) but it
    // does not vanish either: absent is not zero, so it reaches the digest.
    const unmeasured: HeartbeatRun = { at: 0, mode: 'idea', failed: null, durationMs: null }
    expect(runIsBad(unmeasured)).toBe(false)
    const d = decideHeartbeat(INITIAL_PAGE_STATE, unmeasured)
    expect(d.page).toBeNull()
    expect(d.digest.map((f) => f.kind)).toContain('duration_not_measured')
  })

  it('REMINDER_INTERVAL and the slow threshold are the owner\'s numbers', () => {
    expect(PAGE_IF_SLOWER_THAN_MS).toBe(3 * 60 * 1000)
    expect(REMINDER_INTERVAL_MS).toBe(HOUR)
  })
})

describe('the frozen store is what makes these decidable', () => {
  it('catches a script attributed to another creator', () => {
    // Not hypothetical: this happened on 2026-09-07 and was never explained.
    expect(wrongVoiceFinding(STORE, '6cee6049')?.kind).toBe('wrong_voice')
    expect(wrongVoiceFinding(STORE, STORE.voiceId)).toBeNull()
  })

  it('an unreported voice is not a WRONG voice', () => {
    // Absent is not zero, and it is not guilt either.
    expect(wrongVoiceFinding(STORE, null)).toBeNull()
  })

  it('catches testifying to a sponsored product never used', () => {
    const bad = 'I have used Northwind Serum for months. It works.'
    expect(sponsoredSpokenAsLivedFinding(STORE, bad)?.kind).toBe('sponsored_product_spoken_as_lived')
  })

  it('does NOT flag the sponsor merely being named', () => {
    // Naming a sponsor is allowed. Claiming to have lived it is not. A checker
    // that cannot tell them apart is one somebody learns to ignore.
    const fine = 'Northwind Serum is out this week. I tested my own notebook for a year.'
    expect(sponsoredSpokenAsLivedFinding(STORE, fine)).toBeNull()
  })

  it('flags a script far outside the frozen store\'s length band', () => {
    expect(lengthBandFinding(STORE, 'word '.repeat(200))?.kind).toBe('length_outside_band')
    expect(lengthBandFinding(STORE, 'word '.repeat(120))).toBeNull()
  })

  it('an EMPTY script is a failure, not a length anomaly', () => {
    // Routing "nothing came back" to the daily digest is how a two-day outage
    // stays unnoticed for two days.
    expect(lengthBandFinding(STORE, '   ')).toBeNull()
    expect(runIsBad({ at: 0, mode: 'idea', failed: 'empty', durationMs: 10 })).toBe(true)
  })
})

describe('the duplicated first-person matcher may not drift', () => {
  // ⚠️ THE POLICY MODULE IS A LEAF BY NECESSITY. The scheduled runner is a
  // .mjs script loaded with --experimental-strip-types, which resolves imports
  // like Node; the canonical FIRST_PERSON_MARKER lives behind an import chain
  // that will not load that way. So it is copied — and a copy nothing checks
  // is how two truths start disagreeing quietly.
  //
  // ⚖️ THIS TEST CAN IMPORT BOTH, so it is where the two are held together.
  const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
  const SRC = readFileSync(join(REPO, 'packages/shared/src/ops/heartbeatPolicy.ts'), 'utf8')

  it('the copy is byte-identical to the canonical matcher', () => {
    const m = /const FIRST_PERSON_HERE = (\/.+\/i)\n/.exec(SRC)
    expect(m, 'FIRST_PERSON_HERE not found — did it get renamed?').not.toBeNull()
    expect(m![1]).toBe(FIRST_PERSON_MARKER.toString())
  })

  it('and they agree on a corpus, not only as source text', () => {
    // Byte equality could be satisfied by two regexes that are both wrong.
    // This asserts BEHAVIOUR on the cases the testimonial gate turns on.
    const copy = new RegExp(/const FIRST_PERSON_HERE = (\/.+\/i)\n/.exec(SRC)![1].slice(1, -2), 'i')
    for (const s of [
      'I have used it', 'we tried this', 'my own notebook', 'ours is better',
      'the product ships tuesday', 'it works for them', 'Northwind Serum is out',
    ]) {
      expect(copy.test(s), s).toBe(FIRST_PERSON_MARKER.test(s))
    }
  })
})
