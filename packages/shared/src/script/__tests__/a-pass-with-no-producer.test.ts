import { describe, it, expect } from 'vitest'
import { syncSetupLabels } from '../setupLabelSync.js'
import { setupStrip } from '../../setupPlan.js'

/**
 * ⚠️ TWO "BLOCKED ON RUN G" ITEMS, SETTLED FROM PRODUCTION INSTEAD.
 *
 * Both were recorded as needing two lines pasted out of one historical run,
 * each with "two candidate causes needing OPPOSITE fixes". Neither cause was
 * the real one, and no line from Run G could have shown that — because both
 * rules are keyed on a shape production has never stored.
 *
 * ── ITEM 4, SETUP DEDUPE ──────────────────────────────────────────────────
 *
 * `syncSetupLabels` only acts on a `shot_list[].notes` string of the form
 *   "Setup <letter> · <description> · <framing>"
 * Measured 2026-09-02 over EVERY generation in production — 56 of them,
 * 2026-06-29 through 2026-09-01: **zero** rows carry it. One row in the whole
 * table has notes merely STARTING with the word "Setup", and it is prose
 * ("Setup beat. Simulating a different character or perspective."). The word
 * appears 17 times, always as ordinary English.
 *
 * ⚖️ THE ONLY PRODUCER OF THAT STRING IS A DISPLAY HELPER. `setupStrip()`
 * returns an ARRAY for `ScriptEditor`'s SetupStrip component to render. It is
 * client-side, in-memory, and never writes a blueprint. So the server-side
 * pass reconciles a format nothing on the server emits: it relabels 0 rows on
 * 100% of generations, and always has.
 *
 * ⚠️ SO THE PROPOSED FIXES WERE BOTH UNTESTABLE. "Take framing out of the
 * identity key" and "strengthen `norm`" both change how two rows COMPARE —
 * and no two rows ever reach the comparison. Either change would have passed
 * its own unit test and altered nothing a creator sees.
 *
 * ── ITEM 3, THE DANGLING ORDINAL ──────────────────────────────────────────
 *
 * The rule was to fire "when `enumeration.is_enumerated`". `enumeration` is
 * not a blueprint field: 0 of 56 generations have it, under that name or any
 * other. The real value is `referenceMechanism.ts`'s `enumeration.isEnumerated`
 * — camelCase, computed at runtime from the reference, never persisted. A
 * guard written against the snake_case blueprint path would read `undefined`
 * on every generation and therefore never fire.
 */

/** Verbatim `notes` from production rows — the complete set that mentions
 *  "setup" at all, plus two ordinary rows for contrast. Frozen 2026-09-02. */
const REAL_PRODUCTION_NOTES: readonly string[] = [
  'Hook and first half of setup.',
  'Setup beat. Simulating a different character or perspective.',
  'Talking head for the Hook and Setup.',
  'B-roll showing the relatable struggle to pair with the setup audio.',
  'Creator next to the massive box, showing scale.',
  'Show the setup of the prank clearly.',
  'Talking head for the setup.',
  'Slightly wider to allow for hand gestures during the setup explanation.',
  'Overlay footage of the desk setup.',
  'Used for the setup and payoff sections. Allows hand gestures to be seen.',
  'Slightly zoomed out from opener, lean in. Setup line spoken.',
  'Creator speaking the hook line.',
  'Creator delivering the final call to action.',
]

describe('the setup sync has no producer, so it never fires', () => {
  it('relabels nothing on the real production notes', () => {
    const shots = REAL_PRODUCTION_NOTES.map((notes) => ({ notes }))
    const result = syncSetupLabels(shots)
    // ⚠️ THE WHOLE FINDING, IN ONE NUMBER. Not "few" — zero, on every row
    // production has ever written.
    expect(result.relabeled).toBe(0)
    expect(result.setupCount).toBe(0)
  })

  it('leaves every row untouched, by reference', () => {
    // A pass that returns the same objects did not merely decline to change
    // them — it never entered the branch that could.
    const shots = REAL_PRODUCTION_NOTES.map((notes) => ({ notes }))
    const result = syncSetupLabels(shots)
    result.shots.forEach((row, i) => expect(row).toBe(shots[i]))
  })

  it('the one row starting with the word "Setup" still does not match', () => {
    // "Setup beat. ..." begins with the token but carries no "·", so the
    // prefix regex rejects it. This is why a substring search for "Setup"
    // over production looks like evidence and is not.
    const r = syncSetupLabels([{ notes: 'Setup beat. Simulating a different character or perspective.' }])
    expect(r.relabeled).toBe(0)
  })

  it('DOES fire on the shape it was written for — the pass is not broken', () => {
    // ⚖️ ASKED WHETHER THE CODE WAS WRONG FIRST. It is not: given its input
    // format it works, and two rows describing the same place share a letter.
    // The defect is that nothing produces the input.
    const r = syncSetupLabels([
      { notes: 'Setup D · Dark studio · Medium shot' },
      { notes: 'Setup A · Dark studio · Medium shot' },
      { notes: 'Setup B · Kitchen counter · Wide shot' },
    ])
    expect(r.relabeled).toBeGreaterThan(0)
    expect(r.setupCount).toBe(2)
    expect(r.shots[0]!.notes).toBe(r.shots[1]!.notes)
  })

  it('the only producer of the string is a client-side display helper', () => {
    // `setupStrip` returns an ARRAY for a React component to render. It does
    // not return a "·"-joined notes string, and it does not write anything.
    const strip = setupStrip({ id: 'A', background: 'Dark studio', framing: 'Chest-up' } as never)
    expect(Array.isArray(strip)).toBe(true)
    expect(strip[0]).toBe('Setup A')
  })
})
