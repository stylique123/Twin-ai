// The edge wiring of the quality profile and the Quality Controller (plan v6.8 §33).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const EDGE = readFileSync(join(ROOT, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const WORKER = readFileSync(join(ROOT, 'worker/src/jobs/inventionRecheck.ts'), 'utf8')
const after = (needle: string, n: number) => { const i = EDGE.indexOf(needle); expect(i).toBeGreaterThan(0); return EDGE.slice(i, i + n) }

describe('quality profile + QC disconnect', () => {
  it('the profile is resolved from identity (test accounts) and the request field, with a kill switch', () => {
    expect(EDGE).toContain("resolveQualityProfile({ testAccount: isHeartbeat, requested: (body as { quality_profile?: unknown } | undefined)?.quality_profile, kill: Deno.env.get('QUALITY_PROFILE') })")
  })

  it('the thin-material answer is saved through the EXISTING angle-answer store, test accounts only', () => {
    const block = after('if (qualityProfile()) {\n      for (const qa of qcAnswersToStore(', 700)
    expect(block).toContain('await storeAngleAnswer(admin, user, { key: qa.key, piece: qa.piece, answer: qa.answer }, pidQ)')
    // The angle_answer mode and the QC share one store; it is the answerFactRow insert.
    expect(EDGE).toContain('const { outcome, saved } = await storeAngleAnswer(sb, user, b, pid)')
    const store = after('async function storeAngleAnswer(', 2600)
    // Plan v7.1 Q3: saved under her ready voice so the writer's voice-scoped read sees it.
    expect(store).toContain('answerFactRow({ ownerId: user.id, voiceId: gate ? await readyVoiceId(sb, user.id) : null, productId: pid, key, piece, answer: herAnswer')
    expect(store).toContain("await sb.from('creator_knowledge').insert({ ...row, sensitive: gate?.sensitive === true })")
    expect(store).toContain('gateAnswer(herAnswer')
  })

  it('the worker runs the QC last, only when the edge put quality_controller on the job', () => {
    expect(EDGE).toContain(".quality_controller = {")
    expect(EDGE).toContain("if (qFlag('QUALITY_CONTROLLER') === 'on') {")
    const i = WORKER.indexOf("applyQualityController(bp, extra, ledger, products, target, generationId)\n  bp.gate_progress = gateProgress('done'")
    expect(i).toBeGreaterThan(0)
    expect(WORKER).toContain("if (!q || typeof q !== 'object' || !Array.isArray(bp.script)) return")
  })

  it('with the gate off, the QC runs on the edge for full_stack only', () => {
    const block = after("else if (qualityProfile() === 'full_stack' && qFlag('QUALITY_CONTROLLER') === 'on'", 3000)
    expect(block).toContain('runQualityController({')
    expect(block).toContain('bpq.qc_report = qc.report')
  })
})
