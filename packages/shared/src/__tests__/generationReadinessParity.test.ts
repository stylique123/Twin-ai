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
      expect(src).toMatch(/'goal', 'offer', 'angle', 'relationship', 'cta', 'claims', 'audience'/)
      expect(src).toMatch(/\.slice\(0, 3\)/)
    }
  })

  it('BOTH copies evaluate audience, which only one of them used to', () => {
    // ⚠️ THE SHARED RULE HAD THIS AND THE EDGE DID NOT. `assessReadiness` marks
    // audience MISSING_REQUIRED when no audience was given AND nothing was
    // learned about the creator. The edge evaluated six fields and never this
    // one — so the shared module blocked a case production charged for, with
    // its own tests asserting behaviour that did not exist downstream.
    //
    // ⚠️ AND IT STOPPED BEING HYPOTHETICAL. Until the scan was wired to store
    // caption knowledge, a creator whose audio upgrade never ran had an EMPTY
    // knowledge table. Empty table plus no audience answer is exactly this
    // branch: nothing known about who they are or who they talk to.
    expect(EDGE).toMatch(/readyMissing\.push\(\{ field: 'audience'/)
    expect(SHARED).toMatch(/put\('audience'/)
  })

  it('any creator knowledge at all satisfies audience, in both', () => {
    // ⚖️ A back catalogue infers an audience well enough — being wrong there
    // costs register, not truth. Requiring a stronger signal would ask almost
    // every creator a question the scan can already answer.
    expect(EDGE).toMatch(/const readyKnows = Array\.isArray\(knowledgeRows\) && knowledgeRows\.length > 0/)
    expect(SHARED).toMatch(/input\.hasCreatorKnowledge \? 'INFERRED_BUT_SAFE' : 'MISSING_REQUIRED'/)
  })

  it('reads the fetched rows, not the alias declared far below it', () => {
    // ⚠️ `kRows` is declared several hundred lines after the readiness block, so
    // referencing it there is a temporal-dead-zone crash at RUNTIME and not a
    // compile error — the kind of bug that ships green and 500s on first use.
    // Scoped to CODE, not commentary — the block names `kRows` in a comment
    // explaining why it is not used, and a check that cannot tell an
    // explanation from an implementation forbids documenting the decision.
    const block = EDGE.slice(EDGE.indexOf('READINESS: CAN WE WRITE'), EDGE.indexOf("admin.rpc('spend_credits'"))
    const code = block.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    expect(code).not.toMatch(/\bkRows\b/)
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
    expect(WEB).toMatch(/readiness_answers: readinessAnswers/)
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

// ── THE OTHER HALF OF THE ECONOMICS: A GENERATION THAT IS NOT WORTH CHARGING ──
describe('the quality gate returns the credit', () => {
  it('refunds rather than refusing, and still returns the script', () => {
    // ⚖️ Refusing after the spend hands the creator nothing for a wait they
    // already sat through. What changes is that they are not billed.
    expect(EDGE).toMatch(/generation_not_billable/)
    expect(EDGE).toMatch(/blueprint_refund_quality/)
    const gate = EDGE.indexOf('THE QUALITY GATE')
    const insert = EDGE.indexOf("from('generations')\n      .insert(")
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(insert)
  })

  it('records what was KEPT, not what was reserved', () => {
    // A row claiming a charge the ledger reversed makes every downstream count
    // wrong — revenue, remixes-used, the data room.
    expect(EDGE).toMatch(/credits_spent: unbillable \? 0 : BLUEPRINT_COST/)
  })

  it('refunds AT MOST ONCE, across all three paths', () => {
    // ⚠️ Three paths can now return the money — the quality gate, the
    // duplicate-key race and the catch — and two can run in the same request.
    // A double refund is a credit the creator never paid for.
    expect(EDGE).toMatch(/let refunded = false/)
    expect(EDGE).toMatch(/const refundOnce = async/)
    expect(EDGE).toMatch(/if \(refunded\) return\n\s*refunded = true/)
    // Neither legacy path may call the RPC unconditionally any more.
    expect(EDGE).toMatch(/refunded \? \{ error: null \} : await admin\.rpc\('refund_credits'[\s\S]{0,200}blueprint_refund_duplicate/)
    expect(EDGE).toMatch(/refunded \? \{ error: null \} : await admin\.rpc\('refund_credits'[\s\S]{0,200}'blueprint_refund'/)
  })

  it('detects our own asks by AUTHORSHIP, matching the shared module', () => {
    for (const src of [EDGE, SHARED]) {
      expect(src).toMatch(/this beat needs a real detail about your product/)
      expect(src).toMatch(/only you can supply this/)
    }
  })

  it('uses the same 40% density as the shared rule and the log line', () => {
    expect(EDGE).toMatch(/askedBeats \/ finalBeats\.length >= 0\.4/)
    expect(SHARED).toMatch(/needsUserBeats \/ lines\.length >= 0\.4/)
  })
})
