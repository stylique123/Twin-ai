// THE CREATOR-STATE RULE EXISTS TWICE, AND THE ONE THAT RUNS IS THE EDGE'S.
//
// ⚠️ AND IT SHIPPED IN `observe` MODE ON PURPOSE. Measured over 222 scripts the
// resolver grounds 0 of 57 claims — because every supplied knowledge item is
// coverage-level, not because the chain is wrong. Enforcing against that supply
// would mean "whenever Twin writes something personal about you, assume it
// cannot be proven", stripping personal experience out of scripts wholesale.
// The mode is a product decision and this file is where it is pinned.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const SHARED = readFileSync(join(REPO, 'packages/shared/src/creatorState.ts'), 'utf8')

function lift(src: string, where: string, name: string): string {
  const m = src.match(new RegExp(`^const ${name} =\\s*\\n?\\s*(.+)$`, 'm'))
  if (!m) throw new Error(`could not lift ${name} from ${where} — fix the marker, do not inline the text`)
  return m[1].trim()
}

describe('edge ↔ shared creator-state parity', () => {
  it('every detection pattern is character-identical', () => {
    for (const n of [
      'ASSERTED_USE', 'ASSERTED_PURCHASE', 'ASSERTED_RESULT', 'ASSERTED_HISTORY',
      'ASSERTED_EXPERIENCE', 'ASSERTED_RELATIONSHIP', 'ASSERTED_ACTION',
      'POSSESSIVE', 'ENTITY_STOP', 'ENUMERATED_PREMISE',
    ]) {
      expect(lift(EDGE, 'the edge function', n), n).toBe(lift(SHARED, 'shared', n))
    }
  })

  it('the subtype list matches, including `action`', () => {
    // ⚠️ `action` was added after the module failed its own headline example —
    // "I stopped doing these 5 things" produced no claim at all. It is 21 of 57
    // claims, so an edge missing it would be blind to a third of them.
    for (const src of [EDGE, SHARED]) {
      expect(src).toMatch(/'ownership', 'use', 'purchase', 'experience', 'result', 'history', 'relationship',/)
      expect(src).toMatch(/'action',/)
    }
  })

  it('the abstract-possession list matches, or one side asks about "my goals"', () => {
    const set = (s: string) => s.slice(s.indexOf('ABSTRACT_POSSESSIONS'), s.indexOf('])', s.indexOf('ABSTRACT_POSSESSIONS')))
      .match(/'[a-z]+'/g)
    expect(set(EDGE)).toEqual(set(SHARED))
  })
})

describe('the mode it runs in is pinned, because it is a product decision', () => {
  it('production applies SAFE_ERASURE and nothing else', () => {
    // ⚖️ TWO DECISIONS, ONE SETTLED. 26 of 57 claims are removable without
    // changing meaning — 0.117 rewrites/script, no questions, and no
    // PERSONALITY_LOSS or PREMISE_DEPENDENT claim silently changed. That is an
    // immediate truthfulness gain that cannot flatten the writing.
    expect(EDGE).toMatch(/const csMode: CreatorStateMode = 'safe_rewrite'/)
    expect(EDGE).toMatch(/event: 'creator_state_observed'/)
    // …and the rewrite is actually applied, not merely computed.
    expect(EDGE).toMatch(/\(raw as \{ line\?: string \}\)\.line = after/)
  })

  it('the mode is NOT enforce, and that is a product decision', () => {
    // ⚠️ `enforce` is not a stronger `safe_rewrite`. It is a different product
    // contract — Twin may interrupt generation when personal truth is required.
    // On a cohort grounding 0 of 57 because the supply is coverage-only, that
    // would ask 0.14 questions per script for reasons that are upstream.
    expect(EDGE).not.toMatch(/const csMode: CreatorStateMode = 'enforce'/)
  })

  it('shadows what full enforcement WOULD have done', () => {
    expect(EDGE).toMatch(/shadow_enforce_action/)
    expect(EDGE).toMatch(/rewrite_before/)
    expect(EDGE).toMatch(/rewrite_after/)
  })

  it('counts premise contamination separately from isolated claims', () => {
    // ⚠️ "I stopped doing these 5 things" is not one bad beat — the five items
    // that follow depend on it. No post-writer guard can elegantly repair a
    // concept whose premise is false, so this is the evidence for an upstream
    // concept-entitlement check.
    expect(EDGE).toMatch(/premise_contaminated/)
    expect(EDGE).toMatch(/premise: safety === 'PREMISE_DEPENDENT' \|\| i === 0/)
  })

  it('records the reference, so autobiography inherited from it is findable', () => {
    // "5 things I stopped doing" adapted verbatim would mean the fabrication is
    // a reference-transfer problem, not a writer problem.
    expect(EDGE).toMatch(/reference: typeof reference_url === 'string'/)
  })

  it('logs what each mode WOULD do, which is the point of shadow mode', () => {
    for (const f of ['would_allow', 'would_rewrite', 'would_ask']) {
      expect(EDGE, f).toContain(f)
    }
    // The split that decides deployment: caption-only creators should ground
    // far less than transcript-rich ones.
    expect(EDGE).toMatch(/knowledge_stated: csItems\.filter/)
  })

  it('observation may never break a paid generation', () => {
    const block = EDGE.slice(EDGE.indexOf('CREATOR-STATE: SAFE REWRITES APPLIED'))
    expect(block.slice(0, block.indexOf('substanceIssues(declared')))
      .toMatch(/catch \(err\) \{[\s\S]{0,200}creator_state_observe_failed/)
  })
})

// ── THE COLLISION THAT WOULD HAVE SHIPPED GREEN ──────────────────────────────
describe('the inlined names do not collide with the edge', () => {
  it('keeps `entityEvidence` distinct from the edge local of the same name', () => {
    // ⚠️ THE EDGE ALREADY HAD `const entityEvidence = ownedEntity?.evidence` —
    // a VALUE. Inlining a function of that name meant the call site resolved to
    // the const and threw "not a function" at runtime. Deno deploys without a
    // typecheck here, so it would have shipped green and 500'd on first use:
    // the same shape as the `kRows` temporal-dead-zone near-miss.
    expect(EDGE).toMatch(/function csEntityEvidence\(/)
    expect(EDGE).toMatch(/const ev = csEntityEvidence\(/)
    // The pre-existing local is untouched.
    expect(EDGE).toMatch(/const entityEvidence = \(ownedEntity as/)
  })

  it('declares each inlined identifier exactly once', () => {
    for (const n of ['creatorStateClaim', 'csEntityEvidence', 'rewriteSafety', 'creatorStateAction',
      'namesSameThing', 'POSSESSIVE', 'ENTITY_STOP', 'ABSTRACT_POSSESSIONS', 'OWNING_RELATIONSHIPS']) {
      const decls = EDGE.match(new RegExp(`(?:^|\\s)(?:const|let|function|type|interface)\\s+${n}\\b`, 'g')) ?? []
      expect(decls.length, `${n} declared ${decls.length}x`).toBe(1)
    }
  })
})
