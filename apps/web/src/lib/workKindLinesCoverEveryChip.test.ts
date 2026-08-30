// NO WORK-KIND CHIP SHIPS WITHOUT A READER IN THE WRITER'S PROMPT.
//
// ⚠️ THIS TEST EXISTS BECAUSE THE BUG WAS FIXED THE WRONG WAY ROUND. A previous
// session found that `founder`, `coach` and `freelancer` had no entry in
// `WORK_KIND_LINES` — so choosing one put nothing in the prompt — and resolved
// it by DELETING the three chips. That is a real fix to the stated defect and a
// regression against the product: a coach selling consulting and a founder
// remixing a business influencer are the creators this thing is tested on, and
// they were left answering "Something else" about their own occupation.
//
// The rule that prevents both mistakes is the same one: a question may not
// exist without a proven reader. So this pins the two halves TOGETHER —
// offering a chip and answering it in the prompt — and fails the build if
// either half moves without the other, in whichever direction.
//
// ⚖️ IT READS THE SHIPPED SOURCES, NOT A COPY OF THE LIST. `WORK_KIND_LINES` is
// declared inside the request handler in an edge function that cannot be
// imported from a Vitest run (Deno globals, top-level side effects), so the map
// is lifted from the file's own text. A test that re-typed the list would pass
// against a list nobody ships.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/** Relative to THIS FILE, never the working directory — a test whose result
 *  depends on where it was invoked from reports on the invocation. */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const ONBOARDING = readFileSync(join(REPO, 'apps/web/src/pages/Onboarding.tsx'), 'utf8')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

/** The chips a new signup is actually offered. */
function offeredChips(): string[] {
  const m = ONBOARDING.match(
    /const ONBOARDING_WORK_KINDS: readonly BriefWorkKind\[\] = \[([\s\S]*?)\]/,
  )
  if (!m) throw new Error('could not find ONBOARDING_WORK_KINDS — fix the marker, do not inline the list')
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
}

/** The keys the writer's prompt map answers. */
function workKindLineKeys(): string[] {
  const start = EDGE.indexOf('const WORK_KIND_LINES: Record<string, string> = {')
  if (start < 0) throw new Error('could not find WORK_KIND_LINES in generate-blueprint')
  const body = EDGE.slice(start, EDGE.indexOf('\n    }', start))
  return [...body.matchAll(/^\s{6}([a-z_]+):\s*'/gm)].map((x) => x[1])
}

/** The value of one entry, so "present" cannot be satisfied by an empty string. */
function workKindLine(key: string): string {
  const start = EDGE.indexOf('const WORK_KIND_LINES: Record<string, string> = {')
  const body = EDGE.slice(start, EDGE.indexOf('\n    }', start))
  const m = body.match(new RegExp(`^\\s{6}${key}:\\s*'(.*)',$`, 'm'))
  return m ? m[1] : ''
}

describe('every offered work-kind chip reaches the writer', () => {
  it('lifts a non-empty chip list and a non-empty line map', () => {
    // Guards the guard: a broken regex would otherwise make every assertion
    // below vacuously true.
    expect(offeredChips().length).toBeGreaterThan(1)
    expect(workKindLineKeys().length).toBeGreaterThan(1)
  })

  it('has a real WORK_KIND_LINES entry for every chip except `other`', () => {
    // `other` is deliberately absent: it carries the creator's own typed
    // sentence through a separate branch, and a canned line for the bare word
    // "other" would describe nobody.
    const needsALine = offeredChips().filter((k) => k !== 'other')
    const missing = needsALine.filter((k) => !workKindLineKeys().includes(k))
    expect(missing, `offered chips with no line in the writer's prompt: ${missing.join(', ')}`).toEqual([])
  })

  it('and none of those entries is blank or a placeholder', () => {
    for (const k of offeredChips().filter((x) => x !== 'other')) {
      const line = workKindLine(k)
      expect(line.length, `${k} has an empty WORK_KIND_LINES entry`).toBeGreaterThan(40)
      expect(line, `${k} reads as a placeholder`).not.toMatch(/^(TODO|TBD|\s*)$/i)
    }
  })

  it('offers `other` as the escape hatch, so nobody is forced into a wrong chip', () => {
    expect(offeredChips()).toContain('other')
  })

  it('offers the three chips that were wrongly deleted', () => {
    // Named explicitly rather than counted: a future edit that drops `coach`
    // again should fail with the reason, not with an arithmetic mismatch.
    for (const k of ['founder', 'coach']) expect(offeredChips()).toContain(k)
  })

  it('still answers the legacy values it no longer offers', () => {
    // `freelancer`, `brand` and `local_service` are not offered to a new signup
    // — each is folded into a chip — but rows already hold them, and a stored
    // value with no line is the same silent gap this test exists to forbid.
    for (const k of ['freelancer', 'brand', 'local_service']) {
      expect(workKindLineKeys(), `${k} is a stored value with no writer line`).toContain(k)
    }
  })
})
