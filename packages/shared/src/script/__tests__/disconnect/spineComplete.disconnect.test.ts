// DISCONNECT TEST, ledger rows SPINE_COMPLETE and POLISH_REORDER (craft rubric v1 C/F).
// Fictional material only. No model call. Flag off = byte-identical script.
import { describe, it, expect } from 'vitest'
import { completeSpine, reorderEnding, spineCompleteOn, polishReorderOn, missingProblemQuestion, problemAnswerItem } from '../../planner/spineComplete'
import { EDGE, readRepo, edgeAfter } from './edge'

const WORKER = readRepo('worker/src/jobs/inventionRecheck.ts')
const script = [
  { section: 'hook', line: 'How fresh are your coffee beans, really?' },
  { section: 'body', line: 'Grab a bag, link in bio.' },
  { section: 'body', line: 'Each bag has the roast date written on the label by hand.' },
]
const material = [{ id: 'story:2', text: 'A regular told me her beans tasted flat after a week, and she kept them in the fridge next to the onions.' }]
const offer = { id: 'offer:harbor', text: 'Harbor Blend, link in bio' }

/** Mirrors the edge: the step runs only when the gate is on. */
const edgeStep = (flag: string | undefined, test = true) => {
  const bp = { script: script.map((b) => ({ ...b })) } as Record<string, unknown>
  if (spineCompleteOn(true, test, flag)) { const sc = completeSpine(bp.script as never, { material, offer, topic: 'coffee beans' }); bp.script = sc.script; bp.spine_complete = sc.record }
  return JSON.stringify(bp)
}
const workerStep = (reorder: boolean) => {
  const bp = { script: script.map((b) => ({ ...b })) } as Record<string, unknown>
  if (reorder) bp.script = reorderEnding(bp.script as never).next
  return JSON.stringify(bp)
}
const original = JSON.stringify({ script })

describe('SPINE_COMPLETE disconnect', () => {
  it('flag off (unset, off, non-test account) is byte-identical; on changes the script', () => {
    expect(edgeStep(undefined)).toBe(original)
    expect(edgeStep('off')).toBe(original)
    expect(edgeStep('on', false)).toBe(original)
    expect(edgeStep('on')).not.toBe(original)
  })
  it('the edge gates on SPINE_COMPLETE for test accounts and calls completeSpine', () => {
    expect(EDGE).toContain("spineCompleteOn(trialOn, isHeartbeat, Deno.env.get('SPINE_COMPLETE'))")
    expect(edgeAfter("spineCompleteOn(trialOn, isHeartbeat, Deno.env.get('SPINE_COMPLETE'))", 6000)).toContain('completeSpine(bps.script')
  })
})

describe('POLISH_REORDER disconnect', () => {
  it('flag off is byte-identical; on reorders', () => {
    expect(polishReorderOn(true, true, undefined)).toBe(false)
    expect(workerStep(polishReorderOn(true, true, undefined))).toBe(original)
    expect(workerStep(polishReorderOn(true, true, 'on'))).not.toBe(original)
  })
  it('the edge hands reorder to the worker only behind POLISH_REORDER; the worker checks before applying', () => {
    expect(EDGE).toContain("...(polishReorderOn(trialOn, isHeartbeat, Deno.env.get('POLISH_REORDER')) ? { reorder: true } : {})")
    expect(WORKER).toContain('if (polishOpts.reorder === true && Array.isArray(bp.script))')
    expect(WORKER).toContain('reorderEnding(before)')
    expect(WORKER).toContain('reorderCheck(before, ro.next)')
    expect(WORKER).toContain('polishFactChecks(said(before), said(ro.next as PolishBeat[]), material)')
  })
})

describe('missing_problem question disconnect', () => {
  it('flag off: no question, no answer used (byte-identical)', () => {
    const noProblem = [{ section: 'hook', line: 'How fresh are your coffee beans, really?' }, { section: 'cta', line: 'Grab a bag, link in bio.' }]
    const run = (flag: string | undefined) => {
      const bp = { script: noProblem.map((b) => ({ ...b })) } as Record<string, unknown>
      if (spineCompleteOn(true, true, flag)) {
        const input = { material: [], offer, topic: 'coffee beans', problemAnswer: problemAnswerItem('My buyers never know when their beans were roasted.') }
        const q = missingProblemQuestion(bp.script as never, { ...input, problemAnswer: null })
        if (q) bp.gate_questions = [q]
        bp.script = completeSpine(bp.script as never, input).script
      }
      return JSON.stringify(bp)
    }
    expect(run(undefined)).toBe(JSON.stringify({ script: noProblem }))
    expect(run('on')).not.toBe(JSON.stringify({ script: noProblem }))
  })
  it('the edge asks through gate_questions and stores her answer through answerFactRow, inside the SPINE_COMPLETE gate', () => {
    const block = edgeAfter("spineCompleteOn(trialOn, isHeartbeat, Deno.env.get('SPINE_COMPLETE'))", 6000)
    expect(block).toContain('missingProblemQuestion(bps.script')
    expect(block).toContain('bps.gate_questions = mergeQuestions(prior, [askProblem])')
    expect(block).toContain("answerFactRow({ ownerId")
    expect(block).toContain("key: 'spine:problem'")
    expect(block).toContain('gateAnswer(problemAnswer.text')
  })
})
