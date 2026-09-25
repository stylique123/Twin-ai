// THE QUESTION RENDERED BEFORE THE OBJECTIVE, SO IT COULD NOT BE ABOUT IT.
//
// ⚠️ `assessReadiness` chooses the `claims` wording from `input.objective`:
//
//     if (field !== 'claims') return ASK[field] || null
//     return objectiveQuestion(input.objective, offerFormOf(input.offerEntityType))
//       ?? claimsQuestionFor(input.offer ?? input.offerNameForWording)
//
// V2Building sources that objective from `answersRef.current.video_goal`. The
// effect that does so runs ONLY inside this gate:
//
//     if (!askQuestions && !(intentAnswered && Object.keys(answersRef.current).length))
//
// ⚠️⚠️ SO BOTH ARMS YIELD THE GENERIC WORDING. `intentAnswered` false is the
// only way in, and it means `video_goal` is empty — the objective is absent BY
// THE VERY CONDITION that lets the wording be chosen. When it IS answered the
// block is skipped and no readiness question is computed at all. The ten
// objective-keyed wordings were unreachable on every first build in the
// product door: built correctly, selected by an input nothing could supply.
//
// ⚖️ THE FIX RE-DERIVES AT RENDER, from the chip the creator just tapped. The
// chips render above this question on the same card, so the sentence becomes
// the objective's own in front of her.
//
// ⚖️ EXECUTED, NOT READ. The expression lives inside a React component, so it
// is lifted into a function and RUN against the real shared helpers. A grep
// could not tell "reads the live answer" from "reads the frozen one".
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'
import {
  objectiveQuestion, offerFormOf, OBJECTIVE_QUESTIONS, PRODUCT_CHOICE_FIELD,
  nextObjectiveQuestion, answeredForProduct, pooledWording, promotedObjectiveQuestion,
} from '@twinai/shared'
import { assessReadiness } from '@twinai/shared'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SRC = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')

// ── PART 1: THE DEFECT, AS BEHAVIOUR ─────────────────────────────────────
//
// These execute the real `assessReadiness`. They prove the objective is what
// selects the wording, so an absent objective is not a cosmetic miss — it is
// the difference between ten questions and one.
describe('the objective is what makes the claims question specific', () => {
  const base = {
    goal: 'SELL', offer: null, angle: 'a', relationship: 'OWN_PRODUCT',
    cta: 'buy', audience: 'makers', promoting: true,
  } as unknown as Parameters<typeof assessReadiness>[0]

  const claimsQuestionOf = (extra: Record<string, unknown>): string | null => {
    const v = assessReadiness({ ...base, ...extra } as typeof base)
    const f = v.fields.find((x) => x.field === 'claims')
    return f?.question ?? null
  }

  it('without an objective it is the generic sentence — the pre-fix state', () => {
    const q = claimsQuestionOf({ objective: null, claims: null })
    // Whatever the generic wording is, it is NOT one of the ten.
    const ten = Object.values(OBJECTIVE_QUESTIONS).map((o) => o?.question)
    expect(q, 'claims was not asked at all; the fixture no longer exercises it').toBeTruthy()
    expect(ten).not.toContain(q)
  })

  it('with an objective it is that objective’s own sentence', () => {
    const goals = Object.keys(OBJECTIVE_QUESTIONS)
    expect(goals.length, 'no objectives to test').toBeGreaterThan(0)
    for (const g of goals) {
      const q = claimsQuestionOf({ objective: g, claims: null })
      expect(q, `objective ${g} did not reach the wording`).toBe(objectiveQuestion(g, null))
    }
  })

  it('the ten sentences are distinct, so the objective actually changes the ask', () => {
    const qs = Object.keys(OBJECTIVE_QUESTIONS).map((g) => objectiveQuestion(g, null))
    expect(new Set(qs).size).toBe(qs.length)
  })
})

