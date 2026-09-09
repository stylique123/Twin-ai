// TWO GUARDS WHOSE JOB IS "THIS FUNCTION CAN BOOT", BOTH BLIND TO ONE SHAPE.
//
// ⚠️ MEASURED ON CODE THAT ALMOST SHIPPED (#746). A `const` was declared AFTER
// an `.forEach` callback that read it — every request would have thrown
// `ReferenceError` on the first beat. `tsc` exits 0, because TS2448 is not
// raised for a callback (it COULD run later, and the compiler will not be
// wrong); `check_edge_functions_parse` treats TS2448 as fatal and therefore
// never hears about it either.
//
// ⚖️ SO THE GUARD RESOLVES THROUGH THE SCOPE CHAIN INSTEAD OF ASKING THE
// COMPILER, and it is narrow on purpose: only callbacks that are invoked during
// the call, and only declarations still being evaluated — nothing beyond the
// innermost enclosing function, because by the time a runtime function is
// called its module has finished.
import { describe, expect, it } from 'vitest'
import {
  findImmediateCallbackDeadZones, type ImmediateCallbackDeadZone,
} from '../../../../scripts/ci/check_immediate_callback_dead_zone.mjs'

describe('the shape that shipped past two guards', () => {
  it('catches a read before the declaration inside .forEach', () => {
    const hits = findImmediateCallbackDeadZones(`
      function build(rows) {
        rows.forEach((r) => { nameable.add(r.id) })
        const nameable = new Set()
      }
    `)
    expect(hits.map((h: ImmediateCallbackDeadZone) => h.name)).toContain('nameable')
  })

  it('and inside .filter, .map and .some', () => {
    for (const method of ['filter', 'map', 'some']) {
      const hits = findImmediateCallbackDeadZones(
        `function f(rows) { const o = rows.${method}((r) => later.has(r)); const later = new Set(); return o }`)
      expect(hits.map((h: ImmediateCallbackDeadZone) => h.method), method).toContain(method)
    }
  })
})

describe('what it refuses to report, because those are working programs', () => {
  it('a runtime function reading a module constant declared below it', () => {
    // ⚠️ THE FIRST VERSION OF THE GUARD REPORTED THIS, on three real files. By
    // the time `pick` is called the module has finished evaluating and every
    // top-level const exists. A guard that fires on working code gets switched
    // off, which is worse than not having it.
    expect(findImmediateCallbackDeadZones(`
      export function pick(words) { return words.filter((w) => !STOPWORDS.has(w)) }
      const STOPWORDS = new Set(['this'])
    `)).toEqual([])
  })

  it('a .tsx render callback reading a module constant declared below it', () => {
    // ⚠️ AND THE THIRD FALSE POSITIVE WAS THE PARSER, NOT THE RULE. Parsed as
    // `.ts`, JSX reads as type assertions and the component's own function
    // boundary disappears — so the guard picks the dialect from the extension.
    expect(findImmediateCallbackDeadZones(
      'export function Card({script}) {\n'
      + '  return (<div>{script.scenes.map((s) => sameWords(s.a, s.b) ? null : <p/>)}</div>)\n'
      + '}\n'
      + 'const sameWords = (a, b) => a === b\n',
      'Card.tsx',
    )).toEqual([])
  })

  it('a deferred callback — it may legitimately run later', () => {
    expect(findImmediateCallbackDeadZones(
      'function f() { setTimeout(() => later + 1, 0); const later = 1; return later }')).toEqual([])
  })

  it('a name the callback binds itself', () => {
    expect(findImmediateCallbackDeadZones(
      'function f(rows) { const o = rows.map((later) => later + 1); const later = 1; return o }')).toEqual([])
  })

  it('a property whose NAME matches a later declaration', () => {
    expect(findImmediateCallbackDeadZones(
      'function f(rows) { const o = rows.map((r) => r.later); const later = 1; return o }')).toEqual([])
  })

  it('`var`, because hoisting is a different bug', () => {
    // ⚖️ A `var` is initialised to undefined rather than throwing. Reporting it
    // here would mix two failures under one name.
    expect(findImmediateCallbackDeadZones(
      'function f(rows) { const o = rows.map((r) => hoisted); var hoisted = 1; return o }')).toEqual([])
  })
})
