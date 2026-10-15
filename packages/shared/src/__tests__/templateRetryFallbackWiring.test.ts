// TEMPLATE RETRY FALLBACK (2026-10-13). Since sprint templates went in, writer
// attempt 0 runs close to its 75s ceiling; when both attempts time out the run
// fails. The retry (attempt index >= 1) is sent the plain brief WITHOUT the
// template block, and the blueprint records the fallback (ids only) with the
// template checks skipped. The edge cannot be imported here, so this reads it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('the writer retry drops the template block', () => {
  it('builds the retry brief from the plain hook rule, not the one carrying the template block', () => {
    expect(EDGE).toMatch(/const familyHookRulePlain = renderFamilyHookRule\(family\)\n/)
    expect(EDGE).toMatch(/const familyHookRule = familyHookRulePlain \+ \(templatePlan \? `\\n\\n\$\{renderTemplateBlock\(/)
    expect(EDGE).toMatch(/const userPrompt = buildWriterBrief\(familyHookRule\)/)
    expect(EDGE).toMatch(/retryPrompt: buildWriterBrief\(familyHookRulePlain\)/)
    // the brief interpolates only its argument, never the template-carrying rule
    const brief = EDGE.slice(EDGE.indexOf('const buildWriterBrief'), EDGE.indexOf('const userPrompt = buildWriterBrief'))
    expect(brief).toContain('${hookRule}')
    expect(brief).not.toContain('${familyHookRule}')
    expect(brief).not.toContain('renderTemplateBlock')
  })

  it('only trial runs with a template get a ladder', () => {
    expect(EDGE).toMatch(/const writerLadder: WriterLadder \| undefined = trialOn && templatePlan\n/)
  })

  it('the attempt loop sends the retry prompt on attempt index >= 1 and keeps the timeouts', () => {
    expect(EDGE).toMatch(/const attemptPrompt = i >= 1 && ladder \? ladder\.retryPrompt : prompt/)
    expect(EDGE).toMatch(/callOnce\(apiKey, system, attemptPrompt, a\.model/)
    expect(EDGE).toMatch(/\{ model, thinkBudget, timeoutMs: 75_000 \}/)
    expect(EDGE).toMatch(/\{ model: fallbackModel, thinkBudget: 0, timeoutMs: 55_000 \}/)
  })

  it('records the fallback (ids only) and skips template checks for that script', () => {
    expect(EDGE).toMatch(/template = \{ id: templatePlan\.template\.id, fallback: 'retry_without_template' \}/)
    expect(EDGE).toMatch(/if \(trialOn && templatePlan && !templateFallback && blueprint && typeof blueprint === 'object'\) \{\n\s+try \{\n\s+const bpt = blueprint/)
    expect(EDGE).toMatch(/event: 'script_template_retry_fallback'/)
  })
})

// A behavioural model of the ladder with made-up fixtures: the same rule the
// edge applies, run on a fake two-attempt call.
describe('ladder behaviour (fixture model)', () => {
  const TEMPLATE_BLOCK = 'SCRIPT TEMPLATE: fixture-block'
  const plain = 'HOOK RULE fixture'
  const withTemplate = `${plain}\n\n${TEMPLATE_BLOCK}`
  function run(failFirst: boolean) {
    const seen: string[] = []
    const ladder: { retryPrompt: string; usedAttempt?: number } = { retryPrompt: plain }
    for (let i = 0; i < 2; i++) {
      const attemptPrompt = i >= 1 ? ladder.retryPrompt : withTemplate
      seen.push(attemptPrompt)
      if (i === 0 && failFirst) continue
      ladder.usedAttempt = i
      break
    }
    const bp: Record<string, unknown> = {}
    if ((ladder.usedAttempt ?? 0) >= 1) bp.template = { id: 't1_fixture', fallback: 'retry_without_template' }
    return { seen, bp }
  }
  it('retry brief excludes the template block and the record marks the fallback', () => {
    const r = run(true)
    expect(r.seen[0]).toContain(TEMPLATE_BLOCK)
    expect(r.seen[1]).not.toContain(TEMPLATE_BLOCK)
    expect(r.bp.template).toEqual({ id: 't1_fixture', fallback: 'retry_without_template' })
  })
  it('a first-attempt success records no fallback', () => {
    expect(run(false).bp.template).toBeUndefined()
  })
})
