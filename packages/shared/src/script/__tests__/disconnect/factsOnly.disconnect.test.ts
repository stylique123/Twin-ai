// FACTS_ONLY_WRITER disconnect (default OFF): every new branch on the edge and
// in the worker is behind the flag, and the worker runs the trace pass last.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
const EDGE = readFileSync(new URL('../../../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url), 'utf8')
const WORKER = readFileSync(new URL('../../../../../../worker/src/jobs/inventionRecheck.ts', import.meta.url), 'utf8')

describe('FACTS_ONLY_WRITER wiring', () => {
  it('the switch reads only the env value, through factsOnlyWriterOn, for trial accounts', () => {
    expect(EDGE).toContain("const factsOnlyNow = (): boolean => factsOnlyWriterOn(Deno.env.get('FACTS_ONLY_WRITER'), trialOn)")
  })
  it('every facts-only step on the edge sits behind factsOnlyNow()', () => {
    for (const needle of [
      'if (factsOnlyNow()) return factsOnlyKeepsRow(row as never, excludedIds)',
      "if (trialOn && !factsOnlyNow() && (ownedEntity || String(reference_note ?? '').trim())) {",
      'const factsOnlyAll = factsOnlyNow() && !chosenRows',
      'const uncapped = factsOnlyNow()',
      "if ((step === 'late_extend' || step === 'extension' || step === 'payoff_repair') && factsOnlyNow()) {",
      'if (Array.isArray(bpw.script) && !factsOnlyNow()) {',
      'if (trialOn && !factsOnlyNow() && spoken.length < floor',
      "if (factsOnlyNow() && blueprint && typeof blueprint === 'object' && Array.isArray((blueprint as { script?: unknown }).script)) {",
    ]) expect(EDGE).toContain(needle)
    // The stop-and-ask and the layers block.
    expect(EDGE.match(/if \(factsOnlyNow\(\)\) \{/g)?.length).toBe(2)
  })
  it('her gap answers are saved first, before the gap check reads what is closed', () => {
    const save = EDGE.indexOf("const r = await storeAngleAnswer(admin, user, { key, piece: kind === 'story' ? 'story' : kind, answer: v }, pidQ, { topicKey: key })")
    const check = EDGE.indexOf('const closedKeys = closedKeysFrom(')
    const decide = EDGE.indexOf('const d = decideFactsOnly(')
    expect(save).toBeGreaterThan(0)
    expect(save).toBeLessThan(check)
    expect(check).toBeLessThan(decide)
    // Saved once only: not again after the build.
    expect(EDGE.match(/topicKey: key \}\)/g)).toHaveLength(1)
  })
  it('the schema gains layer_tag and source_ids only when the facts-only block is in the brief, reset every request', () => {
    expect(EDGE).toContain('const schema = schema0 === blueprintSchema && factsOnlySchemaOn ? blueprintSchemaFactsOnly : schema0')
    expect(EDGE).toContain("factsOnlySchemaOn = factsOnlyBlock !== ''")
    expect(EDGE).toMatch(/setUrlSafeSplitting\(cleanupV1\)\n  factsOnlySchemaOn = false/)
  })
  it('both worker enqueues carry the facts-only extras, empty when off', () => {
    expect(EDGE.match(/Object\.assign\((?:inventionRecheck|rescueRecheck)\.ledger, factsOnlyGateExtras\(\)\)/g)).toHaveLength(2)
    expect(EDGE).toMatch(/const factsOnlyGateExtras = \(\): Record<string, unknown> => \(factsOnlyNow\(\)\n[\s\S]{0,600}: \{\}\)/)
  })
  it('Panel 14 wiring: the older panel story stop stands down for the gap layer; a rescued script carries the cleanup flag', () => {
    expect(EDGE).toContain('if (isPanel && !factsOnlyNow()) {')
    expect(EDGE).toMatch(/Object\.assign\(rescueRecheck\.ledger, factsOnlyGateExtras\(\)\)\n[\s\S]{0,200}if \(cleanupV1\) rescueRecheck\.ledger\.script_cleanup_v1 = true/)
  })
  it('the worker runs the trace pass last, only when the job says facts_only', () => {
    expect(WORKER).toContain("if (extra.facts_only !== true || !Array.isArray(bp.script)) return")
    expect(WORKER.match(/applyScriptCleanupV1\(bp, extra, ledger, products, generationId\)\n\s*applyFactsOnly\(bp, extra, ledger, generationId, products, target\)/g)).toHaveLength(2)
  })
  it('Panel 14 fixes: target product, strict hook, hooks traced and the cleanup run on the edge and in the worker', () => {
    for (const src of [EDGE, WORKER]) {
      expect(src).toContain('traceAndCut(')
      expect(src).toMatch(/strictHook: true/)
      expect(src).toMatch(/targetProductId: (?:foTarget|target), products(?:: foProducts(?:, profileTexts: foProfileTexts, priorLines: foPriorLines)?)? \}/)
      expect(src).toContain('const pol = polishFactsOnly(r.beats as Array<Record<string, unknown> & { line?: unknown }>)')
      expect(src).toContain('traceHooks((')
    }
  })
  it('Panel 14 fixes on the edge sit inside the facts-only block: rotation, repeated openings, thin stop', () => {
    const block = EDGE.slice(EDGE.indexOf("if (factsOnlyNow() && blueprint && typeof blueprint === 'object'"), EDGE.indexOf("traceBeats('shipped',"))
    expect(block).toContain('dropRepeatedOpening(')
    expect(block).toContain('suppliedKnowledgeIds = suppliedKnowledgeIds.filter((id) => usedIds.has(id))')
    expect(block).toContain("const thin = scriptThin(bpo.script as Array<{ line?: unknown }>)")
    expect(block).toContain("await refundOnce('facts_only_thin')")
    expect(block).toMatch(/code: 'NEEDS_STORY', check_status: 'needs_answers', facts_only: true, thin: true/)
    expect(EDGE).toContain('const foResting = factsOnlyNow() && !chosenRows ? restingStoryIds(')
    expect(EDGE).toContain("!foResting.has(String((k as { id?: unknown }).id ?? ''))")
    // compare-1: the named story is kept out of the resting set.
    expect(EDGE).toContain('restingStoryIds(kRows as Array<{ id?: unknown; kind?: unknown }>, recentStorySupply, STORY_KINDS, STORY_REST_AFTER, foKeep)')
    expect(EDGE).toMatch(/const foNamed = factsOnlyNow\(\) && !chosenRows\n\s*\? askedStory\(/)
    expect(WORKER).toContain('thin_after_worker')
    // compare-1 follow-up: profile notes and her last 3 scripts reach the edge trace.
    expect(EDGE).toContain('const foPriorLines = priorScripts.slice(0, 3)')
    expect(EDGE).toContain('const prior = priorScripts.map((sc) => openingOf(sc)).filter(Boolean)')
  })
})
