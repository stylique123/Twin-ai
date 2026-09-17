// A QUESTION THAT MINTS A KIND THE WRITER DOES NOT READ IS A DEAD CHANNEL.
//
// ⚠️ THIS IS THE DOMINANT DEFECT CLASS IN THIS CODEBASE, IN ITS QUIETEST FORM.
// `askedKnowledgeRow` stamps `kind` from the QUESTION, deliberately — "the
// question fixes the kind rather than a classifier guessing it". The writer then
// admits a row only if its kind is in `SUBSTANCE_KINDS`. Those two lists are
// independent, live in three files, and nothing has ever compared them.
//
// ⚖️ TODAY THEY AGREE, AND THAT IS A COINCIDENCE RATHER THAN A GUARANTEE. All
// four `AskedKind` values happen to be substance kinds. Add a fifth — a
// `preference`, a `caveat`, anything a future question wants — and the creator
// would answer it, the row would store, the Product Library would show it, and
// the script would never contain it. Nothing would fail. That is the exact shape
// of every "built, correct, and nothing reads it" defect already closed here.
//
// ⚠️ AND IT MATTERS MORE SINCE THE OPENING SET GREW. `openingSetFor` picks the
// extra questions BY KIND — deliberately the scarcest ones — so a kind the
// writer ignores would be selected MORE often, not less: the store would never
// accumulate it, so it would look permanently scarce and keep winning.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { SUBSTANCE_KINDS } from '../knowledgeSelection'
import { CREATOR_QUESTIONS, answerToKnowledge, type AskedKind } from '../creatorQuestions'
import { openingSetFor } from '../questionDeficit'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

/** Lifted from the edge rather than retyped — the same rule
 *  `knowledgeSelectionParity` follows, and for the same reason. */
function edgeSubstanceKinds(): Set<string> {
  const m = EDGE.match(/const SUBSTANCE_KINDS: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\)/)
  expect(m, 'the edge copy of SUBSTANCE_KINDS is missing — re-anchor, do not delete').toBeTruthy()
  const kinds = new Set(m![1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean))
  // Refuse a vacuous pass: an empty set would make every assertion below trivial.
  expect(kinds.size).toBeGreaterThan(3)
  return kinds
}

/** Every kind a question can actually produce. Derived from the BANK, not from
 *  the type, because the bank is what a creator meets. */
const bankKinds = (): AskedKind[] => [...new Set(CREATOR_QUESTIONS.map((q) => q.kind))]

describe('every kind a question can mint is a kind the writer reads', () => {
  it('the bank produces at least three distinct kinds — otherwise this is vacuous', () => {
    expect(bankKinds().length).toBeGreaterThanOrEqual(3)
  })

  it('shared: every question kind is a SUBSTANCE_KIND', () => {
    for (const k of bankKinds()) {
      expect(SUBSTANCE_KINDS.has(k), `a question mints '${k}', which the selector drops`).toBe(true)
    }
  })

  it('the edge mirror agrees, because that is the copy that actually runs', () => {
    const edge = edgeSubstanceKinds()
    for (const k of bankKinds()) {
      expect(edge.has(k), `the edge selector drops '${k}' — a question's answer would never be spoken`).toBe(true)
    }
  })

  it('and the two copies have not drifted from each other', () => {
    expect([...edgeSubstanceKinds()].sort()).toEqual([...SUBSTANCE_KINDS].sort())
  })

  // ⚠️ THE OPENING SET IS THE ONE A CREATOR IS MOST LIKELY TO ANSWER, so it gets
  // its own assertion rather than relying on the bank sweep above.
  it('every question in the opening set mints a kind the writer reads', () => {
    const set = openingSetFor()
    expect(set.length).toBeGreaterThan(3)
    const edge = edgeSubstanceKinds()
    for (const q of set) {
      expect(SUBSTANCE_KINDS.has(q.kind), `opening question ${q.id} mints '${q.kind}'`).toBe(true)
      expect(edge.has(q.kind), `opening question ${q.id} mints '${q.kind}' the edge drops`).toBe(true)
    }
  })

  // ⚠️ THE KIND MUST SURVIVE THE ROW BUILDER TOO. Checking the bank alone would
  // miss `answerToKnowledge` rewriting or defaulting it on the way through — the
  // step between the question and the store.
  it('the row builder carries the question kind through unchanged', () => {
    for (const q of CREATOR_QUESTIONS) {
      const r = answerToKnowledge(q, 'A specific answer that is comfortably long enough to be kept.')
      expect(r.ok, `${q.id} refused a valid answer`).toBe(true)
      if (!r.ok) continue
      expect(r.row.kind).toBe(q.kind)
      expect(SUBSTANCE_KINDS.has(r.row.kind), `the stored row's kind '${r.row.kind}' is dropped`).toBe(true)
    }
  })
})
