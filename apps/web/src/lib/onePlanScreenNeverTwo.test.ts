// THE PLAN SCREEN'S PROMISES, PINNED TO THE SOURCE THAT MAKES THEM.
//
// ⚠️ "ONE SCREEN, NEVER TWO" IS A CLAIM ABOUT THE FLOW, not about a component.
// A card that renders correctly in isolation while the questions render beside
// it has broken the promise anyway. So this reads the shipped file.
//
// ⚠️ AND IT COUNTS CODE, NEVER COMMENTS. This file's own subject is heavily
// commented, and the guard that greps for `plan` would match the paragraphs
// explaining it — the failure this repo has recorded twice, where a comment
// naming a field was counted as a reader of it. Whole-line comments are dropped
// before anything is matched.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const raw = (p: string) => readFileSync(join(REPO, p), 'utf8')

/** ⚖️ WHOLE-LINE COMMENTS ONLY — never everything after `//`, or a real call
 *  sitting after a string containing a URL would vanish and the guard would
 *  stop catching the thing it exists for. */
function codeOnly(src: string): string {
  return src.split('\n')
    .filter((l) => {
      const t = l.trim()
      return t !== '' && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')
}

const BUILDING = codeOnly(raw('apps/web/src/pages/v2/V2Building.tsx'))
const ANSWERS = codeOnly(raw('apps/web/src/lib/creatorAnswers.ts'))
const CARD = codeOnly(raw('apps/web/src/components/VideoPlanCard.tsx'))
const EDGE = codeOnly(raw('supabase/functions/generate-blueprint/index.ts'))

describe('one screen, never two', () => {
  it('renders the plan and the questions in ONE chain, so both cannot be open', () => {
    // `{plan ? (<VideoPlanCard …) : askQuestions ? (` — a ternary chain, not
    // two independent conditionals that could both be true.
    expect(BUILDING).toMatch(/\{plan \? \([\s\S]{0,600}?\) : askQuestions \? \(/)
  })

  it('sets the plan only where the question list came back empty', () => {
    // The pause sits AFTER the `ask.length` early return, so reaching it means
    // there is nothing left to ask.
    const askReturn = BUILDING.indexOf('if (ask.length && alive)')
    const planSet = BUILDING.indexOf('if (alive && !planSkipped() && !planShown(key))')
    expect(askReturn).toBeGreaterThan(-1)
    expect(planSet).toBeGreaterThan(askReturn)
  })
})

describe('it never blocks, and it never asks twice', () => {
  it('resumes the build from both buttons', () => {
    // Both the primary action and the opt-out continue — neither is a dead end.
    const resumes = BUILDING.match(/setRetryNonce\(\(n\) => n \+ 1\)/g) ?? []
    expect(resumes.length).toBeGreaterThanOrEqual(3) // questions + write + skip
  })

  it('honours the opt-out immediately rather than next time', () => {
    expect(BUILDING).toMatch(/skipPlanAlways\(\)[\s\S]{0,120}?setRetryNonce/)
  })

  it('remembers it was shown, so a reclaimed tab does not re-ask', () => {
    expect(BUILDING).toMatch(/markPlanShown\(key\)/)
    expect(BUILDING).toMatch(/sessionStorage\.getItem\(planSlot\(key\)\)/)
  })

  // ⚖️ THE OPT-OUT OUTLIVES THE TAB. A preference stored in sessionStorage
  // would forget itself every session, which is a worse tax than the screen.
  it('stores the preference in localStorage, not sessionStorage', () => {
    expect(BUILDING).toMatch(/localStorage\.setItem\(PLAN_SKIP_KEY/)
  })
})

describe('the third line cannot be a guess', () => {
  // ⚠️ THE CONSTRAINT PART 1 UNCOVERED. `loadKnowledgeCounts` selects `kind`
  // alone, which cannot answer "no numbers" because `carriesFigure` tests the
  // TEXT. The plan's own reader must select all three.
  it('reads kind, text AND source — not kind alone', () => {
    expect(ANSWERS).toMatch(/loadKnowledgeForPlan/)
    expect(ANSWERS).toMatch(/\.select\('kind, text, source'\)/)
  })

  // ⚠️⚠️ THE SECOND-AUTHORITY GUARD, AND THE REASON IT EXISTS. The first draft
  // of `loadKnowledgeForPlan` filtered by `voice_id`, took 500 rows and imposed
  // no ordering. The server does NONE of those, so the panel would have
  // reported on rows the writer never sees — predicting rather than reporting.
  // These pin the reads to each other rather than trusting they agree.
  it('mirrors the edge function\'s ordering and limits, both queries', () => {
    // The writer's input is a UNION of two reads; the plan must take both.
    expect(EDGE).toMatch(/\.order\('times_seen', \{ ascending: false \}\)\s*\n\s*\.limit\(40\)/)
    expect(ANSWERS).toMatch(/\.order\('times_seen', \{ ascending: false \}\)\s*\n\s*\.limit\(40\)/)

    expect(EDGE).toMatch(/\.eq\('source', 'asked'\)/)
    expect(ANSWERS).toMatch(/\.eq\('source', 'asked'\)/)
    expect(EDGE).toMatch(/\.order\('created_at', \{ ascending: false \}\)\s*\n\s*\.limit\(20\)/)
    expect(ANSWERS).toMatch(/\.order\('created_at', \{ ascending: false \}\)\s*\n\s*\.limit\(20\)/)
  })

  // ⚖️ THE SERVER READS ACROSS THE OWNER. Narrowing by voice here looks like an
  // improvement and would hide rows the writer still uses.
  it('does not filter the plan read by voice_id', () => {
    expect(ANSWERS).not.toMatch(/loadKnowledgeForPlan[\s\S]{0,1400}?\.eq\('voice_id'/)
  })

  // ⚠️ HALF AN ANSWER IS A WRONG ANSWER. If either query fails, the set is
  // unknown, and rendering the half that arrived shows a gap that exists only
  // because a query failed.
  it('returns null when either of the two reads fails', () => {
    expect(ANSWERS).toMatch(/if \(top\.error \|\| asked\.error\)/)
  })

  it('shows no plan at all when the knowledge read fails', () => {
    // `null` from the reader must not render as "I have nothing from you" —
    // that would be a claim about the creator made out of our own outage.
    expect(BUILDING).toMatch(/if \(items\) \{/)
    expect(ANSWERS).toMatch(/console\.warn\('\[plan\] knowledge not read'/)
  })

  it('derives the gaps in shared, never in the component', () => {
    // The card renders `buildVideoPlan`'s output; it does not decide anything.
    expect(CARD).toMatch(/buildVideoPlan/)
    expect(CARD).not.toMatch(/carriesFigure|isFirstPerson|SUBSTANCE_KINDS/)
  })

  // ⚠️ AND IT MUST NOT ASSERT A CAPABILITY IT CANNOT READ. `canShowProduct` is
  // not on `pre_script_brief`; passing a missing key would turn a lookup miss
  // into "they cannot film it". Unanswered is not no.
  it('does not pass canShowProduct from a key that does not exist', () => {
    expect(BUILDING).not.toMatch(/canShowProduct:/)
  })
})
