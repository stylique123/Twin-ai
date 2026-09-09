// THE PRODUCT DOOR ASKED A QUESTION ABOUT EVERYTHING EXCEPT THE PRODUCT.
//
// ⚠️ "Reach more people" AND "Build trust and reputation" ARE TRUE OF EVERY
// VIDEO a creator will ever make. In the product door they ask her to translate
// something she already knows — what this product needs right now — into our
// vocabulary. The owner's reframe for the four doors is exactly this: the mode
// is not "what is my video about", it is "what have I got in my hand right now."
//
// ⚖️ AND THIS IS A PRESENTATION OF THE SAME QUESTION, NOT A SECOND VOCABULARY.
// Nothing downstream learns a new word: the objective resolves to a canonical
// `VideoGoal` before the request is built, and `generate-blueprint` is
// untouched. A parallel field would fork a vocabulary three surfaces already
// share and that `videoIntent.ts` exists to keep singular.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  intentQuestionsFor, INTENT_QUESTIONS, PRODUCT_OBJECTIVES,
  PRODUCT_OBJECTIVE_QUESTION, VIDEO_GOALS, CANONICAL_GOAL_LABELS,
  type IntentQuestion,
} from '../videoIntent'

// ⚠️ TYPED AS `IntentQuestion`, AND THE FIRST DRAFT WAS NOT. It read
// `readonly { field: string }[]`, which narrowed the return to a shape with no
// `question` or `options` — vitest ran green because it does not typecheck, and
// `check_test_typecheck_ratchet` failed the build with seven TS2339s. The
// ratchet's ceiling is zero excluded files, so a test that does not compile is
// a broken build rather than a passing suite.
const goalQ = (qs: readonly IntentQuestion[]) => qs.find((q) => q.field === 'video_goal')

