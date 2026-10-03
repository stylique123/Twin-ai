// OFF-PURPOSE IS NOT UNTRUE.
//
// ⚠️ BATCH part-3-product, 2026-10-03, goal=entertain. beat_trace read: writer
// 6 beats / 128 words → claim_checks 6 beats / 0 words → shipped 21 words. The
// edge logged `entitlement_blocked` with `available_evidence: null` on an
// account holding 58 facts (16 excluded, 13 sensitive). The per-goal purpose
// rule had held her facts back from the WRITER, and the claim check read the
// same reduced list — so it checked every line against nothing.
//
// ⚖️ TWO FIXES, BOTH PINNED HERE: the entitlement evidence is every usable
// fact (not just what the writer was shown), and a `discussion` line — naming
// a subject, which anyone may do — is never blocked for want of evidence. An
// invented personal history is still blocked.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { checkEntitlement } from '../claimEntitlement'
import { claimStrength } from '../claimStrength'
import { evidenceLevel } from '../knowledgeResolver'
import type { KnowledgeItem } from '../creatorKnowledge'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

function inlineEntitlement() {
  const start = EDGE.indexOf('// ENTITLEMENT — DO WE HAVE THE RIGHT TO SAY THIS, IN THIS WAY?')
  const end = EDGE.indexOf('// ── AN INVENTED COMPARATIVE PRODUCT CLAIM ─', start)
  const js = transformSync(EDGE.slice(start, end), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function('claimStrength', 'evidenceLevel', `${js}; return { entitlementFailures }`)(
    claimStrength, evidenceLevel,
  ) as { entitlementFailures: (beats: unknown, supplied: readonly KnowledgeItem[]) => Array<{ index: number }> }
}

const item = (kind: string, basis: string, text: string): KnowledgeItem =>
  ({ kind, basis, text } as unknown as KnowledgeItem)

// Entertain-style beats: naming the subject, no personal claim.
const ENTERTAIN = [
  'Nobody warns you what happens when the cat finds the bubble wrap.',
  'Three seconds of silence, then total chaos.',
  'This is the part where everything goes sideways.',
]
const INVENTED = 'I bought three of these last year and returned every one.'

describe('an entertain script whose facts are all off-purpose', () => {
  const { entitlementFailures } = inlineEntitlement()

  it('keeps every discussion beat even with NO evidence supplied', () => {
    for (const l of ENTERTAIN) expect(claimStrength(l), l).toBe('discussion')
    expect(entitlementFailures(ENTERTAIN.map((line) => ({ line })), [])).toEqual([])
    for (const l of ENTERTAIN) expect(checkEntitlement(l, []).entitled, l).toBe(true)
  })

  it('still blocks an invented personal history with nothing on record', () => {
    expect(entitlementFailures([{ line: INVENTED }], []).map((f) => f.index)).toEqual([0])
    expect(checkEntitlement(INVENTED, []).entitled).toBe(false)
  })

  it('still blocks it when only coverage or opinion is on record', () => {
    const thin = [item('covered', 'demonstrated', 'bubble wrap'), item('opinion', 'stated', 'cats are chaos')]
    expect(entitlementFailures([{ line: INVENTED }], thin)).toHaveLength(1)
  })

  it('an off-purpose stated experience licenses the line it supports', () => {
    const offPurpose = [item('experience', 'stated', 'returned three of these last year')]
    expect(entitlementFailures([{ line: INVENTED }], offPurpose)).toEqual([])
  })
})

describe('the edge feeds the entitlement check every usable fact', () => {
  const pool = () => EDGE.slice(EDGE.indexOf('const entitlementPool'), EDGE.indexOf("event: 'knowledge_off_purpose'"))

  it('collects the pool BEFORE the purpose rule drops a row', () => {
    const block = pool()
    expect(block.indexOf('entitlementPool.push(r)')).toBeGreaterThan(-1)
    expect(block.indexOf('entitlementPool.push(r)')).toBeLessThan(block.indexOf('servesObjective('))
  })

  it('keeps excluded, sensitive and inferred rows out of the pool', () => {
    const block = pool()
    expect(block).toMatch(/row\.sensitive !== true/)
    expect(block).toMatch(/!row\.creator_excluded_at/)
    expect(block).toMatch(/!excludedIds\.has/)
    expect(block).toMatch(/row\.basis !== 'inferred'/)
  })

  it('every entitlement check reads entitlementEvidence, never the writer-only list', () => {
    expect(EDGE).toMatch(/const entitlementEvidence = asSubstance\(\[\.\.\.speakable, \.\.\.entitlementPool\]\)/)
    expect(EDGE).not.toMatch(/entitlementFailures\([^\n]*suppliedForCheck\)/)
    expect(EDGE).toMatch(/available_evidence: bestAvailableLevel\(entitlementEvidence\)/)
  })

  it('rewrites rather than hollows out a script the checks would halve', () => {
    const at = EDGE.indexOf("event: 'entitlement_safe_rewrite'")
    expect(at).toBeGreaterThan(-1)
    expect(EDGE.slice(at - 4000, at)).toMatch(/surviving < total \* 0\.5/)
    expect(at).toBeLessThan(EDGE.indexOf("event: 'entitlement_unrepaired'"))
  })
})
