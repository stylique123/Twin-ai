// AN ARM RECORDED ONLY BY ITS MODEL ID DESCRIBES A CONFIGURATION IT MAY NOT HAVE RUN.
//
// ⚠️ `thinkingBudget: undefined` IS NOT "THE MODEL'S DEFAULT". gemini.ts:44
// resolves an absent budget to GEMINI_THINKING_BUDGET or 2048, so passing
// nothing silently buys 2048 tokens of reasoning. The first version of this eval
// did exactly that for both arms — which would have measured Flash-Lite made
// expensive and reported it as the cheapest viable extraction path.
//
// ⚖️ THE ASYMMETRY IS DELIBERATE AND MUST STAY VISIBLE. Arm A reproduces
// production, whatever production does. Arm B is the CHEAPEST VIABLE path,
// because the question is not "does the cheap model match when given the same
// help" but "is the premium buying anything at 2,647-URL scale".

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const JOB = readFileSync(join(REPO, 'worker/src/jobs/extractionParity.ts'), 'utf8')
const GEMINI = readFileSync(join(REPO, 'worker/src/gemini.ts'), 'utf8')
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/0155_two_models_one_transcript.sql'), 'utf8')

describe('the thinking budget is part of the arm', () => {
  it('is why absent cannot be treated as default — the provider resolves it to 2048', () => {
    // If this line ever changes so that absent really does mean the model's own
    // default, this test should be revisited rather than deleted: the reason for
    // naming the budget explicitly would have gone away.
    expect(GEMINI).toMatch(/thinkingBudget \?\? Number\(process\.env\.GEMINI_THINKING_BUDGET \?\? '2048'\)/)
  })

  it('gives arm B ARM A’S budget by default — the first trial isolates the model', () => {
    // ⚠️ THIS ASSERTION WAS REVERSED ON 2026-08-21, DELIBERATELY. It used to
    // require arm B to default to 0 (the cheapest viable path), which answered
    // "is the premium buying anything" but confounded the model with its
    // configuration. The first parity trial must vary ONE thing. The reason for
    // naming budgets explicitly is unchanged and still load-bearing — absent is
    // not "default", it is 2048 — only the default for arm B moved.
    expect(JOB).toContain("typeof p.thinkingBudgetB === 'number' ? p.thinkingBudgetB : thinkingA")
    expect(JOB).not.toContain("? p.thinkingBudgetB : 0")
  })

  it('leaves arm A absent on purpose, because that IS production', () => {
    expect(JOB).toContain("typeof p.thinkingBudgetA === 'number' ? p.thinkingBudgetA : undefined")
  })

  it('passes each arm its own budget rather than a shared one', () => {
    expect(JOB).toContain('runArm(modelA, text, url, thinkingA)')
    expect(JOB).toContain('runArm(modelB, text, url, thinkingB)')
  })

  it('records both budgets, so the comparison never has to be inferred later', () => {
    expect(JOB).toContain('thinking_budget_a: thinkingA ?? null, thinking_budget_b: thinkingB')
    expect(MIGRATION).toContain('thinking_budget_a integer')
    expect(MIGRATION).toContain('thinking_budget_b integer')
  })
})

describe('the eval asks production’s exact question', () => {
  it('imports the prompt, schema and vocabulary rather than copying them', () => {
    expect(JOB).toContain("from './assessReference.js'")
    expect(JOB).toContain('SYSTEM, SCHEMA, VOCAB, MAX_TRANSCRIPT_CHARS')
  })

  it('runs the arms in sequence so a quota refusal is attributable', () => {
    expect(JOB.indexOf('runArm(modelA')).toBeLessThan(JOB.indexOf('runArm(modelB'))
    expect(JOB).not.toContain('Promise.all')
  })

  it('digests the text the models actually saw, after the cap', () => {
    expect(JOB).toContain('const text = full.slice(0, MAX_TRANSCRIPT_CHARS)')
    // ⚠️ THE DIGEST OF THE TEXT, NOT ANY createHash CALL. `digestOf` now hashes
    // the prompt and schema at module level, so matching the bare constructor
    // matched that instead — the test would have passed with the transcript
    // digest taken anywhere at all.
    expect(JOB.indexOf('const text = full.slice'))
      .toBeLessThan(JOB.indexOf("createHash('sha256').update(text)"))
  })

  it('records a failed arm rather than dropping the trial', () => {
    expect(JOB).toContain('error_a: a.error, error_b: b.error')
  })
})
