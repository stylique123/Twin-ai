// THE SCAN-TARGET RULE EXISTS TWICE, AND THE ONE THAT RUNS IS THE WORKER'S.
//
// ⚠️ IT USED TO EXIST ONCE AND RUN NEVER. `packages/shared/scanTargetConfirmation.ts`
// shipped to production with 100 lines of tests and no importer anywhere in
// worker/, supabase/ or apps/ — so the defect it was written for stayed live the
// whole time the suite reported it covered. This file exists because the fix was
// to give it a reader, and a second copy without a parity check is how the
// reader quietly stops matching the rule.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assessScanTarget } from '../scanTarget.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SHARED = readFileSync(join(REPO, 'packages/shared/src/scanTargetConfirmation.ts'), 'utf8')
const WORKER = readFileSync(join(REPO, 'worker/src/scanTarget.ts'), 'utf8')

/** Lift a function body by name, so a drift is a failure and not a rewrite. */
function lift(src: string, where: string, name: string): string {
  const i = src.indexOf(`function ${name}(`)
  if (i < 0) throw new Error(`could not lift ${name} from ${where} — fix the marker, do not inline the text`)
  const end = src.indexOf('\n}\n', i)
  return src.slice(i, end).replace(/\s+/g, ' ').trim()
}

describe('worker ↔ shared scan-target parity', () => {
  it('the whole assessment is character-identical', () => {
    for (const fn of ['assessScanTarget', 'nameRelatesToHandle', 'creditsAnother', 'fold']) {
      expect(lift(WORKER, 'the worker', fn), fn).toBe(lift(SHARED, 'shared', fn))
    }
  })

  it('the suspicion codes are the same set, in the same order', () => {
    const codes = (s: string) => s.slice(s.indexOf('SUSPICION_CODES'), s.indexOf('] as const', s.indexOf('SUSPICION_CODES')))
      .match(/'[a-z_]+'/g)
    expect(codes(WORKER)).toEqual(codes(SHARED))
  })

  it('the worker deliberately does NOT carry mayBuildDnaFrom', () => {
    // ⚖️ THE GATE IS NOT WIRED, AND THAT IS THE DECISION, NOT AN OVERSIGHT.
    // `mayBuildDnaFrom` requires an explicit human confirmation; enabling it in
    // a flow with no confirmation step would stop every DNA build. It arrives
    // with the screen that lets a creator answer. If someone copies it here, they
    // are turning on a product behaviour and this test says so out loud.
    // Scoped to CODE, not commentary: the worker file names it in a header
    // explaining why it is absent, and a check that cannot tell an explanation
    // from an implementation would forbid documenting the decision.
    const code = WORKER.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    expect(code).not.toMatch(/mayBuildDnaFrom/)
    expect(SHARED).toMatch(/export function mayBuildDnaFrom/)
  })
})

describe('the real case this was written for', () => {
  it('flags the impostor CarterPCs channel without judging its size', () => {
    const a = assessScanTarget({
      requestedHandle: 'CarterPCs', resolvedHandle: 'five', displayName: 'five',
      audience: 146, postCount: 3,
      sampleTitle: 'I just want a PC from carter @actuallycarterpcs', missing: false,
    })
    expect(a.verdict).toBe('suspect')
    expect(a.codes).toContain('credits_another_account')
    expect(a.summary).toContain('@actuallycarterpcs')
  })

  it('does NOT flag a small honest account, which is the whole point', () => {
    // ⚖️ "Small means wrong" would refuse the people this product exists for.
    expect(assessScanTarget({
      requestedHandle: 'newcreator', resolvedHandle: 'newcreator', displayName: 'New Creator',
      audience: 12, postCount: 4, sampleTitle: 'my first video', missing: false,
    }).verdict).toBe('plausible')
  })

  it('treats an unread audience as unread, not as zero', () => {
    const a = assessScanTarget({
      requestedHandle: 'johnny', resolvedHandle: 'johnny', displayName: 'Johnny',
      audience: null, postCount: null, sampleTitle: null, missing: false,
    })
    expect(a.summary).toContain('audience not read')
    expect(a.codes).not.toContain('no_posts')
  })
})
