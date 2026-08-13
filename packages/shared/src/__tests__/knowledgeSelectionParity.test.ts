// THE SELECTOR DECIDES WHAT A CREATOR'S SCRIPT IS MADE OF, IN THREE PLACES.
//
// ⚠️ SHARED, THE EDGE, AND THE HARNESS MUST AGREE. The edge cannot import
// @twinai/shared, so it carries a copy; the harness lifts the constants out of
// the edge rather than retyping them. A drift between shared and the edge ships
// one rule and tests another. A drift between the edge and the harness is worse:
// the matrix would report on a selector nobody runs, which is a result
// indistinguishable from a real one — the failure found in `run-eval.mjs` when a
// retyped beat-plan instruction would have reported a prompt fix as no change.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { SUBSTANCE_KINDS, SUBSTANCE_FLOOR, selectSpeakable } from '../knowledgeSelection'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const HARNESS = readFileSync(join(REPO, 'scripts/qa/run-eval.mjs'), 'utf8')

function edgeKinds(): Set<string> {
  const m = EDGE.match(/const SUBSTANCE_KINDS: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\)/)
  expect(m, 'the edge copy of SUBSTANCE_KINDS is missing').toBeTruthy()
  return new Set(m![1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean))
}

describe('the edge copy matches shared', () => {
  it('reserves the same kinds', () => {
    expect([...edgeKinds()].sort()).toEqual([...SUBSTANCE_KINDS].sort())
  })

  it('reserves the same number of slots', () => {
    const m = EDGE.match(/const SUBSTANCE_FLOOR = (\d+)/)
    expect(Number(m![1])).toBe(SUBSTANCE_FLOOR)
  })

  it('COUNTS what it handed over, so the fix is confirmable in production', () => {
    // ⚠️ THE 63%→52% COLLAPSE WAS INVISIBLE because the logs recorded that ten
    // items reached the writer and never what KIND. A floor shipped without this
    // counter would be a fix nobody could confirm — and `selectionShape` sat
    // written-and-unread in shared until this wired it, which is the exact
    // write-only defect this repo has now shipped nine times.
    expect(EDGE).toMatch(/function selectionShape/)
    expect(EDGE).toMatch(/selection: selectionShape\(speakable, ranked\)/)
  })

  it('distinguishes "crowded out" from "has nothing to say"', () => {
    // ⚖️ TWO DIFFERENT PROBLEMS WITH TWO DIFFERENT FIXES. `starved` means
    // substance existed and did not reach the prompt — the floor's business.
    // A small `available_substance` means the creator's store is thin, which
    // needs more transcripts or a question, and no selector can fix it.
    expect(EDGE).toMatch(/available_substance: availableSubstance/)
  })

  it('applies it where the prompt is built, not somewhere decorative', () => {
    expect(EDGE).toMatch(/const speakable = selectSpeakable\(relevanceOrdered, 10\)/)
    // ⚠️ THE OLD LINE MUST BE GONE, not merely bypassed. A surviving
    // `.slice(0, 10)` on the relevance order is the defect intact.
    const code = EDGE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
    expect(code).not.toMatch(/\.map\(\(x\) => x\.k\),\s*\]\.slice\(0, 10\)/)
  })
})

describe('the harness lifts rather than retypes', () => {
  it('reads the kinds and the floor out of the edge source', () => {
    expect(HARNESS).toMatch(/EDGE\.match\(\/const SUBSTANCE_KINDS/)
    expect(HARNESS).toMatch(/EDGE\.match\(\/const SUBSTANCE_FLOOR/)
  })

  it('dies loudly rather than running on a paraphrase', () => {
    expect(HARNESS).toMatch(/FATAL: could not lift the substance floor/)
  })

  it('actually applies it when choosing what to supply', () => {
    expect(HARNESS).toMatch(/selectSpeakable\(ordered, cap\)/)
    const code = HARNESS.replace(/^\s*\/\/.*$/gm, ' ')
    expect(code).not.toMatch(/items: ordered\.slice\(0, cap\)/)
  })
})

describe('the three implementations agree on a case that separates them', () => {
  it('the flooded store yields the same shape everywhere', () => {
    // Reconstructed from the edge's own constants, so this compares BEHAVIOUR
    // rather than source text.
    const kinds = edgeKinds()
    const floor = Number(EDGE.match(/const SUBSTANCE_FLOOR = (\d+)/)![1])
    const ranked = [
      ...Array.from({ length: 20 }, (_, i) => ({ kind: 'product', text: `p${i}` })),
      { kind: 'claim', text: 'a claim' }, { kind: 'experience', text: 'an experience' },
    ]
    const edgeLike = (() => {
      const substance = ranked.filter((i) => kinds.has(i.kind))
      const keep = substance.slice(0, Math.min(floor, 10))
      const taken = new Set(keep); const out = [...keep]
      for (const i of ranked) {
        if (out.length >= 10) break
        if (taken.has(i)) continue
        out.push(i); taken.add(i)
      }
      return out
    })()
    expect(selectSpeakable(ranked, 10).map((i) => i.text)).toEqual(edgeLike.map((i) => i.text))
    expect(edgeLike.map((i) => i.text)).toContain('a claim')
  })
})
