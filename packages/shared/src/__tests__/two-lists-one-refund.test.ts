import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isBillableScript, discoveryQuestions } from '../generationReadiness'

/**
 * ⚠️ THE RULE THAT DECIDES A REFUND LIVES TWICE, AND ONLY ONE COPY RUNS.
 *
 * `generationReadiness.ts` exports `isBillableScript` / `discoveryQuestions`,
 * which decide whether a script that asks the creator to fill in its own blanks
 * may be charged for. Grepped across the repo, NEITHER has a production caller —
 * only tests. The live decision is an inline copy in `generate-blueprint`
 * (`OUR_ASKS` + the 0.4 density rule) that re-implements the same rule from its
 * own private list of phrases.
 *
 * That is the repo's second defect shape — two authorities for one fact — with
 * the added trap that the edge's own comment claims `discoveryQuestions` and
 * `isBillableScript` are what detect these asks. They are not. Add a sixth
 * escalation phrase to the shared list and the edge keeps billing for it: the
 * creator pays for a script that is a form.
 *
 * Every other inline duplication in this function is pinned by a parity guard
 * (`generationReadinessParity`, the community-surface list, `beatAsk`). This one
 * was not. It is now.
 *
 * ⚖️ THIS GUARD DOES NOT PICK A WINNER. Collapsing to one copy means either an
 * edge import Deno cannot do, or deleting the shared pair and losing its unit
 * tests. Until that call is made, the two copies must agree, and disagreement
 * must fail here rather than in a creator's ledger.
 */

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const edge = readFileSync(join(repo, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
const shared = readFileSync(join(repo, 'packages', 'shared', 'src', 'generationReadiness.ts'), 'utf8')

/** Phrases from a `const NAME: ... = [ 'a', 'b' ]` block, sliced by its own
 *  closing bracket on a line of its own — not by `indexOf(']')`, which lands
 *  inside a character class and extracts nothing (a trap this repo has paid
 *  for: a parity guard that passed against an empty list). */
const phraseListAfter = (src: string, marker: string): string[] => {
  const start = src.indexOf(marker)
  if (start === -1) return []
  const close = /\n[ \t]*\]/.exec(src.slice(start))
  if (!close) return []
  return [...src.slice(start, start + close.index).matchAll(/'([^']{10,})'/g)].map((m) => m[1])
}

const edgeAsks = phraseListAfter(edge, 'const OUR_ASKS = [')
const sharedAsks = phraseListAfter(shared, 'const OUR_ESCALATIONS: readonly string[] = [')

describe('both lists exist to be compared', () => {
  // ⚠️ AN EMPTY LIST WOULD MAKE EVERY ASSERTION BELOW VACUOUSLY TRUE — the
  // exact way a parity guard becomes decoration.
  it('the edge carries a non-trivial OUR_ASKS', () => {
    expect(edgeAsks.length).toBeGreaterThanOrEqual(5)
  })

  it('the shared copy carries a non-trivial OUR_ESCALATIONS', () => {
    expect(sharedAsks.length).toBeGreaterThanOrEqual(5)
  })
})

describe('the two copies of the refund rule agree', () => {
  it('every phrase the shared rule refuses to bill, the edge also refuses', () => {
    for (const p of sharedAsks) {
      expect(edgeAsks, `shared refuses to bill "${p}"; the edge would charge for it`).toContain(p)
    }
  })

  // ⚠️ AND THE OTHER DIRECTION, WHICH COSTS TRUST RATHER THAN MONEY. A phrase
  // the edge refunds but the shared rule calls billable makes any offline
  // analysis of the ledger disagree with the ledger.
  it('every phrase the edge refuses to bill, the shared rule also refuses', () => {
    for (const p of edgeAsks) {
      expect(sharedAsks, `the edge refunds "${p}"; the shared rule calls it billable`).toContain(p)
    }
  })

  it('the phrases are lowercase, because both sides match against a lowercased line', () => {
    for (const p of [...edgeAsks, ...sharedAsks]) expect(p).toBe(p.toLowerCase())
  })
})

describe('the density threshold agrees too', () => {
  // ⚖️ 0.4 IS THE OTHER HALF OF THE SAME DECISION. Phrase parity with a drifted
  // threshold still refunds different scripts on the two sides.
  it('the edge uses the 0.4 mostly-questions ratio', () => {
    expect(edge).toMatch(/askedBeats \/ finalBeats\.length >= 0\.4/)
  })

  it('the shared rule uses the same ratio', () => {
    expect(shared).toMatch(/needsUserBeats \/ lines\.length >= 0\.4/)
  })

  it('and both name the same reason strings', () => {
    for (const reason of ['script_asks_creator_for_context', 'script_mostly_questions']) {
      expect(edge, `the edge does not emit ${reason}`).toContain(reason)
      expect(shared, `the shared rule does not emit ${reason}`).toContain(reason)
    }
  })
})

describe('the live escalation text the edge writes is one the rule catches', () => {
  // ⚠️ THE END-TO-END HALF. Phrase-list parity is worth nothing if the sentence
  // the edge actually writes into a beat matches neither list. This is the real
  // string from the placeholder-beat escalation.
  const written = 'Only you can supply this. This beat came back as an unfilled template — what would you actually say here?'

  it('the edge still writes that exact sentence', () => {
    expect(edge).toContain(written)
  })

  it('the shared rule would refuse to bill a script containing it', () => {
    expect(discoveryQuestions([written])).toEqual([0])
    expect(isBillableScript([written]).billable).toBe(false)
    expect(isBillableScript([written]).reason).toBe('script_asks_creator_for_context')
  })

  it('and the edge would too, by its own list', () => {
    const lower = written.toLowerCase()
    expect(edgeAsks.some((a) => lower.includes(a))).toBe(true)
  })
})
