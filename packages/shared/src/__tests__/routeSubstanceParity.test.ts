// THE ROUTING RULE EXISTS TWICE, AND THE ONE THAT RUNS IS THE EDGE'S.
//
// ⚠️ AND UNTIL THIS PR IT RAN NOWHERE. `routeSubstance` — the only function
// that can return CHANGE_CONCEPT, which is to say the only built mechanism for
// rejecting a concept BEFORE the writer runs — had eleven passing assertions
// and no production caller. The module-level unwired check reported
// `traceability.ts` as wired because the edge imports `traceabilityLevel`; the
// function underneath it was invisible. This file pins the inlined copy now
// that one exists.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const TRACE = readFileSync(join(REPO, 'packages/shared/src/traceability.ts'), 'utf8')
const RESOLVER = readFileSync(join(REPO, 'packages/shared/src/knowledgeResolver.ts'), 'utf8')

/** The decision lines of a function, stripped of comments and blank lines.
 *  Comparing BODIES rather than whole files, because the shared copy carries the
 *  rationale and the edge copy carries a pointer to it — that difference is
 *  intended and must not be reported as drift. */
function body(src: string, signature: string): string[] {
  const at = src.indexOf(signature)
  if (at < 0) throw new Error(`could not find \`${signature}\` — fix the marker, do not inline the text`)
  const rest = src.slice(at)
  const end = rest.indexOf('\n}')
  return rest.slice(0, end).split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter((l) => l !== '' && !l.startsWith('*') && !l.startsWith('/*'))
    .slice(1)
}

describe('edge ↔ shared routing parity', () => {
  it('every routing decision is identical, in the same order', () => {
    // ⚖️ ORDER IS PART OF THE RULE. The concept check comes FIRST on purpose: a
    // reference demanding expertise the creator has no evidence for is not fixed
    // by sourcing the facts elsewhere. A copy that reorders these branches
    // passes a set comparison and gets the answer wrong.
    expect(body(EDGE, 'function routeSubstance(ctx: RoutingContext)'))
      .toEqual(body(TRACE, 'export function routeSubstance(ctx: RoutingContext)'))
  })

  it('creator-level depth is computed the same way on both sides', () => {
    expect(body(EDGE, 'function creatorDepth(supplied'))
      .toEqual(body(RESOLVER, 'export function creatorDepth(supplied'))
    // The kind list decides what counts as substance at all.
    const kinds = (s: string) => s.match(/PROPOSITIONAL_KINDS: ReadonlySet<string> = new Set\(\[\s*([^\]]+)\]/)?.[1]
    expect(kinds(EDGE)).toBe(kinds(RESOLVER))
  })
})

describe('the shadow run changes nothing, which is the point', () => {
  it('routes are counted and never applied', () => {
    const at = EDGE.indexOf("event: 'substance_route_shadow'")
    expect(at).toBeGreaterThan(-1)
    // Everything between computing the route and logging it must be arithmetic.
    // A `return`, a rewrite, or a status change would make this an enforcement
    // path wearing a shadow label.
    const block = EDGE.slice(EDGE.indexOf('const routeCounts'), at)
    expect(block).not.toMatch(/return json\(|\.line\s*=[^=]|issues\.push|status:/)
  })

  it('never breaks a generation the creator already paid for', () => {
    const block = EDGE.slice(EDGE.indexOf('const routeCounts'))
    expect(block.slice(0, block.indexOf("event: 'substance_route_shadow'")))
      .toMatch(/catch \(err\) \{[\s\S]{0,200}substance_route_shadow_failed/)
  })

  it('leaves conceptDemandsUnevidencedExpertise unsupplied, and says so', () => {
    // ⚠️ THE ONE INPUT THAT PRODUCES A REFUSAL. No detector for it exists.
    // Passing a guess would manufacture CHANGE_CONCEPT verdicts out of nothing,
    // so the field stays unset and its absence is logged rather than inferred
    // from a silent zero.
    const call = EDGE.slice(EDGE.indexOf('const ctx: RoutingContext'), EDGE.indexOf('const route = routeSubstance(ctx)'))
    expect(call).not.toMatch(/conceptDemandsUnevidencedExpertise/)
    expect(EDGE).toMatch(/change_concept: routeCounts\.CHANGE_CONCEPT \?\? 0/)
  })
})
