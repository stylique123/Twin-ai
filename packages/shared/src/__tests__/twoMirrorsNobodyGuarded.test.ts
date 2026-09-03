import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { renderContentHistory } from '../contentHistory'
import { resolveSubjectSource } from '../script/subjectSource'

/**
 * TWO COPIES, AND THE PROMPT ONLY EVER SEES THE INLINE ONE.
 *
 * ⚠️ FOUND BY WALKING THE CALL GRAPH, NOT BY GREPPING NAMES. `generate-blueprint
 * /index.ts` carries 83 inline mirrors of shared code, because an edge function
 * cannot import `@twinai/shared`. A name-mention grep says 15 of them have no
 * test. That number is wrong: 9 are exercised THROUGH a caller that is tested —
 * `asksForBrollInline` has no test naming it, but `unsupplyableShotCountInline`'s
 * parity test evaluates the source slice containing it. Resolving the call graph
 * and taking the transitive closure leaves SIX that no test reaches, and only
 * these two of the six have a shared original they can drift from. The other
 * four are edge-only: untested, but with no second copy, so not a parity risk.
 *
 * ⚖️ DRIFT HERE IS NOT HYPOTHETICAL. #644 shipped a fix that was HALF APPLIED
 * because the edge mirror had diverged and production reads the edge copy. The
 * shared copy being correct is worth nothing on its own.
 */

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

/** Evaluate one inline function out of the edge source, with the TypeScript
 *  annotations the parity harness cannot run stripped exactly as the existing
 *  parity tests strip them. */
function loadInline(startMarker: string, endMarker: string, exportName: string): unknown {
  const start = EDGE.indexOf(startMarker)
  const end = EDGE.indexOf(endMarker)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const src = EDGE.slice(start, end)
    .replace(/: ReadonlySet<string>/g, '')
    .replace(/: RegExp\[\]/g, '')
    .replace(/: string\[\]/g, '')
    // ⚠️ ONE LEVEL OF NESTING, BECAUSE THE MIRRORS NOW HAVE IT. `[^}]*` stops at
    // the FIRST `}`, so a parameter type containing an inline object — such as
    // `hookChoice?: { source: ...; index: ... } | null` — left a dangling brace
    // and the harness died with `SyntaxError: Unexpected token ':'` instead of
    // reporting a parity result. A guard that cannot load the thing it guards
    // reports nothing, which is worse than reporting a failure.
    .replace(/interface \w+Inline \{(?:[^{}]|\{[^{}]*\})*\}/g, '')
    .replace(/: Array<\{(?:[^{}]|\{[^{}]*\})*\}>/g, '')
    .replace(/\)\s*:\s*\{[^}]*\}\s*\{/g, ') {')
    .replace(/: unknown\b/g, '')
    .replace(/: string \| null \| undefined/g, '')
    .replace(/: boolean\b/g, '')
    .replace(/: string\b/g, '')
  // eslint-disable-next-line no-new-func
  return new Function(`${src}; return ${exportName}`)()
}

describe('renderContentHistoryInline matches the shared original', () => {
  const inline = loadInline(
    'const MIN_PRIOR_VIDEOS = 2',
    '// ── PREMISE COMPATIBILITY',
    'renderContentHistoryInline',
  ) as (p: unknown[]) => string

  const cases: Array<[string, Array<Record<string, string>>]> = [
    ['below the floor, one video', [{ formatLabel: 'listicle', hook: 'Three things' }]],
    ['exactly at the floor', [
      { formatLabel: 'listicle', hook: 'Three things', premise: 'What I stopped doing' },
      { formatLabel: 'story', hook: 'I quit at 3am', premise: 'The night it broke' },
    ]],
    ['over the display cap', Array.from({ length: 11 }, (_, i) => ({
      formatLabel: `format ${i}`, hook: `hook ${i}`, premise: `premise ${i}`,
    }))],
    ['rows that are entirely blank', [
      { formatLabel: '', hook: '', premise: '' },
      { formatLabel: '  ', hook: '  ', premise: '  ' },
      { formatLabel: 'real', hook: 'real hook', premise: 'real premise' },
    ]],
    ['whitespace that must collapse', [
      { formatLabel: '  a   b  ', hook: '\n\nopened\there\n', premise: 'x   y' },
      { formatLabel: 'second', hook: 'second hook', premise: 'second premise' },
    ]],
    ['text past the truncation points', [
      { formatLabel: 'f', hook: 'h'.repeat(200), premise: 'p'.repeat(300) },
      { formatLabel: 'f2', hook: 'h2', premise: 'p2' },
    ]],
  ]

  for (const [name, prior] of cases) {
    it(name, () => {
      expect(inline(prior)).toBe(renderContentHistory(prior as never))
    })
  }
})

describe('resolveSubjectSourceInline matches the shared original', () => {
  const inline = loadInline(
    'const SUBJECT_SOURCE_ASK_INLINE',
    '// ── STYLE COMPILER',
    'resolveSubjectSourceInline',
  ) as (focus: unknown, has: boolean) => {
    verdict: { focus: string | null; requires_own_source: boolean; source_available: boolean; needs_user: boolean }
    instruction: string
  }

  // ⚠️ NOT A BYTE COPY, AND THE FIRST DRAFT OF THIS TEST ASSUMED IT WAS.
  // The inline is a deliberate ADAPTATION: it takes a boolean rather than the
  // knowledge array (the edge resolves `evidenceLevel` earlier, from rows the
  // shared copy never sees) and it names the verdict fields in snake_case
  // because they are persisted. Deep-equality fails on both counts and says
  // nothing about drift. What must agree is the DECISION and the words the
  // writer is handed — so that is what this compares.
  const shared = (focus: string | null, has: boolean) =>
    resolveSubjectSource(focus as never, has ? [{ kind: 'experience', basis: 'stated', text: 'I quit my job at 3am' }] as never : [])

  const cases: Array<[string, string | null, boolean]> = [
    ['experience, and one is on record', 'experience', true],
    ['experience, and NOTHING is on record', 'experience', false],
    ['story, and one is on record', 'story', true],
    ['story, and nothing is on record', 'story', false],
    ['a focus that needs no experience', 'advice', false],
    ['a focus that needs no experience, with one anyway', 'advice', true],
    ['null focus', null, false],
    ['empty focus', '', false],
    ['whitespace-only focus', '   ', false],
  ]

  for (const [name, focus, has] of cases) {
    it(name, () => {
      const a = inline(focus, has)
      const b = shared(focus, has)
      expect(a.verdict.focus).toBe(b.focus)
      expect(a.verdict.requires_own_source).toBe(b.requiresOwnSource)
      expect(a.verdict.source_available).toBe(b.sourceAvailable)
      expect(a.verdict.needs_user).toBe(b.needsUser)
      // The instruction is the half the writer actually reads. A drift here is
      // invisible in every verdict field and changes the script.
      expect(a.instruction).toBe(b.instruction)
    })
  }
})
