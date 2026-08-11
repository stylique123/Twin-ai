// THE READINESS RULES EXIST TWICE, AND THE ONE THAT RUNS IS THE INLINED ONE.
//
// `generate-blueprint` cannot import @twinai/shared on Deno deploy, so the
// per-video requiredness rules live in `generationReadiness.ts` where their 23
// tests are, and again inside the edge function where they decide whether a
// creator is charged. This asserts the second is the first.
//
// ⚠️ AND IT ASSERTS PLACEMENT, WHICH IS HALF THE CONTRACT. A readiness check
// below `spend_credits` still takes the money and then asks the questions —
// which is the exact behaviour the owner rejected: "billing them for
// discovering your own missing inputs".
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const SHARED = readFileSync(join(REPO, 'packages/shared/src/generationReadiness.ts'), 'utf8')
const WEB = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')

describe('readiness runs BEFORE the money moves', () => {
  it('the check sits above spend_credits, not below it', () => {
    const check = EDGE.indexOf('READINESS: CAN WE WRITE THIS CONFIDENTLY')
    const spend = EDGE.indexOf("admin.rpc('spend_credits'")
    expect(check).toBeGreaterThan(-1)
    expect(spend).toBeGreaterThan(-1)
    expect(check).toBeLessThan(spend)
  })

  it('refuses with a code and NO charge, the way the reference stop does', () => {
    expect(EDGE).toMatch(/code: 'READINESS_INCOMPLETE'/)
    expect(EDGE).toMatch(/readiness_incomplete/)
    // The copy must say nothing was charged; a refusal that reads like a
    // failure sends the creator to retry the thing that will refuse again.
    expect(EDGE).toMatch(/no remix is used for this/i)
  })

  it('caps the ask at three, ordered by what unblocks the most', () => {
    for (const src of [EDGE, SHARED]) {
      expect(src).toMatch(/'goal', 'offer', 'angle', 'relationship', 'cta', 'claims'/)
      expect(src).toMatch(/\.slice\(0, 3\)/)
    }
  })
})

describe('requiredness is PER VIDEO, in both copies', () => {
  it('promoting means an offer was named OR the goal is a sale', () => {
    // ⚠️ The half that matters: without it, "make a video selling this" with an
    // empty offer field reads as non-commercial and sails through to a script
    // that invents what is being sold.
    expect(EDGE).toMatch(/readyPromoting = readyPresent\(readyOffer\) \|\| readyCommercial/)
    expect(SHARED).toMatch(/promoting = present\(input\.offer\) \|\| commercial/)
  })

  it('a non-promoting video is never asked for offer, relationship or claims', () => {
    // The questionnaire this exists to avoid. Each edge check is gated on
    // `readyPromoting`, so an explainer skips all three.
    for (const field of ['readyOffer', 'readyRel']) {
      expect(EDGE).toMatch(new RegExp(`readyPromoting && [^\\n]*${field}`))
    }
    expect(EDGE).toMatch(/readyPromoting && readyFacts\.length === 0/)
  })

  it('the CTA is only required for a commercial video', () => {
    expect(EDGE).toMatch(/readyCommercial && !readyPresent\(answers\.cta/)
  })

  it('both read composite goals by containment, not equality', () => {
    // Real onboarding answers are sentences: "leads+authority". An equality
    // test silently reads that as non-commercial.
    expect(EDGE).toMatch(/includes\('sell'\) \|\| .*includes\('leads'\)/)
    expect(SHARED).toMatch(/COMMERCIAL_GOALS\].some\(\(g\) => goal\.includes\(g\)\)/)
  })

  it('an empty product-fact list is a real answer and does not satisfy claims', () => {
    // The exact state that produced the invented product facts.
    expect(EDGE).toMatch(/readyFacts\.length === 0/)
    expect(SHARED).toMatch(/input\.productFacts != null && input\.productFacts\.length > 0/)
  })

  it('the relationship accepts EITHER authority, so an affiliate is not re-asked', () => {
    // `product_entities` only carries the creator's OWN product; a tie to
    // somebody else's is recorded on the brief as `promotes`.
    expect(EDGE).toMatch(/ownedEntity\?\.relationship \?\? brief\.promotes/)
  })
})

describe('the answers have a reader, and the right ones persist', () => {
  it('the client renders the questions and can submit them', () => {
    expect(WEB).toMatch(/READINESS_INCOMPLETE_CODE/)
    expect(WEB).toMatch(/setAskQuestions/)
    expect(WEB).toMatch(/readiness_answers: answersRef\.current/)
  })

  it('a retry re-arms the build, or the answers are collected and never sent', () => {
    expect(WEB).toMatch(/started\.current = false/)
    expect(WEB).toMatch(/setRetryNonce\(\(n\) => n \+ 1\)/)
    expect(WEB).toMatch(/\}, \[retryNonce\]\)/)
  })

  it('every question must be answered before the retry is allowed', () => {
    // Each one is present because guessing it would put a claim in the
    // creator's mouth, so a partial answer returns to the same refusal.
    expect(WEB).toMatch(/disabled=\{askQuestions\.some\(\(q\) => !\(askAnswers\[q\.field\] \?\? ''\)\.trim\(\)\)\}/)
  })

  it('persists what is true of the CREATOR and nothing that is true of this video', () => {
    // ⚖️ goal/angle/cta legitimately differ per video — the same voice makes
    // awareness videos AND sell videos — so persisting them would make the next
    // build inherit the wrong answer silently.
    const block = EDGE.slice(EDGE.indexOf('PERSIST WHAT IS TRUE OF THE CREATOR'), EDGE.indexOf('Spend credits atomically'))
    expect(block).toMatch(/stable\.offer/)
    expect(block).toMatch(/stable\.promotes/)
    expect(block).toMatch(/stable\.productFacts/)
    expect(block).not.toMatch(/stable\.goal/)
    expect(block).not.toMatch(/stable\.angle/)
    expect(block).not.toMatch(/stable\.cta/)
  })

  it('a failed persist never fails the build', () => {
    // The answers are already in hand for THIS generation; refusing a paid
    // build because a convenience write missed is the worse trade.
    expect(EDGE).toMatch(/readiness_answers_not_persisted/)
  })
})
