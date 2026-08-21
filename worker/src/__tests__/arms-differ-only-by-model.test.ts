// A TRIAL WHOSE ARMS DIFFER IN MORE THAN THE MODEL CANNOT ANSWER THE QUESTION.
//
// ⚠️ THE FIRST VERSION OF THIS EVAL GAVE ARM B A THINKING BUDGET OF 0 while arm
// A inherited production's 2048. That was a deliberate choice — "is the premium
// buying anything" — and still the wrong FIRST experiment, because it confounded
// the model with its configuration. Isolate the model id first; vary
// configuration in a second trial only if the first one loses.
//
// ⚖️ AND THE HARNESS REFUSES RATHER THAN WARNS. A warning on a batch job is read
// by nobody, and the resulting numbers look exactly like valid ones.

import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const load = async () => await import('../jobs/extractionParity.js')

const cfg = (over: Record<string, unknown> = {}) => ({
  thinkingBudget: undefined as number | undefined,
  timeoutMs: 90_000,
  systemSha: 'aaaa', promptSha: 'bbbb', schemaSha: 'cccc',
  ...over,
})

describe('the first parity trial isolates the model id', () => {
  it('accepts arms identical in everything but the model', async () => {
    const { assertArmsDifferOnlyByModel } = await load()
    expect(() => assertArmsDifferOnlyByModel('pro', 'lite', cfg(), cfg(), false)).not.toThrow()
  })

  it('REFUSES a different thinking budget — the exact confound that was built first', async () => {
    const { assertArmsDifferOnlyByModel } = await load()
    expect(() => assertArmsDifferOnlyByModel('pro', 'lite', cfg(), cfg({ thinkingBudget: 0 }), false))
      .toThrow(/thinkingBudget/)
  })

  it('refuses a different timeout, prompt, system instruction or schema', async () => {
    const { assertArmsDifferOnlyByModel } = await load()
    for (const [k, v] of [['timeoutMs', 1], ['promptSha', 'x'], ['systemSha', 'x'], ['schemaSha', 'x']] as const) {
      expect(() => assertArmsDifferOnlyByModel('pro', 'lite', cfg(), cfg({ [k]: v }), false),
        `${k} must be refused`).toThrow(new RegExp(k))
    }
  })

  it('refuses a model compared against itself', async () => {
    const { assertArmsDifferOnlyByModel } = await load()
    // ⚠️ NOT A HARMLESS NO-OP. A self-trial would report ~100% agreement and
    // read exactly like a passing parity result.
    expect(() => assertArmsDifferOnlyByModel('pro', 'pro', cfg(), cfg(), false)).toThrow(/measures nothing/)
    // and the escape hatch does NOT excuse it
    expect(() => assertArmsDifferOnlyByModel('pro', 'pro', cfg(), cfg(), true)).toThrow(/measures nothing/)
  })

  it('permits asymmetry ONLY when it is asked for on purpose', async () => {
    const { assertArmsDifferOnlyByModel } = await load()
    expect(() => assertArmsDifferOnlyByModel('pro', 'lite', cfg(), cfg({ thinkingBudget: 0 }), true))
      .not.toThrow()
  })

  it('says what to do rather than only that it refused', async () => {
    const { assertArmsDifferOnlyByModel } = await load()
    expect(() => assertArmsDifferOnlyByModel('pro', 'lite', cfg(), cfg({ thinkingBudget: 0 }), false))
      .toThrow(/allowAsymmetry/)
  })
})

describe('what the job does by default', () => {
  it('gives arm B arm A’s thinking budget rather than a cheaper one', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, join } = await import('node:path')
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'jobs', 'extractionParity.ts'), 'utf8')
    expect(src).toContain("? p.thinkingBudgetB : thinkingA")
    expect(src).not.toContain('? p.thinkingBudgetB : 0')
  })

  it('asserts before the download, not before the model call', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, join } = await import('node:path')
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'jobs', 'extractionParity.ts'), 'utf8')
    // An asymmetric trial that discovers itself after acquiring the video has
    // already spent the expensive part to learn something free.
    // ⚠️ THE CALL SITE, NOT THE IMPORT. The first version of this test compared
    // against `readCachedTranscript` anywhere in the file and so matched the
    // import line — it would have passed with the assertion in any position.
    expect(src.indexOf('assertArmsDifferOnlyByModel(modelA'))
      .toBeLessThan(src.indexOf('await readCachedTranscript(url)'))
  })
})
