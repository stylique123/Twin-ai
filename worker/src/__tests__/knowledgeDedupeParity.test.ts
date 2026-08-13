// THE DEDUPE RULE EXISTS TWICE, AND THE ONE THAT RUNS IS THE WORKER'S.
//
// ⚠️ THE WORKER HAS NO RUNTIME DEPENDENCY ON `@twinai/shared`, so the rule is
// copied rather than imported. A copy without a parity check is how the running
// rule quietly stops being the reviewed one — and this rule DELETES A PHRASING,
// so a drift here is data loss, not a cosmetic difference.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SHARED = readFileSync(join(REPO, 'packages/shared/src/knowledgeDedupe.ts'), 'utf8')
const WORKER = readFileSync(join(REPO, 'worker/src/knowledgeDedupe.ts'), 'utf8')

/** Lift a function body by name, so a drift is a failure and not a rewrite. */
function lift(src: string, where: string, name: string): string {
  // ⚠️ THE SIGNATURE MAY CARRY A TYPE PARAMETER — `canonicaliseRepeats<T…>(` —
  // so matching on `name(` silently fails to find the one generic function here,
  // and a lift that cannot find its target must throw rather than compare ''.
  const i = src.search(new RegExp(`export function ${name}[<(]`))
  if (i < 0) throw new Error(`could not lift ${name} from ${where} — fix the marker, do not inline the text`)
  const at = src.indexOf('\n}\n', i)
  // The last function in the file ends at EOF, with no trailing blank line.
  const end = at < 0 ? src.length : at
  return src.slice(i, end).replace(/\s+/g, ' ').trim()
}

describe('worker ↔ shared knowledge-dedupe parity', () => {
  it('every decision function is character-identical', () => {
    for (const fn of ['contentTokens', 'overlap', 'distinctiveMarks', 'nearDuplicate',
      'canonicaliseRepeats']) {
      expect(lift(WORKER, 'the worker', fn), fn).toBe(lift(SHARED, 'shared', fn))
    }
  })

  it('the threshold is the same number', () => {
    const th = (s: string) => s.match(/DEDUPE_THRESHOLD = ([\d.]+)/)?.[1]
    expect(th(WORKER)).toBe(th(SHARED))
    expect(th(WORKER)).toBe('0.6')
  })

  it('the stop-word list is the same list', () => {
    const stop = (s: string) => s.slice(s.indexOf('const STOP'), s.indexOf('.split', s.indexOf('const STOP')))
      .replace(/\s+/g, ' ')
    expect(stop(WORKER)).toBe(stop(SHARED))
  })

  it('the substance kinds match the selector the floor is built on', () => {
    // ⚠️ THE WORKER DEFINES ITS OWN COPY because it cannot import the selector.
    // Three lists that must agree — the selector's floor, the shared dedupe, and
    // this one — and only a check keeps them agreeing.
    const SELECTION = readFileSync(join(REPO, 'packages/shared/src/knowledgeSelection.ts'), 'utf8')
    const kinds = (s: string) => s.slice(s.indexOf('SUBSTANCE_KINDS'))
      .match(/'[a-z]+'/g)?.slice(0, 6)
    expect(kinds(WORKER)).toEqual(kinds(SELECTION))
  })

  it('the worker copy does NOT import from the shared package', () => {
    // A relative import compiles here and fails in the container image.
    expect(WORKER).not.toMatch(/from '@twinai\/shared/)
    expect(WORKER).not.toMatch(/from '\.\.\/\.\.\/packages/)
  })
})
