// THE BRIEF TOLD THE WRITER TO PRODUCE A TWO-BEAT SCRIPT.
//
// ⚠️ A REGRESSION I SHIPPED IN #736 AND FOUND BY MEASUREMENT, NOT BY A TEST.
// The substance budget reaches the brief as `availableBeats`, and the brief
// says "THERE IS ONLY ENOUGH SUBSTANCE FOR N BEATS. Write N and STOP" when N is
// below the target's floor. The guard I wrote was `enforceable ? beats : null`,
// reasoning that an unenforceable budget must not read as zero. That was true
// and it was the wrong case.
//
// `substanceBudgetInline` is `enforceable: true` when ANY of its three inputs
// is non-null, and `storeItems` is `knowledgeRows.length` — 0, not null, for a
// creator with an empty store. So the budget came out as exactly
// `FREE_BEATS_INLINE` and the brief read it as two beats' worth of substance.
//
// ⚠️⚠️ MEASURED IN PRODUCTION, WHICH IS WHY THIS WAS NOT HYPOTHETICAL:
//
//   · Of 85 generations carrying a reference, ZERO had an assessed structure
//     profile. `reference_content_profiles` is the SCRAPED GALLERY (1,772 rows,
//     every one a gallery item); `transcripts` is what CREATORS PASTE (395
//     rows, 35 owners, exactly 1 of them a gallery item). The two corpora are
//     disjoint BY DESIGN — two pipelines reading different videos — so
//     `substanceReferencePoints` has been null on every real generation.
//   · 24 of 52 creators have no `creator_knowledge` rows at all.
//
// For those creators the budget was always exactly the free beats, and the
// instruction that followed was to write two beats and stop.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { durationBudget, durationBrief } from '../script/durationContract'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

describe('a budget of only the free beats is not a finding', () => {
  it('the edge requires something to have been COUNTED, not merely enforceable', () => {
    // ⚖️ THE FIX IS AT THE COMPUTATION SITE. `availableBeats` means "how many
    // beats of counted substance exist"; if nothing was counted that is
    // unknown, not two.
    expect(EDGE).toMatch(/substanceBudgetComputed\.beats > FREE_BEATS_INLINE/)
    expect(EDGE).toMatch(/const availableBeats = countedSomething \? substanceBudgetComputed\.beats : null/)
  })

  it('and the old guard is gone, not merely supplemented', () => {
    // ⚠️ THE EXACT LINE THAT SHIPPED THE DEFECT. If it comes back, so does the
    // two-beat script.
    expect(EDGE).not.toMatch(/const availableBeats = substanceBudgetComputed\.enforceable \? substanceBudgetComputed\.beats : null/)
  })

  it('records why the reference half is structurally null', () => {
    // ⚖️ THE MEASUREMENT LIVES WITH THE FIX. A future reader asking "surely the
    // reference contributes?" gets the answer without re-deriving it.
    expect(EDGE).toMatch(/ZERO had an assessed structure profile/)
    expect(EDGE).toMatch(/disjoint by\s*\n\s*\/\/ design/)
  })
})

describe('what the creator would have been handed', () => {
  it('a two-beat budget at 60 seconds is below the floor and triggers STOP', () => {
    // ⚠️ THE SHIPPED BEHAVIOUR, PINNED SO THE SEVERITY IS NOT ARGUABLE. This is
    // what every creator with an empty knowledge store was about to get.
    const b = durationBudget(60)
    expect(b.minBeats).toBeGreaterThan(2)
    const bad = durationBrief({ pickedSeconds: 60 }, 'natural', { availableBeats: 2 })
    expect(bad).toMatch(/ONLY ENOUGH SUBSTANCE FOR 2 BEATS/)
    expect(bad).toMatch(/Write 2 and STOP/)
  })

  it('and null produces no such line at all', () => {
    // ⚖️ THE CORRECTED PATH. "Nobody counted" says nothing about length, which
    // is the honest brief for a budget with no evidence in it.
    const good = durationBrief({ pickedSeconds: 60 }, 'natural', { availableBeats: null })
    expect(good).not.toMatch(/ONLY ENOUGH SUBSTANCE/)
    expect(good).not.toMatch(/and STOP/)
    // The length contract itself is untouched — she still gets her 60 seconds.
    expect(good).toMatch(/This video runs 60 seconds/)
  })

  it('a real counted budget still shortens the script, which is the point', () => {
    // ⚠️ THE FIX MUST NOT DISABLE THE FEATURE. A creator whose store genuinely
    // supports 3 beats against a 90-second target should still be told to stop
    // at 3 — that is the ruling this brief exists to carry out.
    const text = durationBrief({ pickedSeconds: 90 }, 'natural', { availableBeats: 3 })
    expect(text).toMatch(/ONLY ENOUGH SUBSTANCE FOR 3 BEATS/)
  })
})