// ── PART 2: THE CARD RE-DERIVES IT LIVE ──────────────────────────────────
describe('the card re-derives the claims wording from the live objective', () => {
  interface P { id?: string; type?: string | null }
  type Fn = (a: {
    isProductSubject: boolean
    askAnswers: Record<string, string>
    products: readonly P[] | null
    selectedProductId: string | null
  }) => string | null

  /** ⚠️ THE REAL EXPRESSION, LIFTED AND RUN. Bounded on the declaration's own
   *  closing `: null`, so the next statement is not swallowed. */
  function loadFn(): Fn {
    // Re-pointed: the block now starts at `liveProductId`, because the wording
    // is chosen from the rotating pool first (objectiveQuestionPool.ts); the
    // end is still the declaration's own closing `: null`.
    const decl = SRC.indexOf('const liveClaimsQuestion = ')
    expect(decl, 'liveClaimsQuestion not found').toBeGreaterThan(-1)
    const start = SRC.indexOf('const liveProductId = ')
    expect(start, 'liveProductId not found').toBeGreaterThan(-1)
    expect(start).toBeLessThan(decl)
    const end = SRC.indexOf('\n    : null\n', decl) + '\n    : null\n'.length
    expect(end).toBeGreaterThan(start)
    const block = SRC.slice(start, end)
    const js = transformSync(`function __live(__a) {
      const { isProductSubject, askAnswers, products, selectedProductId } = __a
      const state = { selected_product_id: selectedProductId }
      // Nothing answered yet: rotation yields each pool's first question,
      // which is the objective's original wording.
      const objectiveAnswers = []
      ${block}
      return liveClaimsQuestion
    }`, { loader: 'ts', format: 'cjs' }).code
    // The real helpers are injected — the point is that the card calls THESE,
    // not a private copy of the wording.
    // eslint-disable-next-line no-new-func
    return new Function(
      'objectiveQuestion', 'offerFormOf', 'pickedProduct', 'PRODUCT_CHOICE_FIELD',
      'nextObjectiveQuestion', 'answeredForProduct', 'pooledWording', 'promotedObjectiveQuestion',
      `${js}; return __live`,
    )(objectiveQuestion, offerFormOf, pickedProduct, PRODUCT_CHOICE_FIELD,
      nextObjectiveQuestion, answeredForProduct, pooledWording, promotedObjectiveQuestion) as Fn
  }

  /** The card's own `pickedProduct`, lifted the same way. */
  function pickedProduct(products: readonly P[] | null, id: string | null): P | null {
    if (!products?.length || !id) return null
    return products.find((p) => p.id === id) ?? null
  }

  const live = loadFn()
  const anyGoal = Object.keys(OBJECTIVE_QUESTIONS)[0]

  it('returns the objective’s sentence once the chip is tapped', () => {
    expect(live({
      isProductSubject: true, askAnswers: { video_goal: anyGoal },
      products: null, selectedProductId: null,
    })).toBe(objectiveQuestion(anyGoal, null))
  })

  it('returns null before the chip is tapped, so the server wording stands', () => {
    expect(live({
      isProductSubject: true, askAnswers: {}, products: null, selectedProductId: null,
    })).toBeNull()
  })

  it('returns null outside the product door, whatever the goal says', () => {
    expect(live({
      isProductSubject: false, askAnswers: { video_goal: anyGoal },
      products: null, selectedProductId: null,
    })).toBeNull()
  })

  it('reads the product picked ON THIS CARD, which the frozen verdict could not', () => {
    // A SERVICE takes the `whenPerformed` variant wherever one exists.
    const performed = Object.entries(OBJECTIVE_QUESTIONS)
      .find(([, o]) => o?.whenPerformed)
    expect(performed, 'no performed variant exists to discriminate on').toBeTruthy()
    const [goal] = performed as [string, { whenPerformed?: string }]
    const got = live({
      isProductSubject: true,
      askAnswers: { video_goal: goal, [PRODUCT_CHOICE_FIELD]: 'p2' },
      products: [{ id: 'p1', type: 'PHYSICAL' }, { id: 'p2', type: 'SERVICE' }],
      selectedProductId: null,
    })
    expect(got).toBe(objectiveQuestion(goal, 'performed'))
    expect(got).not.toBe(objectiveQuestion(goal, null))
  })

  it('falls back to the route’s product when the card asked nothing', () => {
    const performed = Object.entries(OBJECTIVE_QUESTIONS)
      .find(([, o]) => o?.whenPerformed) as [string, unknown]
    const [goal] = performed
    expect(live({
      isProductSubject: true, askAnswers: { video_goal: goal },
      products: [{ id: 'p9', type: 'SERVICE' }], selectedProductId: 'p9',
    })).toBe(objectiveQuestion(goal, 'performed'))
  })

  it('an objective with no question of its own still returns null', () => {
    expect(live({
      isProductSubject: true, askAnswers: { video_goal: 'NOT_A_REAL_GOAL' },
      products: null, selectedProductId: null,
    })).toBeNull()
  })
})

// ── PART 3: THE RENDERER USES IT, AND THE CHIPS COME FIRST ───────────────
describe('the renderer prefers the live wording, and the chips render above it', () => {
  it('the claims question renders the live wording with the server’s as fallback', () => {
    expect(SRC).toMatch(
      /q\.field === 'claims' \? \(liveClaimsQuestion \?\? q\.question\) : q\.question/)
  })

  it('the decisions block renders before the commercial block', () => {
    // ⚖️ THIS IS WHY RE-DERIVING WORKS AT ALL. If the claims question sat above
    // the objective chip, the creator would read the generic sentence, tap the
    // chip below it, and watch a question she had already answered change.
    // Re-pointed: both now filter `visibleAsk` (item 25's live picker visibility).
    // Re-pointed again: on the objective's own step both are narrowed first
    // (`onAnswerStep ? ...`), so the anchors are the declarations themselves.
    const decisions = SRC.indexOf('const decisions = ')
    const commercial = SRC.indexOf('const commercial = ')
    expect(decisions).toBeGreaterThan(-1)
    expect(decisions).toBeLessThan(commercial)
  })
})