describe('every objective changes what gets written', () => {
  it('each maps to a DISTINCT canonical goal', () => {
    // ⚠️⚠️ THE HONESTY CONSTRAINT, AND THE REASON THIS TEST EXISTS. The
    // writer's contract is keyed on `VideoGoal` — the goal directive, the
    // implied outcome, the payoff directive, the substance floor and
    // `outcomeEvidenceNeed` all read it. Two objectives collapsing to one goal
    // would show her a distinction that changes nothing about the script: a
    // choice with no consequence, which is worse than not offering it.
    const values = PRODUCT_OBJECTIVES.map((o) => o.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('each is a real goal the writer already knows', () => {
    // ⚠️ AN INVENTED VALUE WOULD REACH `generate-blueprint` AND MATCH NOTHING.
    // The same shape as the enum trap elsewhere in this codebase, where an
    // invented relationship made a lookup return undefined rather than throw.
    for (const o of PRODUCT_OBJECTIVES) {
      expect(VIDEO_GOALS as readonly string[], o.value).toContain(o.value)
    }
  })

  it('does not simply relabel the generic sheet', () => {
    // ⚖️ IF THE LABELS MATCHED THE CANONICAL ONES this would be a rename, not a
    // reframe, and the creator would gain nothing.
    for (const o of PRODUCT_OBJECTIVES) {
      expect(o.label).not.toBe(CANONICAL_GOAL_LABELS[o.value as keyof typeof CANONICAL_GOAL_LABELS])
    }
  })

  it('every objective reads as something a product needs, not as a metric', () => {
    for (const o of PRODUCT_OBJECTIVES) {
      expect(o.label.length).toBeGreaterThan(6)
      expect(o.hint, o.label).toBeTruthy()
      // Plain English: our internal words never reach her.
      expect(`${o.label} ${o.hint}`).not.toMatch(/goal|objective|canonical|beat|corpus|entity/i)
    }
  })
})

describe('the substitution applies wherever the product is the subject', () => {
  it('replaces the goal question in a product build WITH a reference', () => {
    // ⚠️ A PRODUCT BUILD WITH A REFERENCE IS STILL A PRODUCT BUILD. The
    // reference says what SHAPE the video takes and nothing about what the
    // product needs, so gating this on `hasReference` would leave the generic
    // sheet for creators who came through the product door carrying a video.
    const q = goalQ(intentQuestionsFor({ hasReference: true, isProductSubject: true }))!
    expect(q.question).toBe(PRODUCT_OBJECTIVE_QUESTION)
    expect(q.options).toBe(PRODUCT_OBJECTIVES)
  })

  it('replaces it in a product build with NO reference — the commonest one', () => {
    // ⚠️⚠️ THIS BRANCH WAS WRONG IN THE FIRST DRAFT AND `tsc` COULD NOT SEE IT.
    // The idea-mode return read `INTENT_QUESTIONS.filter(...)` rather than the
    // substituted list, so a product build with nothing pasted — the commonest
    // product build there is — silently got the generic sheet back. Found by
    // reading the branch below the one I edited, not by a test that existed.
    const q = goalQ(intentQuestionsFor({ hasReference: false, isProductSubject: true }))!
    expect(q.question).toBe(PRODUCT_OBJECTIVE_QUESTION)
    expect(q.options).toBe(PRODUCT_OBJECTIVES)
  })

  it('leaves every other question alone', () => {
    const withProduct = intentQuestionsFor({ hasReference: true, isProductSubject: true })
    for (const q of withProduct) {
      if (q.field === 'video_goal') continue
      expect(q).toBe(INTENT_QUESTIONS.find((o) => o.field === q.field))
    }
  })

  it('and idea mode still drops the questions it always dropped', () => {
    const fields = intentQuestionsFor({ hasReference: false, isProductSubject: true }).map((q) => q.field)
    expect(fields).not.toContain('reference_use')
    expect(fields).not.toContain('content_focus')
  })
})

describe('a door nobody stated is not a product door', () => {
  it('an absent flag leaves the generic sheet exactly as it was', () => {
    // ⚖️ `readEntryDoor` REFUSES TO INFER 'product' FROM TEXT for a stated
    // reason — a product build inherits claim entitlement, and a wrong guess
    // there is a legal exposure rather than a worse question. This function
    // must not reintroduce the guess it declined to make.
    const q = goalQ(intentQuestionsFor({ hasReference: true }))!
    expect(q.options).toBe(INTENT_QUESTIONS.find((o) => o.field === 'video_goal')!.options)
    expect(q.question).not.toBe(PRODUCT_OBJECTIVE_QUESTION)
  })

  it('explicitly false behaves like absent', () => {
    expect(goalQ(intentQuestionsFor({ hasReference: true, isProductSubject: false }))!.question)
      .not.toBe(PRODUCT_OBJECTIVE_QUESTION)
  })
})

// ── AND THE SCREENS CARRY THE FACT ────────────────────────────────────────
const dir = dirname(fileURLToPath(import.meta.url))
const CREATE = readFileSync(join(dir, '..', '..', '..', '..', 'apps', 'web', 'src', 'pages', 'v2', 'V2Create.tsx'), 'utf8')
const BUILDING = readFileSync(join(dir, '..', '..', '..', '..', 'apps', 'web', 'src', 'pages', 'v2', 'V2Building.tsx'), 'utf8')

describe('the door travels, because it cannot be inferred', () => {
  it('V2Create puts it in nav state', () => {
    // ⚠️ THE BUILD SCREEN USED TO INFER THE MODE FROM WHETHER A LINK WAS
    // PASTED, which cannot tell the product door from the idea door at all —
    // both arrive with no reference.
    const nav = CREATE.slice(CREATE.indexOf('buildFieldsForDoor(door, t)'))
    expect(nav.slice(0, 800)).toMatch(/^\s*door,$/m)
  })

  it('V2Building reads it, and a tapped product counts too', () => {
    expect(BUILDING).toMatch(/isProductSubject: state\.door === 'product' \|\| !!state\.selected_product_id/)
  })

  it('the build screen never guesses the door from text', () => {
    const call = BUILDING.slice(BUILDING.indexOf('intentQuestionsFor({'))
    expect(call.slice(0, 700)).not.toMatch(/looksLikeLink|readEntryDoor\(/)
  })
})
