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

  it('recognises a figure by the same rule', () => {
    // ⚠️ THE REGEX IS THE DEFINITION. If the edge and shared disagree about what
    // counts as a figure, `figures` in the production log measures one thing and
    // every local analysis measures another — and the whole point of the counter
    // is to settle a question with production data.
    const lift = (s: string) => s.slice(s.indexOf('const FIGURE'), s.indexOf("'i')", s.indexOf('const FIGURE')))
      .replace(/\s+/g, ' ')
    const SHARED = readFileSync(join(REPO, 'packages/shared/src/knowledgeSelection.ts'), 'utf8')
    expect(lift(EDGE)).toBe(lift(SHARED))
    expect(lift(EDGE)).toContain('const FIGURE')
  })

  it('records the DENOMINATOR, not only what got through', () => {
    // ⚖️ THE FINDING THAT PUT THIS COUNTER HERE. Gap 5 assumed the selector was
    // dropping the creator's numbers. On the curated pack `figures` already
    // equals `available_figures`, and on caption-derived stores both are ZERO —
    // so the numbers are missing from scripts because the STORE has none, which
    // is a different problem with a different fix. Logging only `figures` would
    // leave those two indistinguishable.
    expect(EDGE).toMatch(/figures: chosen\.filter\(carriesFigure\)\.length/)
    expect(EDGE).toMatch(/available_figures: available\.filter\(carriesFigure\)\.length/)
  })

  it('applies it where the prompt is built, not somewhere decorative', () => {
    // ⚠️ THE ORDER IT IS APPLIED TO IS NOW THE FOCUS-PREFERRED ONE, and the cut
    // still happens here. `preferKindsInline` reorders BEFORE the selection is
    // taken — reordering after it would change nothing, because the ten rows
    // would already have been chosen. The floor is passed rather than defaulted
    // so the viewer-outcome answer can raise it.
    expect(EDGE).toMatch(/const speakable = selectSpeakable\(focusOrdered, 10, intent\.substanceFloor\)/)
    expect(EDGE.indexOf('const focusOrdered = preferKindsInline(relevanceOrdered'))
      .toBeLessThan(EDGE.indexOf('const speakable = selectSpeakable(focusOrdered'))
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

describe('the edge prefers spoken material by the same rule', () => {
  it('SELECTS the source column — it cannot prefer what it never read', () => {
    // ⚠️ THE EDGE DID NOT SELECT `source` AT ALL. The column has existed since
    // 0122 and the selector could not see it, so the preference below would have
    // been inert — computed against undefined on every row.
    expect(EDGE).toMatch(/\.select\('kind, text, basis, times_seen, confidence, source'\)/)
  })

  it('partitions the reservation, and does not sort it', () => {
    // ⚖️ A SORT WOULD REPLACE THE CALLER'S RELEVANCE. Measured: transcript-only
    // stores scored 73% grounded / 8% generic against 58% / 23% with caption
    // rows mixed in — but WHICH experience is still relevance's call.
    expect(EDGE).toMatch(/const spoken = substance\.filter\(wasSpoken\)/)
    expect(EDGE).toMatch(/const bySpokenFirst = \[\.\.\.spoken, \.\.\.rest\]/)
    expect(EDGE).toMatch(/const keepSubstance = bySpokenFirst\.slice\(0, floorSlots\)/)
    // ⚠️ AND THE FIRST-PERSON SLOT IS HELD IN THE EDGE COPY TOO. A physio with
    // two stored episodes got three scripts containing none; the floor swaps one
    // into the LAST reserved slot, never the first.
    expect(EDGE).toMatch(/keepSubstance\[floorSlots - 1\] = episode/)
  })

  it('treats an absent source as unrecorded in both copies', () => {
    const lift = (s: string) => s.slice(s.indexOf('function wasSpoken'), s.indexOf('\n}', s.indexOf('function wasSpoken'))).replace(/\s+/g, ' ')
    const SHARED = readFileSync(join(REPO, 'packages/shared/src/knowledgeSelection.ts'), 'utf8')
    expect(lift(EDGE)).toBe(lift(SHARED))
  })
})

describe('the HARNESS runs the current selector, not the previous one', () => {
  // ⚠️ IT DID NOT, AND NOBODY NOTICED FOR A DAY. #376 made spoken material fill
  // the substance reservation first. The harness carried its own retyped
  // `selectSpeakable` with no such partition, so every run after that change
  // measured the PREVIOUS selector while reporting on the current product —
  // the same failure this file already records for `promotes`, the count
  // contract, the beat plan and `productFacts`.
  //
  // ⚖️ THE EXISTING CHECKS ASSERTED THE HARNESS LIFTS THE CONSTANTS. Kinds and
  // floor were lifted and correct the whole time; the FUNCTION that uses them
  // was hand-written. A constant is not a rule.
  it('partitions spoken material first, like the edge does', () => {
    expect(HARNESS).toMatch(/const spoken = substance\.filter\(wasSpoken\)/)
    expect(HARNESS).toMatch(/const bySpokenFirst = \[\.\.\.spoken, \.\.\.rest\]/)
    // ⚠️ AND IT HOLDS THE FIRST-PERSON SLOT, or the harness measures a selector
    // that no longer ships — the failure this block already records once.
    expect(HARNESS).toMatch(/keep\[floorSlots - 1\] = episode/)
  })

  it('reads which sources count as spoken OUT OF the edge, rather than assuming', () => {
    expect(HARNESS).toMatch(/EDGE\.match\(\/const SPOKEN_SOURCES/)
  })

  it('treats an absent source as unrecorded, matching the edge', () => {
    expect(HARNESS).toMatch(/SPOKEN_SOURCES\.has\(String\(item\?\.source \?\? ''\)\)/)
  })
})

describe('the counters survive the log retention window', () => {
  // ⚠️ ALL SIX WERE `console.log` AND NOTHING ELSE. `substance_route_shadow`
  // carries the selection shape and the supply check, per generation, to edge
  // logs that expire within days — so a month of production traffic would leave
  // nothing to count at the end of it. The row they describe already survives.
  it('are stored on the generation row, not only logged', () => {
    expect(EDGE).toMatch(/selection: selectionSnapshot,/)
    expect(EDGE).toMatch(/selectionSnapshot = \{/)
  })

  it('computes the snapshot ONCE, so stored and logged cannot disagree', () => {
    const shadow = EDGE.slice(EDGE.indexOf('let selectionSnapshot'), EDGE.indexOf("event: 'substance_route_shadow'"))
    expect(shadow).toMatch(/selectionSnapshot = \{[\s\S]*selectionShape\(speakable, ranked\)/)
    // Exactly one assignment: a second would be a recomputation.
    expect(EDGE.match(/selectionSnapshot = \{/g)).toHaveLength(1)
  })

  it('starts null, so an unmeasured generation is not a measured-empty one', () => {
    expect(EDGE).toMatch(/let selectionSnapshot: Record<string, unknown> \| null = null/)
  })
})
