// THE FUNCTION THAT WAS CALLED TWICE AND DEFINED NOWHERE.
//
// ⚠️ THIS IS THE SNAG, ROOT-CAUSED. `readMechanism` lives in
// packages/shared/src/referenceMechanism.ts. Edge functions cannot import
// @twinai/shared, and generate-blueprint called it anyway — so Deno raised
// `ReferenceError: readMechanism is not defined` AFTER the writer had returned a
// complete blueprint and AFTER the creator had been charged. The outer catch
// refunded and returned "We hit a snag".
//
// The two production failures on 2026-08-16, both in `script_attempts` with
// outcome `succeeded` and `generation_id` NULL:
//   run f2734f43…   writer settled 12:59:23.005, no generation row
//   run fcd16a55…   writer settled 13:02:05.058, refunded 13:02:05.684
//
// It had never fired before because the block that calls it — the selection and
// beat-audit counters — had never once executed in production until that day.
//
// ⚖️ INLINED RATHER THAN DELETED. Both call sites are real readers: the
// container-supply measurement and the reference-claim-leak count. Deleting the
// calls would have silenced the crash by throwing the measurements away.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { readMechanism, emptyMechanism } from '../referenceMechanism'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

/** ⚖️ EXECUTED, NOT PATTERN-MATCHED. */
function loadInline(): (raw: unknown) => unknown {
  const start = EDGE.indexOf('// ── REFERENCE MECHANISM, INLINED ─')
  const end = EDGE.indexOf('// ── PER-VIDEO INTENT, INLINED ─', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const js = transformSync(EDGE.slice(start, end), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return readMechanism`)() as (raw: unknown) => unknown
}

const inline = loadInline()

describe('the name exists in the file that calls it', () => {
  it('is DEFINED in the edge function, not only called there', () => {
    // ⚠️ THE ASSERTION THAT WOULD HAVE CAUGHT IT. Both call sites existed for
    // days with no definition anywhere in supabase/functions.
    expect(EDGE).toMatch(/function readMechanism\(raw: unknown\)/)
  })

  it('every call site still has a definition above it', () => {
    const def = EDGE.indexOf('function readMechanism(')
    for (const m of EDGE.matchAll(/readMechanism\(\(ref\?\.structure/g)) {
      expect(m.index, 'a call above its definition').toBeGreaterThan(def)
    }
  })

  it('the second missing name is defined too', () => {
    // Found by the same guard change: `observed.push(...STRUCTURAL_DIMENSIONS)`
    // is a value position, so it was a ReferenceError waiting for any reference
    // that produced beats.
    expect(EDGE).toMatch(/const STRUCTURAL_DIMENSIONS: readonly string\[\] = \[/)
  })
})

describe('edge ↔ shared mechanism parity, executed', () => {
  const CASES: unknown[] = [
    null, undefined, 'x', 42, [], {},
    { enumeration: {} },
    // ⚠️ THE SHAPE THE GENERATOR ACTUALLY EMITS — every field a STRING, because
    // the response schema types them that way and the prompt asks for quotes.
    { enumeration: { is_enumerated: 'true', count: '5', unit: 'ways' } },
    { enumeration: { is_enumerated: 'TRUE', count: 'five', unit: ' mistakes ' } },
    { enumeration: { is_enumerated: true, count: 5 } },
    { enumeration: { is_enumerated: 'false', count: '5' } },
    { enumeration: { is_enumerated: 'maybe', count: '5' } },
    // A flag with no number is not an enumeration.
    { enumeration: { is_enumerated: 'true', count: null } },
    { enumeration: { is_enumerated: 'true', count: '1' } },   // below MIN
    { enumeration: { is_enumerated: 'true', count: '99' } },  // above MAX
    { enumeration: { isEnumerated: true, count: 'three' } },
    { hook_promise: '  a promise  ', rehook_after_item: '3' },
    { hookPromise: 'camel', rehookAfterItem: 4 },
    { beat_debts: ['a', '', '  b  ', 7, null] },
    { beatDebts: 'not an array' },
    { enumeration: { is_enumerated: 'true', count: '5' }, beat_debts: ['x'], hook_promise: 'p' },
  ]

  it('agrees on every case, field for field', () => {
    for (const raw of CASES) {
      expect(inline(raw), JSON.stringify(raw) ?? 'undefined')
        .toEqual(readMechanism(raw))
    }
  })

  it('degrades unreadable input to not-enumerated rather than inventing a count', () => {
    // ⚖️ A fabricated count would fail every script against a number nobody
    // promised — worse than no check, because it reads as verified.
    for (const raw of [null, 'x', 42, [], {}]) {
      expect(inline(raw)).toEqual(emptyMechanism())
    }
  })

  it('reads the STRING "true", which is what the schema emits', () => {
    // ⚠️ Reading only the boolean made this false on every real generation, so
    // the whole count contract was withheld from the plans it was written for.
    const m = inline({ enumeration: { is_enumerated: 'true', count: '5' } }) as {
      enumeration: { isEnumerated: boolean; count: number | null }
    }
    expect(m.enumeration.isEnumerated).toBe(true)
    expect(m.enumeration.count).toBe(5)
  })

  it('never throws — it runs after the spend', () => {
    for (const raw of CASES) expect(() => inline(raw)).not.toThrow()
  })
})
