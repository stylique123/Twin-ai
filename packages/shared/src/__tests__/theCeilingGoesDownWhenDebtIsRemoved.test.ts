// "THIS NUMBER GOES DOWN AS DEBT IS NAMED OR REMOVED AND NEVER UP."
//
// ⚠️ THAT RULE WAS PROSE IN A COMMENT AND NOTHING ENFORCED IT.
// `check_symbol_readers.mjs` carries `MAX_UNREGISTERED`, the count of exported
// symbols nobody reads and nobody has explained. Its own comment states the
// discipline — the number falls as debt is removed, rises only when the
// INSTRUMENT got stricter in the same commit — but a ceiling cannot police
// itself: raising it can never make the guard fail, because a smaller measured
// count still clears a larger ceiling. Loosening it was a one-character edit
// that no check would have noticed.
//
// ⚖️ SO THE CAP IS PINNED HERE, AND A LEGITIMATE RAISE MUST EDIT THIS TOO.
// That is the point rather than an inconvenience: the rule permits a raise only
// alongside a stricter instrument, which is a deliberate act, and a deliberate
// act should cost a deliberate second edit instead of a keystroke.
//
// ⚖️ A CAP, NOT AN EQUALITY. Asserting `ceiling === measured` would fail the
// very PRs this rewards — someone wiring two symbols would be told to lower the
// ceiling before their improvement could land. The ratchet may lag the
// measurement; it may never exceed the last agreed cap.
//
// ⚠️ PATHS FROM import.meta.url, NEVER cwd. CI runs vitest with cwd set to the
// workspace, not the repo root, and a test that passes because of where it was
// invoked from is not passing.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const GUARD = readFileSync(join(REPO, 'scripts/ci/check_symbol_readers.mjs'), 'utf8')

/**
 * The agreed cap, lowered only with a measurement recorded in the guard.
 *
 * ⚠️ 146 -> 145 ON 2026-09-14, MEASURED ON MAIN AT ffcadfc6 AND NOT PREDICTED.
 * #888 pointed the teleprompter's save panel at `saveStageLabel` and its
 * `SaveStage` vocabulary — built after a creator watched a take reach 100% and
 * then be refused, and read by nothing in apps, worker, supabase or packages.
 * Reached went 776 -> 777; unregistered 146 -> 145. The debt is gone, not named.
 */
const AGREED_CAP = 145

function declaredCeiling(): number {
  // ⚖️ THE DECLARATION, NOT ANY MENTION. The guard's comment block discusses
  // 149, 146 and 101 in prose; matching a bare number would read the history
  // instead of the setting.
  const m = GUARD.match(/^const MAX_UNREGISTERED = (\d+)$/m)
  expect(m, 'MAX_UNREGISTERED is no longer a plain const — re-anchor this test').not.toBeNull()
  return Number((m as RegExpMatchArray)[1])
}

describe('the unregistered-symbol ceiling is a ratchet', () => {
  it('is declared as a single plain number', () => {
    expect(Number.isInteger(declaredCeiling())).toBe(true)
  })

  it('never rises above the agreed cap', () => {
    // ⚠️ IF THIS FAILS, THE QUESTION IS WHY THE CEILING WENT UP — not how to
    // make the test agree with it. The only admissible answer is that the
    // instrument got stricter in the SAME commit, at the number that
    // improvement measured, which is what #797 did going 101 -> 149. Anything
    // else is debt being excused rather than named.
    expect(declaredCeiling()).toBeLessThanOrEqual(AGREED_CAP)
  })

  it('still carries the discipline it is enforcing, in the guard itself', () => {
    // The prose and the cap must not drift apart: a ratchet whose reason has
    // been edited away is a number nobody can defend.
    // ⚖️ TOLERANT OF THE COMMENT WRAP, NOT OF THE WORDING. The sentence spans a
    // line break and a `//` prefix in the guard; anchoring on the raw string
    // failed for formatting rather than for meaning, which is a stale anchor,
    // not a finding.
    expect(GUARD.replace(/\n\s*\/\/\s*/g, ' '))
      .toMatch(/goes DOWN as debt is named or removed and NEVER up/)
  })

  it('records the measurement behind the current value', () => {
    // ⚖️ A RATCHET WITHOUT ITS MEASUREMENT IS A GUESS THAT HARDENED. Every
    // lowering names what was wired or registered to earn it.
    expect(GUARD).toMatch(/RATCHETED 146 -> 145 BY WIRING ONE, NOT BY REGISTERING IT/)
  })
})
